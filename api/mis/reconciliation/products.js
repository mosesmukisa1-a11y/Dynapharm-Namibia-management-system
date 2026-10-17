import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js";import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';
import { getDateRange, normalizeBranchName } from '../../services/gmFinanceMisEngine.js';

const SALE_TYPES = new Set([
'walkin_sale', 'walkin_member_sale', 'walkin_non_member_sale',
'walk_in_member_sale', 'walk_in_non_member_sale', 'sale', 'online_order_fulfilment']
);
const DISPENSE_TYPES = new Set(['prescription_dispense']);
const WRITEOFF_TYPES = new Set(['write_off', 'field_use']);
const RECEIVED_TYPES = new Set([
'transfer_in', 'branch_receipt', 'received', 'return_in', 'positive_adjustment']
);

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { start, end } = getDateRange(req.query);
    const branchId = req.query.branchId || null;

    let locationFilter = __qd_registeredPlan("api/mis/reconciliation/products.js:25:2");
    const params = [start, end];
    if (branchId) {
      params.push(branchId);
      locationFilter = __qd_registeredPlan("api/mis/reconciliation/products.js:29:3", [params.length, params.length]);
    }

    // Get inventory_balances for opening/closing
    const ibRows = await __qd_executePlan(getMany,
    branchId ? __qd_registeredPlan("api/mis/reconciliation/products.js:35:0") : __qd_registeredPlan("api/mis/reconciliation/products.js:40:1"),










    branchId ? [branchId] : []);


    // Get movements for date range
    const movRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/mis/reconciliation/products.js:50:4", [






    locationFilter]),
    params);


    // Build movement map keyed by (locationId, productName, batchNo)
    const movMap = new Map();
    for (const m of movRows) {
      const isOut = m.source_location && (branchId ? m.source_location === branchId : true);
      const isIn = m.destination_location && (branchId ? m.destination_location === branchId : true);
      const locId = isOut ? m.source_location : isIn ? m.destination_location : null;
      if (!locId) continue;
      const key = `${locId}|${m.product_name}|${m.batch_no || ''}`;
      if (!movMap.has(key)) movMap.set(key, { soldQty: 0, dispensedQty: 0, writeOffQty: 0, receivedQty: 0 });
      const e = movMap.get(key);
      const qty = Number(m.quantity || 0);
      if (isOut && SALE_TYPES.has(m.movement_type)) e.soldQty += qty;else
      if (isOut && DISPENSE_TYPES.has(m.movement_type)) e.dispensedQty += qty;else
      if (isOut && WRITEOFF_TYPES.has(m.movement_type)) e.writeOffQty += qty;else
      if (isIn && RECEIVED_TYPES.has(m.movement_type)) e.receivedQty += qty;
    }

    const results = ibRows.map((r) => {
      const key = `${r.location_id}|${r.product_name}|${r.batch_no || ''}`;
      const mov = movMap.get(key) || { soldQty: 0, dispensedQty: 0, writeOffQty: 0, receivedQty: 0 };
      const openingQty = Number(r.opening_qty || 0);
      const inwardQty = Number(r.inward_qty || 0);
      const outwardQty = Number(r.outward_qty || 0);
      const closingQty = Number(r.closing_qty || 0);
      const expectedOutward = mov.soldQty + mov.dispensedQty + mov.writeOffQty;
      const mismatchQty = outwardQty - expectedOutward;
      const status = Math.abs(mismatchQty) < 0.01 ? 'ok' : mismatchQty > 0 ? 'unaccounted' : 'mismatch';

      return {
        branchId: r.location_id,
        branchName: normalizeBranchName(r.location_id),
        productId: null,
        productName: r.product_name,
        batchNo: r.batch_no || '',
        openingQty,
        inwardQty,
        outwardQty,
        soldQty: mov.soldQty,
        dispensedQty: mov.dispensedQty,
        writeOffQty: mov.writeOffQty,
        closingQty,
        mismatchQty,
        status
      };
    });

    res.json({ success: true, period: { start, end }, products: results });
  } catch (err) {
    console.error('[mis/reconciliation/products]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
