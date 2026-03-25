import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const barcode = url.searchParams.get('barcode') || '';
    const search = url.searchParams.get('search') || '';
    const productId = url.searchParams.get('productId') || '';

    if (barcode) {
      const batch = await getOne('SELECT * FROM stock_batches WHERE barcode = $1', [barcode]);
      if (!batch) return res.status(404).json({ success: false, error: 'Barcode not found' });
      return res.status(200).json({
        success: true,
        productId: batch.id,
        productName: batch.description,
        barcode: batch.barcode,
        batchNo: batch.batch_no,
        location: batch.location,
        quantity: Number(batch.remaining_quantity || batch.quantity || 0),
        expiryDate: batch.expiry_date,
        unitPrice: Number(batch.unit_price || 0),
        cifUnitCost: Number(batch.cif_unit_cost || 0),
        dpcUnitValue: Number(batch.dpc_unit_value || 0),
      });
    }

    if (productId) {
      const batch = await getOne('SELECT * FROM stock_batches WHERE id = $1', [productId]);
      if (!batch) return res.status(404).json({ success: false, error: 'Product not found' });
      return res.status(200).json({
        success: true,
        productId: batch.id,
        productName: batch.description,
        barcode: batch.barcode,
        batchNo: batch.batch_no,
      });
    }

    let batches;
    if (search) {
      batches = await getMany(
        `SELECT id, description, batch_no, barcode, location, remaining_quantity, quantity, expiry_date FROM stock_batches WHERE description ILIKE $1 ORDER BY description ASC LIMIT 100`,
        [`%${search}%`]
      );
    } else {
      batches = await getMany(
        `SELECT id, description, batch_no, barcode, location, remaining_quantity, quantity, expiry_date FROM stock_batches WHERE barcode IS NOT NULL ORDER BY description ASC LIMIT 100`
      );
    }

    const items = batches.map(b => ({
      productId: b.id,
      productName: b.description,
      barcode: b.barcode,
      batchNo: b.batch_no,
      location: b.location,
      quantity: Number(b.remaining_quantity || b.quantity || 0),
      expiryDate: b.expiry_date,
      hasBarcode: !!b.barcode,
    }));

    res.status(200).json({ success: true, items });
  } catch (err) {
    console.error('Barcode error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
