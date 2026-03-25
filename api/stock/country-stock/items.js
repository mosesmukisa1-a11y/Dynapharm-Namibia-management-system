import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const search = url.searchParams.get('search') || '';
    const batchNo = url.searchParams.get('batchNo') || '';
    const productId = url.searchParams.get('productId') || '';

    let batches = await getMany(
      `SELECT id, description, batch_no, barcode, location, remaining_quantity, quantity,
              cif_unit_cost, dpc_unit_value, unit_price, expiry_date
       FROM stock_batches
       WHERE location = 'country_stock'
       ORDER BY description ASC, expiry_date ASC NULLS LAST`
    );

    if (search) batches = batches.filter(b => (b.description || '').toLowerCase().includes(search.toLowerCase()));
    if (batchNo) batches = batches.filter(b => (b.batch_no || b.barcode || '').toLowerCase().includes(batchNo.toLowerCase()));
    if (productId) batches = batches.filter(b => b.id === productId);

    const items = batches.map(b => ({
      productId: b.id,
      productName: b.description,
      batchNo: b.batch_no || b.barcode,
      expiryDate: b.expiry_date,
      closingQty: Number(b.remaining_quantity || b.quantity || 0),
      unitCIF: Number(b.cif_unit_cost || b.unit_price || 0),
      unitDPC: Number(b.dpc_unit_value || b.unit_price || 0),
      stockValueCIF: Number(b.remaining_quantity || b.quantity || 0) * Number(b.cif_unit_cost || b.unit_price || 0),
      stockValueDPC: Number(b.remaining_quantity || b.quantity || 0) * Number(b.dpc_unit_value || b.unit_price || 0),
    }));

    res.status(200).json({ success: true, items, total: items.length });
  } catch (err) {
    console.error('Country stock items error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
