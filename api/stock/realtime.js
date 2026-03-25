import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const branchId = url.searchParams.get('branchId') || 'all';

    const [branchInv, recentMovements, recentSales] = await Promise.all([
      getMany("SELECT location_id, product_name, closing_qty FROM inventory_balances WHERE location_type = 'branch' ORDER BY location_id, product_name"),
      getMany('SELECT product_name, movement_type, quantity, source_location, destination_location, created_at FROM stock_movements ORDER BY created_at DESC LIMIT 50'),
      getMany('SELECT branch_id, total, customer_type, created_at FROM branch_walkin_sales ORDER BY created_at DESC LIMIT 50'),
    ]);

    const filtered = branchId !== 'all'
      ? branchInv.filter(b => b.location_id === branchId || (b.location_id || '').includes(branchId))
      : branchInv;

    const stockByProduct = {};
    filtered.forEach(b => {
      const name = b.product_name || 'Unknown';
      if (!stockByProduct[name]) stockByProduct[name] = { name, qty: 0, locations: [] };
      stockByProduct[name].qty += Number(b.closing_qty || 0);
      stockByProduct[name].locations.push(b.location_id);
    });

    const stockCards = Object.values(stockByProduct)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 20);

    const today = new Date().toDateString();
    const todaySales = recentSales.filter(s => new Date(s.created_at).toDateString() === today);
    const todayRevenue = todaySales.reduce((s, r) => s + Number(r.total || 0), 0);

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      stockCards,
      recentMovements: recentMovements.slice(0, 20),
      recentSales: recentSales.slice(0, 10),
      todayStats: {
        salesCount: todaySales.length,
        revenue: parseFloat(todayRevenue.toFixed(2)),
      },
    });
  } catch (err) {
    console.error('Realtime error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
