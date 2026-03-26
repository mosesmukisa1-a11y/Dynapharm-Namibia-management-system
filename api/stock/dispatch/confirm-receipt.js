/**
 * POST /api/stock/dispatch/confirm-receipt
 * Confirm branch receipt of a dispatched stock consignment.
 * Branch inventory increases by exact batch+expiry. Movement posted.
 * All writes (stock_movements, branch_inventory_batches, branch_inventory_movements)
 * are executed in a single transaction — partial failures fail the entire request.
 */
import { recomputeLocationBalances } from '../../services/stockEngine.js';
import { getOne, query, withTransaction } from '../../db.js';

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function toSqlDate(value) {
  if (!value) return null;
  const normalized = value.length === 7 ? `${value}-01` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
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

  // Resolve the actual source warehouse from the dispatch note or transfer record
  let sourceLocation = null;
  try {
    const transferRow = await getOne(
      `SELECT from_warehouse FROM stock_transfers WHERE id = $1 LIMIT 1`,
      [dispatchNoteId]
    );
    if (transferRow?.from_warehouse) {
      sourceLocation = transferRow.from_warehouse;
    } else {
      const dnRow = await getOne(
        `SELECT from_warehouse FROM dispatch_notes WHERE id = $1 OR transfer_id = $1 LIMIT 1`,
        [dispatchNoteId]
      );
      if (dnRow?.from_warehouse) {
        sourceLocation = dnRow.from_warehouse;
      }
    }
  } catch (e) {
    console.warn('[confirm-receipt] Could not resolve source warehouse:', e.message);
  }
  if (!sourceLocation) {
    console.warn(`[confirm-receipt] Source warehouse not found for dispatchNoteId=${dispatchNoteId}; source_location will be null`);
  }

  const ts = Date.now();
  const receiptRef = `RCPT-${ts}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  let received;
  try {
    received = await withTransaction(async (client) => {
      const result = [];

      for (const item of items) {
        const productName = item.productName || item.product_name || '';
        if (!productName) continue;

        const batchNo = String(item.batchNo).trim();
        const expiryDate = item.expiryDate;
        const qtyReceived = Number(item.qtyReceived);
        const expirySqlDate = toSqlDate(expiryDate);
        const notes = item.discrepancyNote
          ? `Receipt of ${dispatchNoteId}. Note: ${item.discrepancyNote}`
          : `Receipt of ${dispatchNoteId}`;

        // 1. Write to stock_movements
        const movId = generateId('SM');
        await client.query(
          `INSERT INTO stock_movements
             (id, product_name, batch_no, expiry_date, quantity,
              movement_type, source_location, source_location_type,
              destination_location, destination_location_type,
              unit_dp, reference_id, notes, created_by,
              movement_date, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,'branch_receipt',$6,'warehouse',$7,'branch',$8,$9,$10,$11,NOW(),'posted',NOW(),NOW())`,
          [movId, productName, batchNo, expirySqlDate, qtyReceived,
           sourceLocation, branchId,
           Number(item.unitDP || item.unit_dp || 0),
           dispatchNoteId, notes, receivedBy || 'system']
        );

        // 2. Upsert into branch_inventory_batches
        const batchId = generateId('BIB');
        await client.query(
          `INSERT INTO branch_inventory_batches (id, branch_id, product_name, batch_no, expiry_date, quantity, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5::date, $6, 'in_stock', NOW(), NOW())
           ON CONFLICT (branch_id, product_name, batch_no, expiry_date) DO UPDATE
             SET quantity = branch_inventory_batches.quantity + EXCLUDED.quantity, updated_at = NOW()`,
          [batchId, branchId, productName, batchNo, expirySqlDate, qtyReceived]
        );

        // 3. Insert into branch_inventory_movements
        const bimId = generateId('BIM');
        await client.query(
          `INSERT INTO branch_inventory_movements (id, branch_id, type, product_name, batch_no, quantity, reference, notes, created_by, created_at)
           VALUES ($1, $2, 'receive', $3, $4, $5, $6, $7, $8, NOW())`,
          [bimId, branchId, productName, batchNo, qtyReceived, dispatchNoteId,
           `Received from warehouse — dispatch ${dispatchNoteId}${item.discrepancyNote ? ` (${item.discrepancyNote})` : ''}`,
           receivedBy || 'system']
        );

        result.push({ productName, batchNo, expiryDate, qtyReceived });
      }

      // Update dispatch status within the same transaction
      await client.query(
        `UPDATE stock_transfers SET status = 'received', updated_at = NOW() WHERE id = $1`,
        [dispatchNoteId]
      );

      return result;
    });
  } catch (err) {
    console.error('[confirm-receipt] transaction error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to record receipt: ' + err.message });
  }

  // Recompute branch inventory_balances (non-critical, fire-and-forget)
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
