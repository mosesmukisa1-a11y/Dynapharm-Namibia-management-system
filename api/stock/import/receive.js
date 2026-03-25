/**
 * POST /api/stock/import/receive
 * Receive supplier import into warehouse. Enforces batch + expiry on every item.
 */
import { postStockMovement } from '../../services/stockEngine.js';
import { getOne } from '../../db.js';

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
  const { supplierId, warehouseId, items, receivedBy, notes } = body;

  if (!warehouseId) return res.status(400).json({ success: false, error: 'warehouseId is required' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'items array is required and must not be empty' });

  // Validate ALL items before posting any
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

    await postStockMovement({
      productName,
      batchNo: String(item.batchNo).trim(),
      expiryDate: item.expiryDate,
      quantity: Number(item.quantity),
      movementType: 'supplier_import_receipt',
      sourceLocation: supplierId || 'supplier',
      sourceLocationType: 'supplier',
      destinationLocation: warehouseId,
      destinationLocationType: 'warehouse',
      referenceId: refId,
      notes: notes || 'Supplier import receipt',
      unitDP: Number(item.unitDP || item.unit_dp || 0),
      createdBy: receivedBy || 'system',
      status: 'posted',
    });
    posted.push({ productName, batchNo: item.batchNo, expiryDate: item.expiryDate, quantity: Number(item.quantity) });
  }

  return res.status(201).json({
    success: true,
    referenceId: refId,
    warehouseId,
    itemsPosted: posted.length,
    items: posted,
    message: `${posted.length} item(s) received into warehouse ${warehouseId}`,
  });
}
