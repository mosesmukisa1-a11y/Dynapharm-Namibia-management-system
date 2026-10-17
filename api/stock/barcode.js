import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
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
    const price = await __qd_executePlan(getOne, __qd_registeredPlan("api/stock/barcode.js:16:0"),



    [batch.description || '']);

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
    const barcode = url.searchParams.get('barcode') || '';
    const search = url.searchParams.get('search') || '';
    const productId = url.searchParams.get('productId') || '';

    if (barcode) {
      const configured = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/barcode.js:45:1"),
      [barcode]);
      if (configured.length) {
        if (configured.length !== 1) return res.status(409).json({ success: false, error: 'Ambiguous pack barcode' });
        const config = configured[0],pack = config.packs.find((p) => p.barcode === barcode);
        const price = await __qd_executePlan(getOne, __qd_registeredPlan("api/stock/barcode.js:50:2"), [config.product_name]);
        return res.json({ success: true, productName: config.product_name, enteredUnit: pack.unit,
          baseUnit: config.base_unit, conversionFactor: pack.factor, barcode,
          dp: price?.dp == null ? null : Number(price.dp), cp: price?.cp == null ? null : Number(price.cp),
          bv: price?.bv == null ? null : Number(price.bv), fefoEnforced: true });
      }
      // ── Priority 1: permanent product_code from the GM price list ──────────
      // Scanning a product code (e.g. NB9845) returns product identity only.
      // FEFO batch selection happens at sale/dispense time on the backend.
      const productRow = await __qd_executePlan(getOne, __qd_registeredPlan("api/stock/barcode.js:60:3"),




      [barcode.trim().toUpperCase()]);

      if (productRow) {
        return res.status(200).json({
          success: true,
          productName: productRow.description,
          barcode: productRow.product_code,
          productCode: productRow.product_code,
          dp: Number(productRow.dp || 0),
          cp: Number(productRow.cp || 0),
          bv: Number(productRow.bv || 0),
          cifUnitCost: Number(productRow.cif || 0),
          unitPrice: Number(productRow.dp || 0),
          // No batch/stock fields — FEFO is applied at sale time
          fefoEnforced: true
        });
      }

      // ── Priority 2: legacy batch-level barcode on stock_batches ─────────────
      const batch = await __qd_executePlan(getOne, __qd_registeredPlan("api/stock/barcode.js:84:4"),

      [barcode]);

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
          quantity: 0
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
        dpcUnitValue: Number(batch.dpc_unit_value || 0)
      });
    }

    if (productId) {
      const batch = await __qd_executePlan(getOne, __qd_registeredPlan("api/stock/barcode.js:122:5"), [productId]);
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
        unitPrice: dp
      });
    }

    let batches;
    if (search) {
      batches = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/barcode.js:141:6"),




      [`%${search}%`]);

    } else {
      batches = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/barcode.js:149:7"), []);





    }

    const items = batches.map((b) => ({
      productId: b.id,
      productName: b.description,
      barcode: b.barcode,
      batchNo: b.batch_no,
      location: b.location,
      quantity: Number(b.remaining_quantity || b.quantity || 0),
      expiryDate: b.expiry_date,
      hasBarcode: !!b.barcode
    }));

    res.status(200).json({ success: true, items });
  } catch (err) {
    console.error('Barcode error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
