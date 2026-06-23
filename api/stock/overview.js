import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const [batches, branchInv, transfers] = await Promise.all([
      // Only fetch batches with stock remaining — avoids the 0||quantity fallback bug
      getMany(`SELECT location, description, remaining_quantity, cif_unit_cost, dpc_unit_value, unit_price
               FROM stock_batches
               WHERE remaining_quantity > 0
                 AND COALESCE(status, '') != 'expired'
               ORDER BY import_date DESC`),
      getMany("SELECT location_id, product_name, closing_qty, unit_dp FROM inventory_balances WHERE location_type = 'branch'"),
      getMany("SELECT id, status, from_warehouse, to_branch FROM stock_transfers ORDER BY created_at DESC LIMIT 500"),
    ]);

    const sumRq = (arr) => arr.reduce((s, b) => s + Number(b.remaining_quantity || 0), 0);

    const countryBatches  = batches.filter(b => b.location === 'country_stock');
    const windhoekBatches = batches.filter(b => b.location === 'windhoek_warehouse');
    const ondangwaBatches = batches.filter(b => b.location === 'ondangwa_warehouse');

    const warehouseQty = batches.reduce((s, b) => s + Number(b.remaining_quantity || 0), 0);
    const warehouseCIF = batches.reduce((s, b) => s + Number(b.remaining_quantity || 0) * Number(b.cif_unit_cost || b.unit_price || 0), 0);
    const warehouseDPC = batches.reduce((s, b) => s + Number(b.remaining_quantity || 0) * Number(b.dpc_unit_value || b.unit_price || 0), 0);

    const branchQty = branchInv.reduce((s, b) => s + Number(b.closing_qty || 0), 0);
    const branchDPC = branchInv.reduce((s, b) => s + Number(b.closing_qty || 0) * Number(b.unit_dp || 0), 0);

    const totalStockUnits = warehouseQty + branchQty;
    const stockValueCIF   = warehouseCIF;
    const stockValueDPC   = warehouseDPC + branchDPC;

    const pendingCount   = transfers.filter(t => ['pending', 'submitted', 'pending_approval', 'requested'].includes(t.status)).length;
    const inTransitCount = transfers.filter(t => ['in_transit', 'dispatched'].includes(t.status)).length;

    const branchGroups = {};
    branchInv.forEach(b => {
      const bid = b.location_id;
      if (!branchGroups[bid]) branchGroups[bid] = { branchId: bid, closingQty: 0, stockValueDPC: 0, productCount: 0 };
      branchGroups[bid].closingQty      += Number(b.closing_qty || 0);
      branchGroups[bid].stockValueDPC   += Number(b.closing_qty || 0) * Number(b.unit_dp || 0);
      branchGroups[bid].productCount    += 1;
    });

    const branchStockCards = Object.values(branchGroups).map(b => ({
      branchId:      b.branchId,
      branchName:    (b.branchId || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      closingQty:    b.closingQty,
      productCount:  b.productCount,
      stockValueDPC: parseFloat(b.stockValueDPC.toFixed(2)),
    }));

    res.status(200).json({
      success: true,
      topCards: {
        totalStockUnits,
        stockValueCIF:  parseFloat(stockValueCIF.toFixed(2)),
        stockValueDPC:  parseFloat(stockValueDPC.toFixed(2)),
        pendingCount,
        inTransitCount,
      },
      locationCards: {
        countryStockQty:     sumRq(countryBatches),
        countryStockBatches: countryBatches.length,
        windhoekQty:         sumRq(windhoekBatches),
        windhoekBatches:     windhoekBatches.length,
        ondangwaQty:         sumRq(ondangwaBatches),
        ondangwaBatches:     ondangwaBatches.length,
      },
      branchStockCards,
      allBranches: {
        closingQty:    branchQty,
        stockValueDPC: parseFloat(branchDPC.toFixed(2)),
      },
    });
  } catch (err) {
    console.error('Stock overview error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
