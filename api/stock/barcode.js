import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne } from '../db.js';

/**
 * Enrich a batch row with DP/CP prices from product_prices (matched by description).
 * Falls back to the batch's own dpc_unit_value → unit_price chain when no price row exists.
 */
async function enrichWithPrices(batch) {
  const qty = Number(batch.remaining_quantity || batch.quantity || 0);
  let dp = Number(batch.dpc_unit_value || batch.unit_price || 0);
  let cp = 0;
  let bv = 0;

  try {
    const price = await getOne(
      `SELECT dp, cp, bv FROM product_prices
       WHERE LOWER(TRIM(description)) = LOWER(TRIM($1))
       LIMIT 1`,
      [batch.description || '']
    );
    if (price) {
      dp = Number(price.dp || dp);
      cp = Number(price.cp || 0);
      bv = Number(price.bv || 0);
    }
  } catch (_) {
    // price lookup is best-effort; fall back to batch values
  }

  return { qty, dp, cp, bv };
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const barcode   = url.searchParams.get('barcode')   || '';
    const search    = url.searchParams.get('search')    || '';
    const productId = url.searchParams.get('productId') || '';

    if (barcode) {
      const batch = await getOne(
        'SELECT * FROM stock_batches WHERE barcode = $1 OR qr_code = $1 LIMIT 1',
        [barcode]
      );
      if (!batch) return res.status(404).json({ success: false, error: 'Barcode not found' });

      const { qty, dp, cp, bv } = await enrichWithPrices(batch);

      if (qty <= 0) {
        return res.status(200).json({
          success: false,
          outOfStock: true,
          error: 'No stock available for this barcode',
          productName: batch.description,
          barcode: batch.barcode,
          location: batch.location,
          quantity: 0,
        });
      }

      return res.status(200).json({
        success: true,
        productId: batch.id,
        productName: batch.description,
        barcode: batch.barcode,
        batchNo: batch.batch_no,
        location: batch.location,
        quantity: qty,
        expiryDate: batch.expiry_date,
        unitPrice: dp,
        dp,
        cp,
        bv,
        cifUnitCost: Number(batch.cif_unit_cost || 0),
        dpcUnitValue: Number(batch.dpc_unit_value || 0),
      });
    }

    if (productId) {
      const batch = await getOne('SELECT * FROM stock_batches WHERE id = $1', [productId]);
      if (!batch) return res.status(404).json({ success: false, error: 'Product not found' });
      const { dp, cp, bv } = await enrichWithPrices(batch);
      return res.status(200).json({
        success: true,
        productId: batch.id,
        productName: batch.description,
        barcode: batch.barcode,
        batchNo: batch.batch_no,
        dp,
        cp,
        bv,
        unitPrice: dp,
      });
    }

    let batches;
    if (search) {
      batches = await getMany(
        `SELECT id, description, batch_no, barcode, location, remaining_quantity, quantity, expiry_date
         FROM stock_batches
         WHERE description ILIKE $1
         ORDER BY description ASC LIMIT 100`,
        [`%${search}%`]
      );
    } else {
      batches = await getMany(
        `SELECT id, description, batch_no, barcode, location, remaining_quantity, quantity, expiry_date
         FROM stock_batches
         WHERE barcode IS NOT NULL
         ORDER BY description ASC LIMIT 100`
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
