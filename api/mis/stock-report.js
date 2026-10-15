import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';
import { ALL_BRANCH_IDS, normalizeBranchSlug } from '../_lib/branchUtils.js';
import { getStockCostProjection } from '../services/stockCostReporting.js';
import { inferLocationType } from '../services/stockEngine.js';
import {businessDay,validateBusinessDates} from '../services/businessDates.js';
import {reportInstantPredicate} from '../services/reportDateBounds.js';
import {COMPANY_REPORT_ROLES} from '../services/dailySales.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (!COMPANY_REPORT_ROLES.has(req.user.role)) return res.status(403).json({success:false,error:'Company stock reporting access required'});
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const branchFilter = searchParams.get('branch') || null;

    const today=businessDay();
    const startStr = searchParams.get('start') || today.slice(0,8)+'01';
    const endStr = searchParams.get('end') || today;
    if(/^\d{4}-\d{2}-\d{2}$/.test(startStr)&&/^\d{4}-\d{2}-\d{2}$/.test(endStr))validateBusinessDates(startStr,endStr);

    const projection=(await getStockCostProjection()).filter(r=>inferLocationType(r.location)==='branch'
      && (!branchFilter || normalizeBranchSlug(r.location)===normalizeBranchSlug(branchFilter)));
    const inventory=projection.map(r=>({branch_id:r.location,product_name:r.productName,closing_qty:r.qty,
      closing_value:r.qty*(r.unitDPC ?? 0),expired_qty:r.expiredQty,missing_cost_quantity:r.missingDPCQuantity}));

    // 2. Stock movements in period per branch
    let movQuery = `
      SELECT
        branch_id,
        product_name,
        type,
        SUM(quantity) AS total_qty
      FROM branch_inventory_movements
      WHERE ${reportInstantPredicate('created_at','$1',startStr)}
        AND ${reportInstantPredicate('created_at','$2',endStr,true)}
    `;
    const movParams = [startStr, endStr];
    if (branchFilter) {
      movParams.push(branchFilter);
      movQuery += ` AND branch_id = $${movParams.length}`;
    }
    movQuery += ` GROUP BY branch_id, product_name, type ORDER BY branch_id, product_name`;

    // 3. Sales per branch in period (= stock deducted via sales)
    let salesQuery = `
      SELECT
        s.branch_id,
        COALESCE(item.value->>'product_name', item.value->>'productName', item.value->>'name', 'Unknown') AS product_name,
        SUM(COALESCE(NULLIF(item.value->>'quantity','')::numeric, 0)) AS sold_qty,
        SUM(COALESCE(
          NULLIF(item.value->>'amount','')::numeric,
          NULLIF(item.value->>'total','')::numeric,
          COALESCE(NULLIF(item.value->>'quantity','')::numeric,0) * COALESCE(NULLIF(item.value->>'unit_price','')::numeric,NULLIF(item.value->>'unitPrice','')::numeric, 0)
        )) AS sold_value
      FROM branch_walkin_sales s
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(NULLIF(s.items,'[]'::jsonb),s.data->'items',s.data->'products','[]'::jsonb)) AS item(value)
      WHERE ${reportInstantPredicate('s.sale_date','$1',startStr)}
        AND ${reportInstantPredicate('s.sale_date','$2',endStr,true)}
    `;
    const salesParams = [startStr, endStr];
    if (branchFilter) {
      salesParams.push(branchFilter);
      salesQuery += ` AND s.branch_id = $${salesParams.length}`;
    }
    salesQuery += ` GROUP BY s.branch_id, product_name ORDER BY s.branch_id, product_name`;

    const [invRows, movRows, salesRows] = await Promise.all([
      Promise.resolve(inventory),
      getMany(movQuery, movParams),
      getMany(salesQuery, salesParams),
    ]);

    // Build per-branch aggregation
    const branches = {};
    // Track branches that already have BIM sale data so walkin_sales aren't double-counted.
    // Every walk-in sale creates both a branch_inventory_movements row (type=sale/walkin_*) AND
    // a branch_walkin_sales row. Adding both would double the sold quantities.
    const bimSaleBranches = new Set();

    // Index inventory
    for (const row of invRows) {
      const b = row.branch_id;
      if (!branches[b]) branches[b] = { branch: b, products: {}, totals: { received: 0, returns: 0, transfers_in: 0, transfers_out: 0, write_offs: 0, adjustments: 0, sales: 0, closing: 0, expired: 0, closing_value: 0 } };
      const prior=branches[b].products[row.product_name] || {};
      branches[b].products[row.product_name] = {
        product_name: row.product_name,
        closing_qty: Number(prior.closing_qty || 0)+Number(row.closing_qty || 0),
        closing_value: Number(prior.closing_value || 0)+Number(row.closing_value || 0),
        expired_qty: Number(prior.expired_qty || 0)+Number(row.expired_qty || 0),
        missing_cost_quantity:Number(prior.missing_cost_quantity || 0)+Number(row.missing_cost_quantity || 0),
        received: 0, returns: 0, transfers_in: 0, transfers_out: 0, write_offs: 0, adjustments: 0, sales: 0,
      };
      branches[b].totals.closing += Number(row.closing_qty || 0);
      branches[b].totals.closing_value += Number(row.closing_value || 0);
      branches[b].totals.expired += Number(row.expired_qty || 0);
    }

    // Index movements
    for (const row of movRows) {
      const b = row.branch_id;
      if (!branches[b]) branches[b] = { branch: b, products: {}, totals: { received: 0, returns: 0, transfers_in: 0, transfers_out: 0, write_offs: 0, adjustments: 0, sales: 0, closing: 0, expired: 0, closing_value: 0 } };
      if (!branches[b].products[row.product_name]) {
        branches[b].products[row.product_name] = { product_name: row.product_name, closing_qty: 0, closing_value: 0, expired_qty: 0, received: 0, returns: 0, transfers_in: 0, transfers_out: 0, write_offs: 0, adjustments: 0, sales: 0 };
      }
      const qty = Number(row.total_qty || 0);
      const prod = branches[b].products[row.product_name];
      const type = row.type || '';
      if (type === 'receive' || type === 'received' || type === 'branch_receipt') { prod.received += qty; branches[b].totals.received += qty; }
      else if (type === 'return' || type === 'return_in') { prod.returns += qty; branches[b].totals.returns += qty; }
      else if (type === 'transfer_in') { prod.transfers_in += qty; branches[b].totals.transfers_in += qty; }
      else if (type === 'transfer_out') { prod.transfers_out += qty; branches[b].totals.transfers_out += qty; }
      else if (type === 'write_off' || type === 'field_use') { prod.write_offs += qty; branches[b].totals.write_offs += qty; }
      else if (type === 'adjustment' || type === 'adjust' || type === 'positive_adjustment') { prod.adjustments += qty; branches[b].totals.adjustments += qty; }
      else if (type === 'negative_adjustment') { prod.adjustments -= qty; branches[b].totals.adjustments -= qty; }
      else if (
        type === 'sale' || type === 'sold' ||
        type === 'walk_in_member_sale' || type === 'walk_in_non_member_sale' ||
        type === 'walkin_sale' || type === 'walkin_member_sale' || type === 'walkin_non_member_sale' ||
        type === 'prescription_dispense' || type === 'dispense' ||
        type === 'campaign_sale' || type === 'campaign_free_item' || type === 'online_order_fulfilment'
      ) {
        prod.sales += qty;
        branches[b].totals.sales += qty;
        bimSaleBranches.add(b); // mark this branch as having BIM-sourced sale data
      }
    }

    // Index walkin_sales — ONLY for branches with no BIM sale records to avoid double-counting.
    // When BIM records exist, walkin_sale movements already captured the sold quantities above.
    for (const row of salesRows) {
      const b = row.branch_id;
      if (bimSaleBranches.has(b)) continue; // BIM already captured this branch's sales
      if (!branches[b]) branches[b] = { branch: b, products: {}, totals: { received: 0, returns: 0, transfers_in: 0, transfers_out: 0, write_offs: 0, adjustments: 0, sales: 0, closing: 0, expired: 0, closing_value: 0 } };
      const name = row.product_name;
      if (!branches[b].products[name]) {
        branches[b].products[name] = { product_name: name, closing_qty: 0, closing_value: 0, expired_qty: 0, received: 0, returns: 0, transfers_in: 0, transfers_out: 0, write_offs: 0, adjustments: 0, sales: 0 };
      }
      const qty = Number(row.sold_qty || 0);
      branches[b].products[name].sales += qty;
      branches[b].totals.sales += qty;
    }

    // Compute formula: Opening = Closing - Inflows + Outflows
    // Inflows  = received + transfers_in + positive_adjustments
    // Outflows = sales + transfers_out + write_offs + expired + returns
    // (Working backwards from closing stock to derive opening)
    const result = Object.values(branches).map(br => {
      const issued = br.totals.received + br.totals.transfers_in;
      const outflows = br.totals.sales + br.totals.transfers_out + br.totals.write_offs + br.totals.expired;
      const returns_ = br.totals.returns;
      const promotions = br.totals.adjustments; // positive adjustments add stock (treated as inflows)
      const opening = br.totals.closing - issued - promotions + outflows - returns_;

      return {
        branch: br.branch,
        missingCostQuantity:projection.filter(r=>r.location===br.branch).reduce((sum,r)=>sum+r.missingDPCQuantity,0),
        valuationComplete:projection.filter(r=>r.location===br.branch).every(r=>!r.missingDPCQuantity),
        formula: {
          opening: Math.max(0, opening),
          issued: issued,
          returns: returns_,
          expiring: br.totals.expired,
          promotions: promotions,
          closing: br.totals.closing,
          closing_value: Math.round(br.totals.closing_value * 100) / 100,
          sales: br.totals.sales,
          transfers_in: br.totals.transfers_in,
          transfers_out: br.totals.transfers_out,
          write_offs: br.totals.write_offs,
        },
        products: Object.values(br.products),
        product_count: Object.keys(br.products).length,
      };
    });

    // Ensure all registered branches appear even if they have zero data in the period
    const resultMap = new Map(result.map(r => [normalizeBranchSlug(r.branch) || r.branch, r]));
    const emptyBranchEntry = (branchId) => ({
      branch: branchId,
      formula: { opening: 0, issued: 0, returns: 0, expiring: 0, promotions: 0, closing: 0, closing_value: 0, sales: 0, transfers_in: 0, transfers_out: 0, write_offs: 0 },
      products: [],
      product_count: 0,
      no_data: true,
    });
    const paddedResult = ALL_BRANCH_IDS.map(id => resultMap.get(normalizeBranchSlug(id) || id) || emptyBranchEntry(id));

    // Company summary
    const summary = paddedResult.reduce((acc, br) => {
      acc.opening += br.formula.opening;
      acc.issued += br.formula.issued;
      acc.returns += br.formula.returns;
      acc.expiring += br.formula.expiring;
      acc.promotions += br.formula.promotions;
      acc.closing += br.formula.closing;
      acc.closing_value += br.formula.closing_value;
      acc.sales += br.formula.sales;
      acc.branch_count = paddedResult.length;
      return acc;
    }, { opening: 0, issued: 0, returns: 0, expiring: 0, promotions: 0, closing: 0, closing_value: 0, sales: 0, branch_count: 0 });

    return res.status(200).json({
      missingCostQuantity:projection.reduce((sum,r)=>sum+r.missingDPCQuantity,0),
      valuationComplete:projection.every(r=>!r.missingDPCQuantity),
      success: true,
      period: { start: startStr, end: endStr,timezone:'Africa/Windhoek',endExclusive:true },
      branches: paddedResult,
      summary,
    });

  } catch (err) {
    console.error('Stock report API error:', err);
    return res.status(err.statusCode || 500).json({ success: false, error: err?.message || 'Internal server error' });
  }
}
