/**
 * GET /api/stock/overview
 * Compact summary used by the GM Portal overview panel.
 *
 * Sources of truth:
 *   - Warehouses: stock_batches.remaining_quantity (live, per-movement updated)
 *   - Branches:   branch_inventory_batches.quantity (authoritative on-hand per branch)
 *   - inventory_balances is NOT used here — it accumulates historical period rows and
 *     SUM(closing_qty) would inflate figures by the number of periods stored.
 *   - country_stock is shown in its own card but excluded from operational totals.
 */
import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const [batches, branchBatches, branchNames, transfers] = await Promise.all([
      // Live warehouse + country stock quantities
      getMany(
        `SELECT location, description, remaining_quantity, cif_unit_cost, dpc_unit_value, unit_price
         FROM stock_batches
         WHERE remaining_quantity > 0
           AND COALESCE(status, '') != 'expired'
         ORDER BY location, description`
      ),
      // Authoritative branch on-hand stock
      getMany(
        `SELECT branch_id, product_name,
                SUM(quantity) AS qty,
                COUNT(DISTINCT product_name) AS product_count
         FROM branch_inventory_batches
         WHERE quantity > 0
         GROUP BY branch_id, product_name
         ORDER BY branch_id, product_name`
      ),
      getMany(`SELECT id, name FROM branches WHERE status = 'active'`),
      getMany(
        `SELECT id, status, from_warehouse, to_branch
         FROM stock_transfers
         ORDER BY created_at DESC LIMIT 500`
      ),
    ]);

    const branchNameMap = Object.fromEntries(branchNames.map(b => [b.id, b.name]));
    const resolveName = (id) => branchNameMap[id] || (id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const sumRq = (arr) => arr.reduce((s, b) => s + Number(b.remaining_quantity || 0), 0);

    const countryBatches  = batches.filter(b => b.location === 'country_stock');
    const windhoekBatches = batches.filter(b => b.location === 'windhoek_warehouse');
    const ondangwaBatches = batches.filter(b => b.location === 'ondangwa_warehouse');

    // country_stock is staging/holding — excluded from all operational totals
    const activeBatches = batches.filter(b => b.location !== 'country_stock');

    const warehouseQty = activeBatches.reduce((s, b) => s + Number(b.remaining_quantity || 0), 0);
    const warehouseCIF = activeBatches.reduce((s, b) => s + Number(b.remaining_quantity || 0) * Number(b.cif_unit_cost || b.unit_price || 0), 0);
    const warehouseDPC = activeBatches.reduce((s, b) => s + Number(b.remaining_quantity || 0) * Number(b.dpc_unit_value || b.unit_price || 0), 0);

    // Branch totals from branch_inventory_batches (live on-hand)
    const branchQty = branchBatches.reduce((s, b) => s + Number(b.qty || 0), 0);

    const totalStockUnits = warehouseQty + branchQty;
    const stockValueCIF   = warehouseCIF;
    const stockValueDPC   = warehouseDPC;   // branch DPC omitted (no price in branch_inventory_batches without JOIN)

    const pendingCount   = transfers.filter(t => ['pending', 'submitted', 'pending_approval', 'requested'].includes(t.status)).length;
    const inTransitCount = transfers.filter(t => ['in_transit', 'dispatched'].includes(t.status)).length;

    // Build per-branch summary grouped by branch_id
    const branchGroups = {};
    for (const b of branchBatches) {
      const bid = b.branch_id;
      if (!branchGroups[bid]) branchGroups[bid] = { branchId: bid, closingQty: 0, productCount: 0 };
      branchGroups[bid].closingQty    += Number(b.qty || 0);
      branchGroups[bid].productCount  += 1;          // 1 product row per branch_id+product_name group
    }

    const branchStockCards = Object.values(branchGroups).map(b => ({
      branchId:     b.branchId,
      branchName:   resolveName(b.branchId),
      closingQty:   b.closingQty,
      productCount: b.productCount,
      stockValueDPC: 0,   // price lookup would require a JOIN; omit to keep this endpoint fast
    }));

    res.status(200).json({
      success: true,
      topCards: {
        totalStockUnits,
        stockValueCIF:  parseFloat(warehouseCIF.toFixed(2)),
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
        stockValueDPC: 0,
      },
    });
  } catch (err) {
    console.error('Stock overview error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
