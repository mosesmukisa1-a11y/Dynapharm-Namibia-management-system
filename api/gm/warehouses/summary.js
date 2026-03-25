import { applyAuthCors } from '../../_lib/auth.js';
import {
  getDateRange,
  getAllWarehouseLocations,
  getLocationStockSummary,
  getLocationMovements,
} from '../../services/gmFinanceMisEngine.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { start, end } = getDateRange(req.query);
    const warehouses = await getAllWarehouseLocations();

    const results = await Promise.all(warehouses.map(async (w) => {
      const [stock, movements] = await Promise.all([
        getLocationStockSummary('warehouse', w.locationId),
        getLocationMovements('warehouse', w.locationId, start, end),
      ]);

      return {
        warehouseId: w.locationId,
        warehouseName: w.locationName,
        closingStock: stock.closingStock,
        stockValueDP: stock.stockValueDP,
        dispatchQty: movements.dispatchQty,
        receivedQty: movements.receivedQty,
        lowStockCount: stock.lowStockCount,
        expiringCount: stock.expiringCount,
      };
    }));

    res.json({ success: true, period: { start, end }, warehouses: results });
  } catch (err) {
    console.error('[gm/warehouses/summary]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
