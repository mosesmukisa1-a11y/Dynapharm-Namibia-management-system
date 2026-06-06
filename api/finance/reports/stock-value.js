/**
 * GET /api/finance/reports/stock-value
 * Company-wide stock valuation for Accounts Financial Position.
 *
 * Authoritative sources:
 *   Warehouses → stock_batches.remaining_quantity (physical, transactional)
 *     Excludes country_stock.  Same source as Stock Portal warehouse views
 *     and GM Current Stock tab — ensures all three show identical figures.
 *
 *   Branches   → inventory_balances WHERE location_type = 'branch'
 *     Derived from posted stock_movements (walk-in sales, dispensing, etc.)
 */
import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';
import { normalizeBranchName } from '../../services/gmFinanceMisEngine.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const asOfDate = req.query.asOfDate || new Date().toISOString().slice(0, 10);

    const [warehouseBatchRows, branchRows] = await Promise.all([

      // Warehouses: stock_batches (physical authoritative source)
      getMany(
        `SELECT location, description AS product_name, batch_no, expiry_date,
                SUM(remaining_quantity)                               AS closing_qty,
                MAX(COALESCE(dpc_unit_value, 0))                     AS unit_dp,
                SUM(remaining_quantity * COALESCE(dpc_unit_value, 0)) AS stock_value_dp
         FROM stock_batches
         WHERE location NOT IN ('country_stock')
           AND remaining_quantity > 0
           AND status != 'expired'
         GROUP BY location, description, batch_no, expiry_date
         ORDER BY location, description`
      ),

      // Branches: inventory_balances (movement-derived cache)
      getMany(
        `SELECT location_id, product_name, batch_no, expiry_date,
                closing_qty, stock_value_dp, unit_dp
         FROM inventory_balances
         WHERE location_type = 'branch'
           AND closing_qty > 0
         ORDER BY location_id, product_name`
      ),
    ]);

    const warehouseMap = new Map();
    const branchMap    = new Map();
    let totalCompanyValueDP = 0;

    // ── Warehouses ──
    for (const r of warehouseBatchRows) {
      const val = Number(r.stock_value_dp || 0);
      totalCompanyValueDP += val;

      const locId = r.location;
      if (!warehouseMap.has(locId)) {
        warehouseMap.set(locId, {
          warehouseId:  locId,
          warehouseName: normalizeBranchName(locId),
          totalValueDP: 0,
          items: [],
        });
      }
      const w = warehouseMap.get(locId);
      w.totalValueDP += val;
      w.items.push({
        productName:  r.product_name,
        batchNo:      r.batch_no,
        expiryDate:   r.expiry_date,
        closingQty:   Number(r.closing_qty || 0),
        unitDP:       Number(r.unit_dp     || 0),
        stockValueDP: val,
      });
    }

    // ── Branches ──
    for (const r of branchRows) {
      const val = Number(r.stock_value_dp || 0);
      totalCompanyValueDP += val;

      const locId = r.location_id;
      if (!branchMap.has(locId)) {
        branchMap.set(locId, {
          branchId:   locId,
          branchName: normalizeBranchName(locId),
          totalValueDP: 0,
          items: [],
        });
      }
      const b = branchMap.get(locId);
      b.totalValueDP += val;
      b.items.push({
        productName:  r.product_name,
        batchNo:      r.batch_no,
        expiryDate:   r.expiry_date,
        closingQty:   Number(r.closing_qty || 0),
        unitDP:       Number(r.unit_dp     || 0),
        stockValueDP: val,
      });
    }

    const warehouseValueDP = Array.from(warehouseMap.values()).reduce((s, w) => s + w.totalValueDP, 0);
    const branchValueDP    = Array.from(branchMap.values()).reduce((s, b) => s + b.totalValueDP, 0);

    res.json({
      success: true,
      asOfDate,
      warehouses: Array.from(warehouseMap.values()),
      branches:   Array.from(branchMap.values()),
      totalCompanyValueDP,
      companyValueDP:   totalCompanyValueDP,
      warehouseValueDP,
      branchValueDP,
    });
  } catch (err) {
    console.error('[finance/reports/stock-value]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
