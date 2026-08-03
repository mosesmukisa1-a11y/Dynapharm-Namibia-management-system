import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';
import {
  getDateRange,
  getAllBranchLocations,
  getLocationMovements,
  getLocationStockSummary,
  getBranchSalesRevenue,
  normalizeBranchName,
} from '../../services/gmFinanceMisEngine.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { start, end } = getDateRange(req.query);
    const branches = await getAllBranchLocations();

    const results = await Promise.all(branches.map(async (b) => {
      const [movements, stock, sales] = await Promise.all([
        getLocationMovements('branch', b.locationId, start, end),
        getLocationStockSummary('branch', b.locationId),
        getBranchSalesRevenue(b.locationId, start, end),
      ]);

      // MIS formula: expected_closing = opening + received - sold - dispensed - writeoff
      // We derive opening from inventory_balances (opening_qty) if available
      const ibRow = await getMany(
        `SELECT SUM(opening_qty) as opening, SUM(inward_qty) as inward, SUM(outward_qty) as outward
         FROM inventory_balances WHERE location_type = 'branch' AND location_id = $1`,
        [b.locationId]
      );
      const openingQty = Number(ibRow[0]?.opening || 0);
      const inwardQty = Number(ibRow[0]?.inward || 0);
      const outwardQty = Number(ibRow[0]?.outward || 0);

      const actualClosing = stock.closingStock;
      const expectedClosing = openingQty + movements.receivedQty
        - movements.salesUnits - movements.dispensedUnits - movements.writeOffQty;
      const mismatchQty = actualClosing - expectedClosing;
      const status = Math.abs(mismatchQty) < 0.01 ? 'ok' : mismatchQty > 0 ? 'surplus' : 'deficit';

      return {
        branchId: b.locationId,
        branchName: b.locationName,
        receivedQty: movements.receivedQty,
        soldQty: movements.salesUnits,
        dispensedQty: movements.dispensedUnits,
        writeOffQty: movements.writeOffQty,
        closingQty: actualClosing,
        salesRevenue: sales.totalSales,
        mismatchQty,
        mismatchValue: 0,
        status,
      };
    }));

    res.json({ success: true, period: { start, end }, reconciliation: results });
  } catch (err) {
    console.error('[mis/reconciliation/summary]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
