import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';
import { syncInventoryBalances } from '../services/inventoryBalanceSync.js';
import { ALL_BRANCH_IDS, normalizeBranchSlug } from '../_lib/branchUtils.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const dateFrom = url.searchParams.get('date_from') || null;
    const dateTo = url.searchParams.get('date_to') || null;
    const branchFilterRaw = url.searchParams.get('branch') || null;
    const branchFilter = branchFilterRaw ? (normalizeBranchSlug(branchFilterRaw) || branchFilterRaw) : null;

    const branchInventory = await getMany(
      `SELECT * FROM branch_inventory_batches ORDER BY branch_id, product_name, expiry_date ASC NULLS LAST`
    );

    let bimQuery = `SELECT branch_id, product_name, batch_no, type, SUM(ABS(quantity)) as total_qty, MAX(created_at) as last_date, (array_agg(DISTINCT source_branch_id))[1] as source FROM branch_inventory_movements`;
    const bimParams = [];
    const bimWhere = [];
    if (dateFrom) { bimParams.push(dateFrom); bimWhere.push(`created_at >= $${bimParams.length}::timestamp`); }
    if (dateTo) { bimParams.push(dateTo + 'T23:59:59'); bimWhere.push(`created_at <= $${bimParams.length}::timestamp`); }
    if (branchFilter) { bimParams.push(branchFilter); bimWhere.push(`branch_id = $${bimParams.length}`); }
    if (bimWhere.length) bimQuery += ' WHERE ' + bimWhere.join(' AND ');
    bimQuery += ' GROUP BY branch_id, product_name, batch_no, type';
    const bimAgg = await getMany(bimQuery, bimParams);

    let smQuery = `SELECT product_name, batch_no, expiry_date, movement_type, quantity, source_location, destination_location, reference_id, notes, created_by, created_at FROM stock_movements`;
    const smParams = [];
    const smWhere = [];
    if (dateFrom) { smParams.push(dateFrom); smWhere.push(`created_at >= $${smParams.length}::timestamp`); }
    if (dateTo) { smParams.push(dateTo + 'T23:59:59'); smWhere.push(`created_at <= $${smParams.length}::timestamp`); }
    if (smWhere.length) smQuery += ' WHERE ' + smWhere.join(' AND ');
    smQuery += ' ORDER BY created_at DESC';
    const stockMovements = await getMany(smQuery, smParams);

    let salesQuery = `SELECT id, branch_id, sale_date, customer_type, total, items, created_by, created_at FROM branch_walkin_sales`;
    const salesParams = [];
    const salesWhere = [];
    if (dateFrom) { salesParams.push(dateFrom); salesWhere.push(`created_at >= $${salesParams.length}::timestamp`); }
    if (dateTo) { salesParams.push(dateTo + 'T23:59:59'); salesWhere.push(`created_at <= $${salesParams.length}::timestamp`); }
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
    const thirtyFwd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

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
      if (qty > 0 && qty < 5) br.low_stock_count++;
    }

    const smBranches = new Set();
    const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    for (const sm of stockMovements) {
      const src = norm(sm.source_location);
      const dst = norm(sm.destination_location);
      const q = Math.abs(Number(sm.quantity || 0));
      const t = (sm.movement_type || '').toLowerCase();
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
      };

      const isBranchLoc = (loc) => loc && !loc.includes('warehouse') && loc !== 'country_stock' && loc !== 'branch' && loc !== 'written_off' && loc !== 'customer' && loc !== 'patient';

      if (isBranchLoc(dst)) {
        const br = ensureBranch(dst);
        smBranches.add(dst);
        br.movements.push(movRecord);
        if (t === 'transfer_in' || t === 'received' || t === 'receive') {
          br.qty_received += q;
          if (sm.source_location) br.source_warehouse = sm.source_location;
        }
        else if (t === 'sale' || t.includes('sale')) br.qty_sold += q;
        else if (t === 'dispense' || t === 'prescription_dispense') br.qty_dispensed += q;
        else if (t === 'return') br.qty_returned += q;
        const ld = fmtDt(sm.created_at);
        if (!br.last_movement || (ld && ld > br.last_movement)) br.last_movement = ld;
      }
      if (isBranchLoc(src)) {
        const br = ensureBranch(src);
        smBranches.add(src);
        if (!br.movements.includes(movRecord)) br.movements.push(movRecord);
        if (t === 'transfer_out') br.qty_transferred_out += q;
        else if (t === 'write_off') br.qty_written_off += q;
        else if (t === 'sale' || t.includes('sale')) br.qty_sold += q;
        else if (t === 'dispense' || t === 'prescription_dispense') br.qty_dispensed += q;
        const ld = fmtDt(sm.created_at);
        if (!br.last_movement || (ld && ld > br.last_movement)) br.last_movement = ld;
      }
    }

    for (const agg of bimAgg) {
      if (smBranches.has(agg.branch_id)) continue;
      const br = ensureBranch(agg.branch_id);
      const q = Number(agg.total_qty || 0);
      const t = (agg.type || '').toLowerCase();
      if (t === 'receive' || t === 'received' || t === 'stock_receipt' || t === 'transfer_in') {
        br.qty_received += q;
        if (agg.source) br.source_warehouse = agg.source;
      }
      else if (t === 'sale' || t === 'walk_in_member_sale' || t === 'walk_in_non_member_sale' || t === 'online_order_sale') br.qty_sold += q;
      else if (t === 'dispense' || t === 'prescription_dispense' || t === 'field_use') br.qty_dispensed += q;
      else if (t === 'transfer_out' || t === 'transfer') br.qty_transferred_out += q;
      else if (t === 'write_off') br.qty_written_off += q;
      else if (t === 'return' || t === 'return_in') br.qty_returned += q;
      else if (t === 'adjustment') br.qty_adjusted += q;
      const ld = agg.last_date instanceof Date ? agg.last_date.toISOString() : agg.last_date;
      if (!br.last_movement || (ld && ld > br.last_movement)) br.last_movement = ld;
    }

    for (const sale of salesRows) {
      const brId = norm(sale.branch_id);
      if (!brId) continue;
      const br = ensureBranch(brId);
      br.sales_count++;
      br.sales_revenue += Number(sale.total || 0);
      if (!smBranches.has(brId)) {
        let items = [];
        try { items = typeof sale.items === 'string' ? JSON.parse(sale.items) : (sale.items || []); } catch {}
        const saleQty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
        br.qty_sold += saleQty;
      }
    }

    for (const key of Object.keys(branchMap)) {
      const br = branchMap[key];
      const products = new Set();
      br.inventory.forEach(i => products.add(i.product_name));
      br.product_count = products.size;
      br.opening_qty = Math.max(0, br.closing_qty + br.qty_sold + br.qty_dispensed + br.qty_written_off + br.qty_transferred_out - br.qty_received - br.qty_returned - br.qty_adjusted);
    }

    // Sync branch_inventory_batches quantities into inventory_balances to keep Stock Manager
    // consistent with the Branch inventory view. Run asynchronously so response is not delayed.
    syncInventoryBalances(branchInventory).catch(e =>
      console.error('[branch/stock-summary] inventory_balances sync error:', e.message)
    );

    res.json({
      success: true,
      branches: Object.values(branchMap),
      total_branches: Object.keys(branchMap).length,
    });
  } catch (err) {
    console.error('Branch stock summary error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
