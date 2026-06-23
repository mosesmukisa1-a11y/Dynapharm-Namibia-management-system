import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const now      = new Date();
    const thirtyFwd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const sevenFwd  = new Date(Date.now() + 7  * 24 * 60 * 60 * 1000);

    const [batches, branchInv, movements] = await Promise.all([
      // Only fetch batches with stock remaining — avoids the 0||quantity fallback bug
      getMany(`SELECT description, location, remaining_quantity, expiry_date, unit_price
               FROM stock_batches
               WHERE remaining_quantity > 0
                 AND COALESCE(status, '') != 'expired'`),
      getMany("SELECT location_id, product_name, closing_qty, unit_dp FROM inventory_balances WHERE location_type = 'branch'"),
      getMany('SELECT product_name, movement_type, quantity, source_location FROM stock_movements ORDER BY created_at DESC LIMIT 1000'),
    ]);

    const allItems = [
      ...batches.map(b => ({ name: b.description, qty: Number(b.remaining_quantity || 0), expiry: b.expiry_date, loc: b.location })),
      ...branchInv.map(b => ({ name: b.product_name, qty: Number(b.closing_qty || 0), expiry: null, loc: b.location_id })),
    ];

    const expiredItems   = allItems.filter(i => i.expiry && new Date(i.expiry) < now && i.qty > 0);
    const expiringItems  = allItems.filter(i => i.expiry && new Date(i.expiry) > now && new Date(i.expiry) <= thirtyFwd && i.qty > 0);
    const lowStockItems  = allItems.filter(i => i.qty > 0 && i.qty < 5);
    const outOfStockItems = allItems.filter(i => i.qty <= 0);
    const writeOffRiskItems = allItems.filter(i => i.qty > 0 && i.expiry && new Date(i.expiry) < sevenFwd);

    const salesByProduct = {};
    movements.forEach(m => {
      if (['sale', 'walkin', 'dispense', 'walk_in_member_sale', 'walk_in_non_member_sale', 'walkin_non_member_sale', 'walkin_member_sale'].includes(m.movement_type)) {
        const name = m.product_name || 'Unknown';
        if (!salesByProduct[name]) salesByProduct[name] = 0;
        salesByProduct[name] += Number(m.quantity || 0);
      }
    });

    const fastMoving = Object.entries(salesByProduct)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ type: 'fast_moving_product', message: `${name} moved ${qty} units recently` }));

    const insights = [
      ...fastMoving,
      ...expiringItems.slice(0, 3).map(i => ({
        type: 'expiry_warning',
        message: `${i.name} at ${i.loc} expires ${new Date(i.expiry).toLocaleDateString('en-NA')} — ${i.qty} units`,
      })),
      ...lowStockItems.slice(0, 3).map(i => ({
        type: 'low_stock',
        message: `${i.name} at ${i.loc} has only ${i.qty} units remaining`,
      })),
    ];

    const invByProduct = {};
    allItems.forEach(i => {
      if (!invByProduct[i.name]) invByProduct[i.name] = 0;
      invByProduct[i.name] += i.qty;
    });

    const reorderSuggestions = Object.entries(invByProduct)
      .filter(([name, qty]) => qty < 10 && salesByProduct[name] > 0)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 8)
      .map(([name, qty]) => ({
        productName:     name,
        currentQty:      qty,
        recommendedQty:  Math.max(24, (salesByProduct[name] || 5) * 2),
      }));

    const anomalies = [];
    if (expiredItems.length > 0)    anomalies.push({ type: 'expired_stock',  message: `${expiredItems.length} expired item batches still have stock on hand` });
    if (outOfStockItems.length > 10) anomalies.push({ type: 'high_stockout', message: `${outOfStockItems.length} product lines are currently out of stock` });

    res.status(200).json({
      success: true,
      alerts: {
        lowStock:     lowStockItems.length,
        expiring:     expiringItems.length,
        outOfStock:   outOfStockItems.length,
        writeOffRisk: writeOffRiskItems.length,
        expired:      expiredItems.length,
      },
      insights,
      reorderSuggestions,
      anomalies,
    });
  } catch (err) {
    console.error('AI command error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
