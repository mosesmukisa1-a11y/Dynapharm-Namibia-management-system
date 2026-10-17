import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js";import { applyAuthCors } from '../../_lib/auth.js';
import {
  getDateRange,
  getAllBranchLocations,
  getLocationStockSummary,
  getLocationMovements,
  getBranchSalesRevenue } from
'../../services/gmFinanceMisEngine.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { start, end } = getDateRange(req.query);
    const branches = await getAllBranchLocations();

    const results = await Promise.all(branches.map(async (b) => {
      const [stock, movements, sales, lastMov] = await Promise.all([
      getLocationStockSummary('branch', b.locationId),
      getLocationMovements('branch', b.locationId, start, end),
      getBranchSalesRevenue(b.locationId, start, end), __qd_executePlan(
        getMany, __qd_registeredPlan("api/gm/branches/performance.js:26:0"),



        [b.locationId])]

      );

      return {
        branchId: b.locationId,
        branchName: b.locationName,
        productCount: stock.productCount,
        closingStock: stock.closingStock,
        stockValueDP: stock.stockValueDP,
        salesUnits: movements.salesUnits,
        salesRevenue: sales.totalSales,
        dispensedUnits: movements.dispensedUnits,
        writeOffQty: movements.writeOffQty,
        writeOffValueDP: movements.writeOffValueDP,
        lowStockCount: stock.lowStockCount,
        expiringCount: stock.expiringCount,
        lastMovementAt: lastMov[0]?.last_at || null
      };
    }));

    res.json({ success: true, period: { start, end }, branches: results });
  } catch (err) {
    console.error('[gm/branches/performance]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
