/**
 * POST /api/stock/import/receive
 * Receive supplier import into country stock (staging layer).
 * All imported stock lands at country_stock first — it must be
 * explicitly released to a warehouse before further distribution.
 *
 * Writes:
 *   1. stock_movements (supplier_import_receipt) — movement ledger entry
 *   2. stock_batches at country_stock — physical batch record with cost data
 */
import { query } from '../../db.js';
import { postStockMovement, recomputeLocationBalances } from '../../services/stockEngine.js';

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const body = await parseBody(req);
  const { supplierId, supplierImportId, items, receivedBy, notes } = body;

  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'items array is required and must not be empty' });

  const validationErrors = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.batchNo || !String(item.batchNo).trim()) {
      validationErrors.push(`Item ${i + 1} (${item.productName || item.productId || 'unknown'}): batchNo is required`);
    }
    if (!item.expiryDate || !String(item.expiryDate).trim()) {
      validationErrors.push(`Item ${i + 1} (${item.productName || item.productId || 'unknown'}): expiryDate is required`);
    }
    if (!item.quantity || Number(item.quantity) <= 0) {
      validationErrors.push(`Item ${i + 1}: quantity must be > 0`);
    }
  }
  if (validationErrors.length > 0) {
    return res.status(422).json({ success: false, error: 'Batch/expiry validation failed', validationErrors });
  }

  const ts = Date.now();
  const refId = `IMPORT-${ts}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const posted = [];

  for (const item of items) {
    const productName = item.productName || item.product_name || '';
    if (!productName) continue;

    const batchNo = String(item.batchNo).trim();
    const qty = Number(item.quantity);
    const unitDP = Number(item.unitDP || item.unit_dp || item.dpc_unit_value || 0);
    const unitCIF = Number(item.unitCIF || item.unit_cif || item.cif_unit_cost || 0);

    // 1. Post stock movement record
    await postStockMovement({
      productName,
      batchNo,
      expiryDate: item.expiryDate,
      quantity: qty,
      movementType: 'supplier_import_receipt',
      sourceLocation: supplierId || 'supplier',
      sourceLocationType: 'supplier',
      destinationLocation: 'country_stock',
      destinationLocationType: 'country',
      referenceId: refId,
      notes: notes || 'Supplier import receipt — held at country stock',
      unitDP,
      unitCIF: unitCIF || null,
      createdBy: receivedBy || 'system',
      status: 'posted',
    });

    // 2. Create or increment stock_batches row at country_stock
    const batchId = `SB-IMP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const barcode = `BC-IMP-${batchNo}-${Date.now().toString(36).toUpperCase()}`;
    await query(
      `INSERT INTO stock_batches
         (id, barcode, description, batch_no, expiry_date,
          quantity, remaining_quantity, dispatched_quantity,
          import_date, location, status,
          product_id, supplier_name, import_reference, supplier_import_id,
          dpc_unit_value, dpc_total_value,
          cif_unit_cost, cif_total_value,
          unit_price, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5::date,$6,$6,0,NOW(),'country_stock','available',
               $7,$8,$9,$10,$11,$11*$6,$12,$12*$6,$11,$13,NOW(),NOW())
       ON CONFLICT DO NOTHING`,
      [
        batchId, barcode, productName, batchNo, item.expiryDate,
        qty,
        item.productId || null,
        supplierId || null,
        refId,
        supplierImportId || null,
        unitDP || null,
        unitCIF || null,
        notes || null,
      ]
    );

    posted.push({ productName, batchNo, expiryDate: item.expiryDate, quantity: qty });
  }

  try {
    await recomputeLocationBalances('country', 'country_stock');
  } catch (err) {
    console.error('[receive] post-import recompute error:', err.message);
  }

  return res.status(201).json({
    success: true,
    referenceId: refId,
    destinationLocation: 'country_stock',
    itemsPosted: posted.length,
    items: posted,
    message: `${posted.length} item(s) received into Country Stock (staging). Use Release to Warehouse to distribute.`,
  });
}
