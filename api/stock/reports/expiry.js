import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const expiryDays = parseInt(url.searchParams.get('days') || '90', 10);
    const location = url.searchParams.get('location') || '';

    const threshold = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    const params = [threshold];
    let locationCond = '';
    if (location) { params.push(`%${location}%`); locationCond = ` AND location ILIKE $${params.length}`; }

    const batches = await getMany(
      `SELECT id, description, batch_no, location, remaining_quantity, quantity, cif_unit_cost, dpc_unit_value, unit_price, expiry_date FROM stock_batches WHERE expiry_date IS NOT NULL AND expiry_date <= $1 AND location != 'country_stock' AND remaining_quantity > 0${locationCond} ORDER BY expiry_date ASC`,
      params
    );

    const branchParams = [threshold];
    const branchBatches = await getMany(
      `SELECT location_id, product_name, batch_no, closing_qty, unit_dp, expiry_date FROM inventory_balances WHERE expiry_date IS NOT NULL AND expiry_date <= $1 AND location_type = 'branch' ORDER BY expiry_date ASC`,
      branchParams
    ).catch(() => []);

    const expired = batches.filter(b => b.expiry_date && b.expiry_date < today);
    const expiring = batches.filter(b => b.expiry_date && b.expiry_date >= today);

    const daysUntil = (d) => Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24));

    res.status(200).json({
      success: true,
      expiringSoon: expiring.map(b => ({
        type: 'warehouse',
        location: b.location,
        productName: b.description,
        batchNo: b.batch_no,
        qty: Number(b.remaining_quantity || b.quantity || 0),
        expiryDate: b.expiry_date,
        daysUntilExpiry: daysUntil(b.expiry_date),
        valueAtRisk: Number(b.remaining_quantity || b.quantity || 0) * Number(b.dpc_unit_value || b.unit_price || 0),
      })),
      branchExpiringSoon: branchBatches.map(b => ({
        type: 'branch',
        location: b.location_id,
        productName: b.product_name,
        batchNo: b.batch_no,
        qty: Number(b.closing_qty || 0),
        expiryDate: b.expiry_date,
        daysUntilExpiry: daysUntil(b.expiry_date),
        valueAtRisk: Number(b.closing_qty || 0) * Number(b.unit_dp || 0),
      })),
      expired: expired.map(b => ({
        type: 'warehouse',
        location: b.location,
        productName: b.description,
        batchNo: b.batch_no,
        qty: Number(b.remaining_quantity || b.quantity || 0),
        expiryDate: b.expiry_date,
        valueAtRisk: Number(b.remaining_quantity || b.quantity || 0) * Number(b.dpc_unit_value || b.unit_price || 0),
      })),
      summary: {
        expiringSoonCount: expiring.length + branchBatches.length,
        expiredCount: expired.length,
      },
    });
  } catch (err) {
    console.error('Expiry report error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
