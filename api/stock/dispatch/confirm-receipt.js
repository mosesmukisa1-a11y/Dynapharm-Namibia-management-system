/**
 * POST /api/stock/dispatch/confirm-receipt
 * Confirm branch receipt of a dispatched stock consignment.
 * Branch inventory increases by exact batch+expiry. Movement posted.
 */
import { postStockMovement, recomputeLocationBalances } from '../../services/stockEngine.js';
import { getOne, query } from '../../db.js';

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
  const { dispatchNoteId, branchId, receivedBy, signature, items } = body;

  if (!dispatchNoteId) return res.status(400).json({ success: false, error: 'dispatchNoteId is required' });
  if (!branchId) return res.status(400).json({ success: false, error: 'branchId is required' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'items array is required' });

  // Validate batch + expiry on every received item
  const validationErrors = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.batchNo || !String(item.batchNo).trim()) {
      validationErrors.push(`Item ${i + 1}: batchNo is required`);
    }
    if (!item.expiryDate || !String(item.expiryDate).trim()) {
      validationErrors.push(`Item ${i + 1}: expiryDate is required`);
    }
    if (!item.qtyReceived || Number(item.qtyReceived) <= 0) {
      validationErrors.push(`Item ${i + 1}: qtyReceived must be > 0`);
    }
  }
  if (validationErrors.length > 0) {
    return res.status(422).json({ success: false, error: 'Receipt validation failed', validationErrors });
  }

  const ts = Date.now();
  const receiptRef = `RCPT-${ts}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const received = [];

  for (const item of items) {
    const productName = item.productName || item.product_name || '';
    if (!productName) continue;

    await postStockMovement({
      productName,
      batchNo: String(item.batchNo).trim(),
      expiryDate: item.expiryDate,
      quantity: Number(item.qtyReceived),
      movementType: 'branch_receipt',
      sourceLocation: 'windhoek_warehouse',
      sourceLocationType: 'warehouse',
      destinationLocation: branchId,
      destinationLocationType: 'branch',
      referenceId: dispatchNoteId,
      notes: item.discrepancyNote ? `Receipt of ${dispatchNoteId}. Note: ${item.discrepancyNote}` : `Receipt of ${dispatchNoteId}`,
      unitDP: Number(item.unitDP || item.unit_dp || 0),
      createdBy: receivedBy || 'system',
      status: 'posted',
    });

    received.push({ productName, batchNo: item.batchNo, expiryDate: item.expiryDate, qtyReceived: Number(item.qtyReceived) });
  }

  // Update dispatch status if it exists in stock_transfers
  await query(
    `UPDATE stock_transfers SET status = 'received', updated_at = NOW() WHERE id = $1`,
    [dispatchNoteId]
  ).catch(() => {});

  // Recompute branch inventory_balances
  recomputeLocationBalances('branch', branchId).catch(e =>
    console.error('[stockEngine] confirm-receipt recompute error:', e.message)
  );

  return res.status(200).json({
    success: true,
    receiptRef,
    dispatchNoteId,
    branchId,
    receivedBy,
    signature: signature || null,
    itemsReceived: received.length,
    items: received,
    message: `${received.length} item(s) received into ${branchId} with batch and expiry recorded.`,
  });
}
