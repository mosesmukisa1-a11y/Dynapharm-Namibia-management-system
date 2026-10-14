import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { getMany } from '../db.js';
import { ALL_BRANCH_IDS, normalizeBranchSlug,branchSearchTerms } from '../_lib/branchUtils.js';
import {getStockCostProjection} from '../services/stockCostReporting.js';
import { getStockAlertPolicy } from '../services/stockAlertPolicy.js';
import { movementSaleEvidence, isSaleMovement } from '../services/saleEvidence.js';
import { businessDatePredicate, validateBusinessDates } from '../services/businessDates.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!req.user) return res.status(401).json({success:false,error:'Authentication required'});
  const role=String(req.user.role || '').trim().toLowerCase();
  const branchScoped=['branch','branch_manager','branch_staff','branch_sales','dispenser',
    'consultant','frontdesk','stock_manager'].includes(role);
  if(!branchScoped && !['stock','finance','finance_manager','mis','gm','general_manager',
    'director','admin','superadmin','super_admin'].includes(role))
    return res.status(403).json({success:false,error:'Stock reporting access required'});

  try {
    const alertPolicy = await getStockAlertPolicy();
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const dateFrom = url.searchParams.get('date_from') || null;
    const dateTo = url.searchParams.get('date_to') || null;
    validateBusinessDates(dateFrom,dateTo);
    const branchFilterRaw = url.searchParams.get('branch') || null;
    let branchFilter = branchFilterRaw ? (normalizeBranchSlug(branchFilterRaw) || branchFilterRaw) : null;
    if(branchScoped){
      const scope=getBranchScope({...req.user,role:'branch_manager'});
      const allowed=new Set((scope.branches || []).map(normalizeBranchSlug));
      if(!allowed.size)return res.status(403).json({success:false,error:'An assigned branch is required'});
      branchFilter=branchFilter || normalizeBranchSlug(scope.primaryBranch) || [...allowed][0];
      if(!allowed.has(branchFilter))
        return res.status(403).json({success:false,error:'Access to this branch is not permitted'});
    }

    const branchInventory = await getMany(
      `SELECT * FROM branch_inventory_batches ORDER BY branch_id, product_name, expiry_date ASC NULLS LAST`
    );

    let bimQuery = `SELECT branch_id, product_name, batch_no, reference, type, SUM(quantity) as total_qty, MAX(created_at) as last_date, (array_agg(DISTINCT source_branch_id))[1] as source,
      SUM((metadata->'sale_evidence'->>'dp_value')::numeric) AS sale_dp,
      SUM((metadata->'sale_evidence'->>'charged_value')::numeric) AS sale_charged,
      SUM(CASE WHEN metadata->'sale_evidence'->>'dp_value' IS NULL THEN ABS(quantity) ELSE 0 END) AS missing_sale_dp
      FROM branch_inventory_movements`;
    const bimParams = [];
    const bimWhere = [];
    if (dateFrom) { bimParams.push(dateFrom); bimWhere.push(businessDatePredicate('created_at',`$${bimParams.length}`)); }
    if (dateTo) { bimParams.push(dateTo); bimWhere.push(businessDatePredicate('created_at',`$${bimParams.length}`,true)); }
    if (branchFilter) { bimParams.push(branchFilter); bimWhere.push(`branch_id = $${bimParams.length}`); }
    if (bimWhere.length) bimQuery += ' WHERE ' + bimWhere.join(' AND ');
    bimQuery += ' GROUP BY branch_id, product_name, batch_no, reference, type';
    const bimAgg = await getMany(bimQuery, bimParams);

    // For opening-qty calculation: fetch individual movements BEFORE date_from.
    // opening = pre_period_in − pre_period_out, independent of closing_today and date_to.
    // De-duplication: BIM rows whose `reference` matches an SM `reference_id` are mirrors
    // (all current write paths write both tables). BIM rows with no SM match are genuine
    // BIM-only events (historical data before SM dual-write was introduced) and ARE included.
    let bimPrePeriodRows = [];
    let smPrePeriodRows  = [];
    if (dateFrom) {
      const smPrePs = [dateFrom];
      let smPreQ = `SELECT movement_type, quantity, source_location, destination_location, reference_id, product_name, batch_no FROM stock_movements WHERE status IN ('posted','approved') AND created_at < ($1::date::timestamp AT TIME ZONE 'Africa/Windhoek')`;
      if (branchFilter) { smPrePs.push(branchFilter); smPrePs.push(`quarantine:${branchFilter}`); smPreQ += ` AND (source_location IN ($${smPrePs.length - 1},$${smPrePs.length}) OR destination_location IN ($${smPrePs.length - 1},$${smPrePs.length}))`; }

      const bimPrePs = [dateFrom];
      let bimPreQ = `SELECT branch_id, type, quantity, reference, product_name, batch_no FROM branch_inventory_movements WHERE created_at < ($1::date::timestamp AT TIME ZONE 'Africa/Windhoek')`;
      if (branchFilter) { bimPrePs.push(branchFilter); bimPreQ += ` AND branch_id = $${bimPrePs.length}`; }

      [smPrePeriodRows, bimPrePeriodRows] = await Promise.all([
        getMany(smPreQ, smPrePs),
        getMany(bimPreQ, bimPrePs),
      ]);
    }

    let smQuery = `SELECT id,product_name, batch_no, expiry_date, movement_type, quantity, source_location, destination_location, reference_id, notes, created_by, created_at,unit_dp,metadata FROM stock_movements`;
    const smParams = [];
    const smWhere = ["status IN ('posted','approved')"];
    if (dateFrom) { smParams.push(dateFrom); smWhere.push(businessDatePredicate('created_at',`$${smParams.length}`)); }
    if (dateTo) { smParams.push(dateTo); smWhere.push(businessDatePredicate('created_at',`$${smParams.length}`,true)); }
    if (branchFilter) {
      smParams.push(branchFilter); smParams.push(`quarantine:${branchFilter}`);
      smWhere.push(`(source_location IN ($${smParams.length - 1},$${smParams.length}) OR destination_location IN ($${smParams.length - 1},$${smParams.length}))`);
    }
    if (smWhere.length) smQuery += ' WHERE ' + smWhere.join(' AND ');
    smQuery += ' ORDER BY created_at DESC';
    const stockMovements = await getMany(smQuery, smParams);

    let salesQuery = `SELECT id, branch_id, sale_date, customer_type, total, items, created_by, created_at FROM branch_walkin_sales`;
    const salesParams = [];
    const salesWhere = ["status='completed'"];
    if (dateFrom) { salesParams.push(dateFrom); salesWhere.push(businessDatePredicate('sale_date',`$${salesParams.length}`)); }
    if (dateTo) { salesParams.push(dateTo); salesWhere.push(businessDatePredicate('sale_date',`$${salesParams.length}`,true)); }
    if (branchFilter) { salesParams.push(branchFilter); salesWhere.push(`branch_id = $${salesParams.length}`); }
    if (salesWhere.length) salesQuery += ' WHERE ' + salesWhere.join(' AND ');
    salesQuery += ' ORDER BY created_at DESC';
    const salesRows = await getMany(salesQuery, salesParams);

    const branchMap = {};

    const ensureBranch = (rawKey) => {
      if (!rawKey) return null;
      const key = normalizeBranchSlug(rawKey) || rawKey;
      if (!branchMap[key]) {
        branchMap[key] = {
          branch_id: key,
          inventory: [],
          qty_received: 0,
          qty_sold: 0,
          qty_dispensed: 0,
          qty_transferred_in: 0,
          qty_transferred_out: 0,
          qty_written_off: 0,
          qty_returned: 0,
          qty_adjusted: 0,
          sales_revenue: 0,
          sales_dp_value:0, customer_charged_revenue:0,missing_sales_dp_qty:0,
          sales_count: 0,
          closing_qty: 0,
          dp_value: 0,
          cif_value: 0,
          product_count: 0,
          expiring_qty: 0,
          expired_qty: 0,
          low_stock_count: 0,
          movements: [],
          source_warehouse: null,
          last_movement: null,
        };
      }
      return branchMap[key];
    };

    const seedBranches = branchFilter ? [branchFilter] : ALL_BRANCH_IDS;
    for (const id of seedBranches) ensureBranch(id);

    const now = new Date();
    const thirtyFwd = new Date(Date.now() + alertPolicy.expiryWarningDays * 24 * 60 * 60 * 1000);

    for (const inv of branchInventory) {
      if (!inv.branch_id) continue;
      if (branchFilter && (normalizeBranchSlug(inv.branch_id) || inv.branch_id) !== branchFilter) continue;
      const br = ensureBranch(inv.branch_id);
      const qty = Number(inv.quantity || 0);
      br.inventory.push({
        id: inv.id,
        product_name: inv.product_name || inv.description,
        description: inv.description || inv.product_name,
        batch_no: inv.batch_no,
        expiry_date: inv.expiry_date ? (inv.expiry_date instanceof Date ? inv.expiry_date.toISOString().slice(0,10) : String(inv.expiry_date).slice(0,10)) : null,
        quantity: qty,
        unit_price: inv.unit_price !== null ? Number(inv.unit_price) : null,
        status: inv.status,
        source_warehouse: inv.source_warehouse || null,
        created_at: inv.created_at,
      });
      br.closing_qty += qty;
      if (inv.expiry_date) {
        const exp = new Date(inv.expiry_date);
        if (exp < now && qty > 0) br.expired_qty += qty;
        else if (exp <= thirtyFwd && qty > 0) br.expiring_qty += qty;
      }
      if (qty > 0 && qty < alertPolicy.lowStockThreshold) br.low_stock_count++;
    }

    const smSaleBranches = new Set(),bimSaleBranches = new Set(),periodMirrorQuantities = new Map();
    // Quarantine is still physically owned at its original branch. Transit is not.
    const norm = (s) => (s || '').replace(/^quarantine:/i,'').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const conditionShift = sm => norm(sm.source_location) && norm(sm.source_location)===norm(sm.destination_location)
      && [sm.source_location,sm.destination_location].some(location=>/^quarantine:/i.test(location || ''));
    const periodMirrorKey=(branch,reference,product,batch,type)=>JSON.stringify([branch,reference,product || '',batch || '',type]);
    // Include owned reservations and segregated stock, not just available batches.
    for(const br of Object.values(branchMap)){
      br.closing_qty=0;br.dp_value=0;br.cif_value=0;
      br.available_qty=0;br.quarantined_qty=0;br.reserved_qty=0;
      br.physical_inventory=[];
      br.missing_cost_qty=0;br.missing_dp_qty=0;
    }
    for(const layer of await getStockCostProjection({locations:branchFilter?branchSearchTerms(branchFilter):null,branchOnly:true})){
      const key=normalizeBranchSlug(layer.location) || norm(layer.location);
      const br=branchMap[key];
      if(br && !layer.inTransitQty){
        br.physical_inventory.push({
          id:layer.id,product_name:layer.productName,batch_no:layer.batchNo,expiry_date:layer.expiryDate,
          quantity:layer.onHandQty,available_qty:layer.availableQty,reserved_qty:layer.reservedQty,
          quarantined_qty:layer.quarantinedQty,expired_qty:layer.expiredQty,condition:layer.condition,
          unit_dp:layer.unitDPC,unit_cif:layer.unitCIF,dp_value:layer.onHandQty*(layer.unitDPC ?? 0),
          cif_value:layer.onHandQty*(layer.unitCIF ?? 0),source_batch_id:layer.sourceBatchId,
        });
        br.closing_qty+=layer.onHandQty;br.available_qty+=layer.availableQty;
        br.quarantined_qty+=layer.quarantinedQty;br.reserved_qty+=layer.reservedQty;
        br.cif_value+=layer.onHandQty*(layer.unitCIF ?? 0);
        br.dp_value+=layer.onHandQty*(layer.unitDPC ?? 0);
        br.missing_cost_qty+=layer.missingCostQuantity;br.missing_dp_qty+=layer.missingDPCQuantity;
      }
    }

    for (const sm of stockMovements) {
      const src = norm(sm.source_location);
      const dst = norm(sm.destination_location);
      const q = Math.abs(Number(sm.quantity || 0));
      const t = (sm.movement_type || '').toLowerCase();
      if(sm.reference_id && t!=='reserved') for(const location of new Set([src,dst])) {
        const key=periodMirrorKey(normalizeBranchSlug(location) || location,sm.reference_id,sm.product_name,sm.batch_no,t);
        periodMirrorQuantities.set(key,(periodMirrorQuantities.get(key) || 0)+q);
      }
      const fmtDt = (d) => d instanceof Date ? d.toISOString() : d;
      const movRecord = {
        product_name: sm.product_name,
        batch_no: sm.batch_no,
        expiry_date: sm.expiry_date ? (sm.expiry_date instanceof Date ? sm.expiry_date.toISOString().slice(0,10) : String(sm.expiry_date).slice(0,10)) : null,
        movement_type: sm.movement_type,
        quantity: Number(sm.quantity || 0),
        source_location: sm.source_location,
        destination_location: sm.destination_location,
        reference_id: sm.reference_id,
        notes: sm.notes,
        created_by: sm.created_by,
        created_at: fmtDt(sm.created_at),
        unit_dp:sm.unit_dp == null ? null : Number(sm.unit_dp),
        ...movementSaleEvidence(sm),
      };

      const isBranchLoc = (loc) => loc && !loc.startsWith('in_transit') && !loc.includes('warehouse') && loc !== 'country_stock' && loc !== 'branch' && loc !== 'written_off' && loc !== 'customer' && loc !== 'patient';

      const isWarehouseLoc = (loc) => !loc || loc.includes('warehouse') || loc === 'country_stock';

      if (isBranchLoc(dst)) {
        const br = ensureBranch(dst);
        br.movements.push(movRecord);
        if (conditionShift(sm)) continue;
        // Warehouse dispatch/transfer to branch → qty_transferred_in only (not also qty_received)
        if ((t === 'transfer_out' && isWarehouseLoc(src)) || t === 'dispatched' ||
            t === 'warehouse_dispatch' || t === 'country_release') {
          br.qty_transferred_in += q;
          if (sm.source_location) br.source_warehouse = sm.source_location;
        }
        // Direct receipts (branch_receipt, import, transfer_in) → qty_received only
        else if (t === 'transfer_in' || t === 'received' || t === 'receive' ||
                 t === 'branch_receipt' || t === 'import_received' || t === 'transit_receipt') {
          br.qty_received += q;
          if (sm.source_location) br.source_warehouse = sm.source_location;
        }
        else if (t === 'positive_adjustment') br.qty_adjusted += q;
        else if (t === 'return' || t === 'return_in' || t === 'refund_return') br.qty_returned += q;
        const ld = fmtDt(sm.created_at);
        if (!br.last_movement || (ld && ld > br.last_movement)) br.last_movement = ld;
      }
      if (isBranchLoc(src)) {
        const br = ensureBranch(src);
        if(isSaleMovement(t)){
          br.sales_dp_value+=movRecord.dp_value ?? 0;
          br.missing_sales_dp_qty+=movRecord.dp_value==null ? q : 0;
          br.customer_charged_revenue+=movRecord.charged_value ?? 0;
        }
        if (!br.movements.includes(movRecord)) br.movements.push(movRecord);
        if (t === 'transfer_out' || t === 'dispatched' || t === 'transit_dispatch') br.qty_transferred_out += q;
        else if (t === 'write_off' || t === 'field_use') br.qty_written_off += q;
        else if (t === 'negative_adjustment') br.qty_adjusted -= q;
        else if (t === 'campaign_free_item') {br.qty_sold += q;smSaleBranches.add(src);}
        else if (t === 'sale' || t === 'campaign_sale' || t.includes('sale')) {br.qty_sold += q;smSaleBranches.add(src);}
        else if (t === 'dispense' || t === 'prescription_dispense') br.qty_dispensed += q;
        else if (t === 'positive_adjustment' || t === 'adjustment') br.qty_adjusted += q;
        const ld = fmtDt(sm.created_at);
        if (!br.last_movement || (ld && ld > br.last_movement)) br.last_movement = ld;
      }
    }

    for (const agg of bimAgg) {
      const normBimId = normalizeBranchSlug(agg.branch_id) || norm(agg.branch_id);
      const matchedQuantity=periodMirrorQuantities.get(periodMirrorKey(normBimId,agg.reference,agg.product_name,agg.batch_no,(agg.type || '').toLowerCase()));
      if (agg.reference && matchedQuantity!=null && Math.abs(matchedQuantity-Math.abs(Number(agg.total_qty || 0)))<1e-8) continue;
      const br = ensureBranch(agg.branch_id);
      // Use Math.abs: direction is encoded in the type, not the stored quantity sign.
      const q = Math.abs(Number(agg.total_qty || 0));
      const t = (agg.type || '').toLowerCase();
      if(isSaleMovement(t)){
        br.sales_dp_value+=Number(agg.sale_dp ?? 0);
        br.customer_charged_revenue+=Number(agg.sale_charged ?? 0);
        br.missing_sales_dp_qty+=Number(agg.missing_sale_dp || 0);
      }
      if (t === 'receive' || t === 'received' || t === 'stock_receipt' || t === 'transfer_in') {
        br.qty_received += q;
        if (agg.source) br.source_warehouse = agg.source;
      }
      else if (t === 'sale' || t === 'walkin_sale' || t === 'walkin_member_sale' || t === 'walkin_non_member_sale' ||
               t === 'walk_in_member_sale' || t === 'walk_in_non_member_sale' ||
                t === 'campaign_sale' || t === 'online_order_sale' || t === 'online_order_fulfilment') {br.qty_sold += q;bimSaleBranches.add(normBimId);}
      else if (t === 'campaign_free_item') {br.qty_sold += q;bimSaleBranches.add(normBimId);}
      else if (t === 'dispense' || t === 'prescription_dispense') br.qty_dispensed += q;
      else if (t === 'transfer_out' || t === 'transfer') br.qty_transferred_out += q;
      else if (t === 'write_off' || t === 'field_use') br.qty_written_off += q;
      else if (t === 'negative_adjustment') br.qty_adjusted -= q;
      else if (t === 'return' || t === 'return_in' || t === 'refund_return') br.qty_returned += q;
      else if (t === 'adjustment') br.qty_adjusted += Number(agg.total_qty || 0);
      else if (t === 'positive_adjustment') br.qty_adjusted += q;
      const ld = agg.last_date instanceof Date ? agg.last_date.toISOString() : agg.last_date;
      if (!br.last_movement || (ld && ld > br.last_movement)) br.last_movement = ld;
    }

    for (const sale of salesRows) {
      const brId = norm(sale.branch_id);
      if (!brId) continue;
      const br = ensureBranch(brId);
      br.sales_count++;
      // Customer receipts are deliberately not a stock/DP total.
      if (!smSaleBranches.has(brId) && !bimSaleBranches.has(brId)) {
        let items = [];
        try { items = typeof sale.items === 'string' ? JSON.parse(sale.items) : (sale.items || []); } catch {}
        const saleQty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
        br.qty_sold += saleQty;
      }
    }

    // Build per-branch opening-quantity from movements BEFORE date_from.
    // opening = max(0, net) where net = sum_of_inward − sum_of_outward.
    // No dependency on closing_today or date_to.
    //
    // SM rows: quantities are stored as positive magnitudes; direction comes from
    //   source/destination location classification.
    // BIM rows: quantities are SIGNED (e.g. `adjustment` stores newQty−oldQty).
    //   Direction is determined by the quantity sign — NOT forced via Math.abs —
    //   so a negative adjustment correctly reduces the opening balance.
    //
    // De-duplication: all current write paths write both an SM row and a BIM mirror
    // that share the same reference/reference_id. SM rows are always included; BIM
    // rows are included only when their `reference` does NOT match any SM reference_id
    // (genuine BIM-only events: api/branch/inventory.js adjustments/transfers, and
    // historical BIM rows from before SM dual-write was introduced).
    const openingNet = {}; // branch_id → signed net qty (in = positive, out = negative)
    const ensureOpeningNet = (bid) => { if (!(bid in openingNet)) openingNet[bid] = 0; };

    if (dateFrom) {
      const isBranchLocO   = (loc) => loc && !loc.includes('warehouse') && loc !== 'country_stock' && loc !== 'branch' && loc !== 'written_off' && loc !== 'customer' && loc !== 'patient';
      const isWarehouseLocO = (loc) => !loc || loc.includes('warehouse') || loc === 'country_stock';

      // Step 1: classify ALL SM pre-period rows (magnitudes, direction from location).
      // Build composite dedup keys: reference_id + branch + product + batch, so that
      // a transfer reference shared by multiple items/branches only suppresses the
      // specific BIM rows that truly have SM mirrors.
      const smMirrorKeys = new Set();
      const smMirrorKey = (branch, ref, product, batch) =>
        `${ref||''}||${branch||''}||${(product||'').toLowerCase()}||${(batch||'').toLowerCase()}`;
      for (const sm of smPrePeriodRows) {
        if (sm.reference_id) {
          const ref = String(sm.reference_id);
          const p   = sm.product_name || '';
          const b   = sm.batch_no    || '';
          const src = norm(sm.source_location);
          const dst = norm(sm.destination_location);
          if (isBranchLocO(dst)) smMirrorKeys.add(smMirrorKey(dst, ref, p, b));
          if (isBranchLocO(src)) smMirrorKeys.add(smMirrorKey(src, ref, p, b));
        }
        const src = norm(sm.source_location);
        const dst = norm(sm.destination_location);
        const q   = Math.abs(Number(sm.quantity || 0)); // SM stores positive magnitudes
        const t   = (sm.movement_type || '').toLowerCase();
        if (conditionShift(sm)) continue;
        if (isBranchLocO(dst)) {
          // Dispatch-type movements only count as inward when the SOURCE is not a branch
          // (warehouse→branch or country→branch). Branch-to-branch dispatches debit the
          // source; the matching branch_receipt/transfer_in movement credits the dest.
          const fromNonBranch = !isBranchLocO(src);
          if ((t === 'transfer_out' || t === 'dispatched' ||
               t === 'warehouse_dispatch' || t === 'country_release') && fromNonBranch) {
            ensureOpeningNet(dst);
            openingNet[dst] += q;
          } else if (t === 'transfer_in' || t === 'received' || t === 'receive' ||
                     t === 'branch_receipt' || t === 'import_received' || t === 'transit_receipt' ||
                     t === 'positive_adjustment' || t === 'adjustment' ||
                     t === 'return' || t === 'return_in' || t === 'refund_return') {
            ensureOpeningNet(dst);
            openingNet[dst] += q;
          }
        }
        if (isBranchLocO(src)) {
          if (t === 'transfer_out' || t === 'dispatched' || t === 'warehouse_dispatch' || t === 'transit_dispatch' ||
              t === 'write_off' || t === 'field_use' || t === 'negative_adjustment' ||
              t === 'campaign_free_item' || t === 'sale' || t === 'campaign_sale' ||
              t.includes('sale') || t === 'dispense' || t === 'prescription_dispense') {
            ensureOpeningNet(src);
            openingNet[src] -= q;
          }
        }
      }

      // Step 2: BIM-only events (no matching SM reference_id) — use SIGNED quantity.
      // In-types contribute +signedQ; out-types contribute −signedQ.
      // This correctly handles adjustments where signedQ may be negative.
      const bimInTypes  = new Set(['receive','received','stock_receipt','transfer_in',
                                   'return','return_in','refund_return','positive_adjustment','adjustment']);
      const bimOutTypes = new Set(['sale','walkin_sale','walkin_member_sale','walkin_non_member_sale',
                                   'walk_in_member_sale','walk_in_non_member_sale','campaign_sale',
                                   'online_order_sale','online_order_fulfilment','campaign_free_item',
                                   'dispense','prescription_dispense','field_use',
                                   'transfer_out','transfer','write_off','negative_adjustment']);
      for (const row of bimPrePeriodRows) {
        const ref = row.reference ? String(row.reference) : null;
        const bid = normalizeBranchSlug(row.branch_id) || norm(row.branch_id);
        // Only skip this BIM row if there is an SM mirror with the SAME reference,
        // branch, product, and batch — not just the same reference alone.
        if (ref && smMirrorKeys.has(smMirrorKey(bid, ref, row.product_name, row.batch_no))) continue;
        const signedQ   = Number(row.quantity || 0); // preserve sign — do NOT abs()
        const t         = (row.type || '').toLowerCase();
        ensureOpeningNet(bid);
        if (bimInTypes.has(t))       openingNet[bid] += signedQ;  // negative adj reduces opening
        else if (bimOutTypes.has(t)) openingNet[bid] -= signedQ;  // negative reversal adds back
      }
    }

    for (const key of Object.keys(branchMap)) {
      const br = branchMap[key];
      const products = new Set();
      br.inventory.forEach(i => products.add(i.product_name));
      br.product_count = products.size;
      br.sales_revenue=br.sales_dp_value; // compatibility alias, now explicitly DP
      br.sales_dp_complete=br.missing_sales_dp_qty===0;

      if (dateFrom) {
        // opening = signed net of all movements before period_start
        const net = openingNet[key] ?? 0;
        br.opening_qty = Math.max(0, net);
      } else {
        // No date filter: period == all time.  Derive from period columns (all magnitudes are abs-normalised).
        br.opening_qty = Math.max(0,
          br.closing_qty
          + br.qty_sold + br.qty_dispensed + br.qty_written_off + br.qty_transferred_out
          - br.qty_received - br.qty_transferred_in - br.qty_returned - br.qty_adjusted
        );
      }
    }

    res.json({
      success: true,
      alertPolicy,
      branches: Object.values(branchMap).filter(br=>!branchFilter || br.branch_id===branchFilter),
      total_branches: Object.values(branchMap).filter(br=>!branchFilter || br.branch_id===branchFilter).length,
    });
  } catch (err) {
    console.error('Branch stock summary error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
