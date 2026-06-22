/**
 * GET /api/stock/realtime
 * Unified product-level stock snapshot across ALL locations:
 *   - country_stock  (stock_batches)
 *   - warehouses     (stock_batches)
 *   - branches       (branch_inventory_batches — authoritative per-branch source)
 *
 * Each product: { name, totalQty, locations: [{ locationId, locationName, locationType, qty }] }
 */
import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

const STATIC_NAMES = {
  country_stock:      'Country Stock',
  windhoek_warehouse: 'Windhoek Warehouse',
  ondangwa_warehouse: 'Ondangwa Warehouse',
  oshakati_warehouse: 'Oshakati Warehouse',
  rundu_warehouse:    'Rundu Warehouse',
};

function locationType(id) {
  if (id === 'country_stock') return 'country';
  if ((id || '').includes('warehouse')) return 'warehouse';
  return 'branch';
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const [warehouseRows, branchRows, branchNames, recentMovements, recentSales] = await Promise.all([
      getMany(
        `SELECT location, description AS product_name, SUM(remaining_quantity) AS qty
         FROM stock_batches
         WHERE remaining_quantity > 0
         GROUP BY location, description
         ORDER BY location, description`
      ),
      getMany(
        `SELECT branch_id, product_name, SUM(quantity) AS qty
         FROM branch_inventory_batches
         WHERE quantity > 0
         GROUP BY branch_id, product_name
         ORDER BY branch_id, product_name`
      ),
      getMany(`SELECT id, name FROM branches WHERE status = 'active'`),
      getMany(
        `SELECT id, product_name, movement_type, quantity, source_location,
                destination_location, created_at, created_by, reference_id
         FROM stock_movements
         ORDER BY created_at DESC LIMIT 60`
      ),
      getMany(
        `SELECT branch_id, total, customer_type, created_at
         FROM branch_walkin_sales
         WHERE sale_date = CURRENT_DATE AND status = 'completed'`
      ),
    ]);

    const branchNameMap = Object.fromEntries(branchNames.map(b => [b.id, b.name]));

    const resolveLocationName = (id) =>
      STATIC_NAMES[id]
      || branchNameMap[id]
      || (id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const productMap = new Map();

    const upsert = (rawName, locationId, qty) => {
      const name = (rawName || '').trim();
      if (!name || Number(qty) <= 0) return;
      if (!productMap.has(name)) productMap.set(name, { name, totalQty: 0, locations: [] });
      const entry = productMap.get(name);
      entry.totalQty += Number(qty);
      entry.locations.push({
        locationId,
        locationName: resolveLocationName(locationId),
        locationType: locationType(locationId),
        qty: Number(qty),
      });
    };

    for (const r of warehouseRows) upsert(r.product_name, r.location, r.qty);
    for (const r of branchRows)    upsert(r.product_name, r.branch_id, r.qty);

    const products = [...productMap.values()]
      .sort((a, b) => b.totalQty - a.totalQty)
      .map(p => ({ ...p, locations: p.locations.sort((a, b) => b.qty - a.qty) }));

    const todayRevenue = recentSales.reduce((s, r) => s + Number(r.total || 0), 0);

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      products,
      totalProducts: products.length,
      totalUnits: products.reduce((s, p) => s + p.totalQty, 0),
      recentMovements,
      todayStats: {
        salesCount: recentSales.length,
        revenue: parseFloat(todayRevenue.toFixed(2)),
      },
    });
  } catch (err) {
    console.error('[stock/realtime]', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
