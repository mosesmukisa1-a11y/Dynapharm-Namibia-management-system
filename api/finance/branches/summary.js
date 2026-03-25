import { applyAuthCors } from '../../_lib/auth.js';
import {
  getDateRange,
  getAllBranchLocations,
  getLocationStockSummary,
  getLocationMovements,
  getBranchSalesRevenue,
} from '../../services/gmFinanceMisEngine.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { start, end } = getDateRange(req.query);
    const branches = await getAllBranchLocations();

    const results = await Promise.all(branches.map(async (b) => {
      const [stock, movements, sales] = await Promise.all([
        getLocationStockSummary('branch', b.locationId),
        getLocationMovements('branch', b.locationId, start, end),
        getBranchSalesRevenue(b.locationId, start, end),
      ]);

      return {
        branchId: b.locationId,
        branchName: b.locationName,
        salesRevenue: sales.totalSales,
        salesUnits: movements.salesUnits,
        consultationFees: 0,
        stockValueDP: stock.stockValueDP,
        writeOffValueDP: movements.writeOffValueDP,
        cashTotal: sales.cashTotal,
        swipeTotal: sales.swipeTotal,
        eftTotal: sales.eftTotal,
      };
    }));

    res.json({ success: true, period: { start, end }, branches: results });
  } catch (err) {
    console.error('[finance/branches/summary]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
