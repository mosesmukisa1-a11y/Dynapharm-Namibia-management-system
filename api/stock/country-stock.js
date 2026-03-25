import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const batches = await getMany(
      `SELECT id, description, batch_no, barcode, location, remaining_quantity, quantity,
              cif_unit_cost, dpc_unit_value, unit_price, expiry_date, import_date as created_at
       FROM stock_batches
       WHERE location = 'country_stock'
       ORDER BY description ASC, expiry_date ASC NULLS LAST`
    );

    const distinctProducts = new Set(batches.map(b => b.description)).size;
    const totalUnits = batches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0), 0);
    const cifValue = batches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0) * Number(b.cif_unit_cost || b.unit_price || 0), 0);
    const dpcValue = batches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0) * Number(b.dpc_unit_value || b.unit_price || 0), 0);
    const lowStockItems = batches.filter(b => Number(b.remaining_quantity || b.quantity || 0) < 10 && Number(b.remaining_quantity || b.quantity || 0) > 0).length;

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

    res.status(200).json({
      success: true,
      summary: {
        distinctProducts,
        totalUnits,
        cifValue: parseFloat(cifValue.toFixed(2)),
        dpcValue: parseFloat(dpcValue.toFixed(2)),
        lowStockItems,
      },
      items,
    });
  } catch (err) {
    console.error('Country stock error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
