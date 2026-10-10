import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';
import { getStockAlertPolicy } from '../../services/stockAlertPolicy.js';
import { validateStockAlertPolicy } from '../../../shared/stockAlertPolicy.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const alertPolicy = await getStockAlertPolicy();
    const threshold = url.searchParams.has('threshold') ? Number(url.searchParams.get('threshold')) : alertPolicy.lowStockThreshold;
    try { validateStockAlertPolicy({ ...alertPolicy, lowStockThreshold: threshold }); }
    catch (error) { return res.status(422).json({ success: false, error: error.message }); }
    const location = url.searchParams.get('location') || '';

    const batchParams = [threshold];
    let batchLocationCond = '';
    if (location) { batchParams.push(`%${location}%`); batchLocationCond = ` AND location ILIKE $${batchParams.length}`; }

    const batches = await getMany(
      `SELECT id, description, location, remaining_quantity, quantity, unit_price, dpc_unit_value, expiry_date FROM stock_batches WHERE remaining_quantity < $1 AND location != 'country_stock' AND COALESCE(status,'') != 'expired'${batchLocationCond} ORDER BY remaining_quantity ASC`,
      batchParams
    );

    const branchBatches = await getMany(
      `SELECT location_id, product_name, closing_qty, unit_dp FROM inventory_balances WHERE closing_qty < $1 AND location_type = 'branch' ORDER BY closing_qty ASC`,
      [threshold]
    ).catch(() => []);

    const urgency = (qty) => qty === 0 ? 'out_of_stock' : qty < 3 ? 'critical' : 'low';

    const warehouseItems = batches.map(b => ({
      type: 'warehouse',
      location: b.location,
      productName: b.description,
      currentQty: Number(b.remaining_quantity || b.quantity || 0),
      threshold,
      expiryDate: b.expiry_date,
      urgency: urgency(Number(b.remaining_quantity || b.quantity || 0)),
    }));

    const branchItems = branchBatches.map(b => ({
      type: 'branch',
      location: b.location_id,
      productName: b.product_name,
      currentQty: Number(b.closing_qty || 0),
      threshold,
      urgency: urgency(Number(b.closing_qty || 0)),
    }));

    const allItems = [...warehouseItems, ...branchItems].sort((a, b) => a.currentQty - b.currentQty);

    res.status(200).json({
      success: true,
      alertPolicy,
      threshold,
      items: allItems,
      summary: {
        totalLowStock: allItems.length,
        outOfStock: allItems.filter(i => i.urgency === 'out_of_stock').length,
        critical: allItems.filter(i => i.urgency === 'critical').length,
        low: allItems.filter(i => i.urgency === 'low').length,
      },
    });
  } catch (err) {
    console.error('Low stock report error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
