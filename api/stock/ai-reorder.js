import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const days = parseInt(url.searchParams.get('days') || '30', 10);
    const branchId = url.searchParams.get('branchId') || 'all';

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [branchInv, movements] = await Promise.all([
      getMany("SELECT location_id, product_name, closing_qty FROM inventory_balances WHERE location_type = 'branch'"),
      getMany(`SELECT product_name, movement_type, quantity, source_location FROM stock_movements WHERE created_at >= $1 ORDER BY created_at DESC`, [since]),
    ]);

    const salesByProduct = {};
    movements.forEach(m => {
      if (['sale', 'walkin', 'dispense', 'walkin_non_member_sale', 'walkin_member_sale', 'walk_in_member_sale', 'walk_in_non_member_sale'].includes(m.movement_type)) {
        const name = m.product_name || 'Unknown';
        if (!salesByProduct[name]) salesByProduct[name] = 0;
        salesByProduct[name] += Number(m.quantity || 0);
      }
    });

    const invByProduct = {};
    branchInv.forEach(b => {
      if (branchId !== 'all' && b.location_id !== branchId) return;
      const name = b.product_name;
      if (!invByProduct[name]) invByProduct[name] = { totalQty: 0, locations: [] };
      invByProduct[name].totalQty += Number(b.closing_qty || 0);
      invByProduct[name].locations.push(b.location_id);
    });

    const suggestions = Object.entries(invByProduct)
      .map(([name, inv]) => {
        const totalSales = salesByProduct[name] || 0;
        const avgDailyUsage = totalSales / days;
        const daysRemaining = avgDailyUsage > 0 ? inv.totalQty / avgDailyUsage : 999;
        // Flag anything under 6 months (180 days) of supply, or critically low qty
        const shouldReorder = daysRemaining < 180 || inv.totalQty < 5;
        if (!shouldReorder) return null;
        // Suggested order covers 6 months minus what's already in stock
        const sixMonthNeed = avgDailyUsage > 0 ? Math.ceil(avgDailyUsage * 180) : (inv.totalQty < 5 ? 180 : 0);
        const recommendedReorderQty = Math.max(0, sixMonthNeed - inv.totalQty);
        return {
          productName: name,
          currentQty: inv.totalQty,
          avgDailyUsage: parseFloat(avgDailyUsage.toFixed(2)),
          daysRemaining: parseFloat(Math.min(daysRemaining, 999).toFixed(1)),
          monthsRemaining: parseFloat(Math.min(daysRemaining / 30, 99).toFixed(1)),
          recommendedReorderQty: recommendedReorderQty > 0 ? recommendedReorderQty : Math.max(24, Math.ceil(avgDailyUsage * 180)),
          locations: inv.locations,
          urgency: daysRemaining <= 0 ? 'out_of_stock'
            : daysRemaining < 14  ? 'critical'
            : daysRemaining < 30  ? 'urgent'
            : daysRemaining < 90  ? 'reorder_now'
            : 'plan_ahead',
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);

    res.status(200).json({ success: true, suggestions, period: `${days} days`, branchId });
  } catch (err) {
    console.error('AI reorder error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
