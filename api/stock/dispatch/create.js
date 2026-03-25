/**
 * POST /api/stock/dispatch/create
 * Create a warehouse dispatch to a branch. Enforces batch + expiry per item.
 */
import { query, getOne } from '../../db.js';

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
  const { sourceWarehouseId, destinationBranchId, items, preparedBy, notes } = body;

  if (!sourceWarehouseId) return res.status(400).json({ success: false, error: 'sourceWarehouseId is required' });
  if (!destinationBranchId) return res.status(400).json({ success: false, error: 'destinationBranchId is required' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'items array is required' });

  // Validate all items: batch + expiry + available stock
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
    return res.status(422).json({ success: false, error: 'Dispatch validation failed', validationErrors });
  }

  // Check stock availability for each batch
  const stockErrors = [];
  for (const item of items) {
    const productName = item.productName || item.product_name || '';
    if (!productName) continue;
    const available = await getOne(
      `SELECT COALESCE(closing_qty, 0) as qty FROM inventory_balances
       WHERE location_type = 'warehouse' AND location_id = $1
         AND product_name = $2 AND batch_no = $3`,
      [sourceWarehouseId, productName, item.batchNo]
    );
    const availQty = Number(available?.qty || 0);
    if (availQty < Number(item.quantity)) {
      stockErrors.push(`${productName} batch ${item.batchNo}: requested ${item.quantity}, available ${availQty}`);
    }
  }
  if (stockErrors.length > 0) {
    return res.status(409).json({ success: false, error: 'Insufficient stock for dispatch', stockErrors });
  }

  // Create a stock_transfer record
  const ts = Date.now();
  const dispatchId = `DISP-${ts}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  await query(
    `INSERT INTO stock_transfers (id, from_warehouse, to_branch, dispatch_notes, status, dispatched_by, created_by, created_at, updated_at, metadata)
     VALUES ($1, $2, $3, $4, 'pending_dispatch', $5, $5, NOW(), NOW(), $6)`,
    [dispatchId, sourceWarehouseId, destinationBranchId, notes || `Dispatch from ${sourceWarehouseId}`,
      preparedBy || 'system',
      JSON.stringify({ sourceWarehouseId, destinationBranchId, items, preparedBy })]
  );

  return res.status(201).json({
    success: true,
    dispatchId,
    sourceWarehouseId,
    destinationBranchId,
    itemsCount: items.length,
    status: 'pending_dispatch',
    message: `Dispatch ${dispatchId} created. Items have batch and expiry validated.`,
  });
}
