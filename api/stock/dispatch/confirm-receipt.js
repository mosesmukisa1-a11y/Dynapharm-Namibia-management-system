/**
 * POST /api/stock/dispatch/confirm-receipt
 * Confirm branch receipt of a dispatched stock consignment.
 * Branch inventory increases by exact batch+expiry. Movement posted.
 * All writes (stock_movements, branch_inventory_batches, branch_inventory_movements)
 * are executed in a single transaction — partial failures fail the entire request.
 */
import { recomputeLocationBalances } from '../../services/stockEngine.js';
import { getOne, query, withTransaction } from '../../db.js';
import { normalizeBranchSlug } from '../../_lib/branchUtils.js';

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
  const { dispatchNoteId, receivedBy, signature, items } = body;
  const branchId = normalizeBranchSlug(body.branchId);

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

  // Resolve the transfer record — dispatchNoteId may be either a stock_transfers.id or a dispatch_notes.id/barcode.
  // In both cases we must find the underlying stock_transfers row to enforce the GM approval gate.
  let sourceLocation = null;
  let resolvedTransfer = null;
  try {
    // First attempt: dispatchNoteId is a stock_transfers.id directly
    resolvedTransfer = await getOne(
      `SELECT id, from_warehouse, status, gm_approved_by, gm_approved_by_id, gm_approved_at, gm_action
       FROM stock_transfers WHERE id = $1 LIMIT 1`,
      [dispatchNoteId]
    );

    if (!resolvedTransfer) {
      // Second attempt: dispatchNoteId is a dispatch_notes.id or barcode — look up the linked transfer
      const dnRow = await getOne(
        `SELECT from_warehouse, transfer_id FROM dispatch_notes WHERE id = $1 OR barcode = $1 LIMIT 1`,
        [dispatchNoteId]
      );
      if (dnRow?.transfer_id) {
        resolvedTransfer = await getOne(
          `SELECT id, from_warehouse, status, gm_approved_by, gm_approved_by_id, gm_approved_at, gm_action
           FROM stock_transfers WHERE id = $1 LIMIT 1`,
          [dnRow.transfer_id]
        );
      }
    }
  } catch (e) {
    console.warn('[confirm-receipt] Could not resolve transfer record:', e.message);
  }

  if (!resolvedTransfer) {
    // If we could not resolve the transfer at all, deny to be safe.
    console.warn(`[confirm-receipt] Could not resolve transfer for dispatchNoteId=${dispatchNoteId}; denying receipt`);
    return res.status(404).json({
      success: false,
      error: 'Dispatch record not found. Cannot confirm receipt for an unrecognised dispatch reference.',
    });
  }

  sourceLocation = resolvedTransfer.from_warehouse || null;

  // Hard gate: every receipt confirmation requires persisted GM approval evidence.
  // Primary evidence: gm_approved_by_id + gm_approved_by (set server-side on approval).
  // Secondary fallback: gm_action=approve|amend_approve (for records created before this enhancement).
  const hasPersistedGmApproval = !!(resolvedTransfer.gm_approved_by_id && resolvedTransfer.gm_approved_by);
  const hasLegacyGmApproval = (
    resolvedTransfer.gm_action === 'approve' ||
    resolvedTransfer.gm_action === 'amend_approve'
  );
  if (!hasPersistedGmApproval && !hasLegacyGmApproval) {
    return res.status(403).json({
      success: false,
      error: 'Receipt cannot be confirmed: this dispatch has not been approved by a General Manager. GM approval must be recorded before stock can be received.',
    });
  }

  // Idempotency guard: if the transfer is already in a terminal receipt status, block to prevent
  // double-counting in branch_inventory_batches.  The branch portal (handleReceiveTransfer) sets
  // status → 'delivered'/'partially_received'; this endpoint sets it → 'received'.  If either
  // path has already run, deny the second attempt instead of adding stock twice.
  const ALREADY_RECEIVED_STATUSES = new Set(['received', 'delivered', 'partially_received', 'completed']);
  if (resolvedTransfer.status && ALREADY_RECEIVED_STATUSES.has(resolvedTransfer.status)) {
    return res.status(409).json({
      success: false,
      error: `This dispatch has already been received (status: ${resolvedTransfer.status}). Duplicate receipt blocked to protect inventory accuracy.`,
    });
  }

  if (!sourceLocation) {
    console.warn(`[confirm-receipt] Source warehouse not found for resolvedTransfer.id=${resolvedTransfer.id}; source_location will be null`);
  }

  const ts = Date.now();
  const receiptRef = `RCPT-${ts}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  let received;
  try {
    received = await withTransaction(async (client) => {
      // ── Concurrency guard: re-read transfer status under a row lock ─────────
      // The pre-transaction status check (lines above) is a fast-path guard but
      // is not race-safe — two concurrent receipt confirmations can both pass it.
      // Acquiring FOR UPDATE here serialises them: the second request will see the
      // status already set to 'received' by the first and must abort.
      const lockedTransfer = await client.query(
        `SELECT status FROM stock_transfers WHERE id = $1 FOR UPDATE`,
        [resolvedTransfer.id]
      );
      const lockedStatus = lockedTransfer.rows[0]?.status;
      const ALREADY_RECEIVED = new Set(['received', 'delivered', 'partially_received', 'completed']);
      if (lockedStatus && ALREADY_RECEIVED.has(lockedStatus)) {
        const err = new Error(
          `Duplicate receipt blocked: transfer ${resolvedTransfer.id} is already '${lockedStatus}'. ` +
          `A concurrent confirmation was processed first.`
        );
        err.statusCode = 409;
        throw err;
      }
      // ─────────────────────────────────────────────────────────────────────────

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

        // Look up unit_dp and unit_cif from the source warehouse batch for accurate value tracking.
        let unitDP = Number(item.unitDP || item.unit_dp || 0);
        let unitCIF = Number(item.unitCIF || item.unit_cif || 0);
        // #10 Batch traceability: always look up source_batch_id for full recall tracing
        let sourceBatchId = null;
        if (sourceLocation) {
          const batchVal = await client.query(
            `SELECT id, dpc_unit_value, cif_unit_cost FROM stock_batches
             WHERE location = $1
               AND LOWER(TRIM(description)) = LOWER(TRIM($2))
               AND COALESCE(batch_no, '') = $3
             ORDER BY import_date ASC, created_at ASC LIMIT 1`,
            [sourceLocation, productName, batchNo]
          );
          if (batchVal.rows.length > 0) {
            sourceBatchId = batchVal.rows[0].id || null;
            if (!unitDP) unitDP = Number(batchVal.rows[0].dpc_unit_value || 0);
            if (!unitCIF) unitCIF = Number(batchVal.rows[0].cif_unit_cost || 0);
          }
        }

        // 1. Write to stock_movements (branch_receipt with full value data)
        const movId = generateId('SM');
        await client.query(
          `INSERT INTO stock_movements
             (id, product_name, batch_no, expiry_date, quantity,
              movement_type, source_location, source_location_type,
              destination_location, destination_location_type,
              unit_dp, unit_cif, reference_id, notes, created_by,
              movement_date, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,'branch_receipt',$6,'warehouse',$7,'branch',$8,$9,$10,$11,$12,NOW(),'posted',NOW(),NOW())`,
          [movId, productName, batchNo, expirySqlDate, qtyReceived,
           sourceLocation, branchId,
           unitDP || null, unitCIF || null,
           dispatchNoteId, notes, receivedBy || 'system']
        );

        // 2. Warehouse stock deduction is intentionally skipped here.
        // The stock_transfers PUT handler already calls fefoDeductStockBatches when the
        // transfer transitions to 'approved' (GM approval step), physically reserving the
        // units in stock_batches at that point. Deducting again here would double-count
        // and drive remaining_quantity negative. The stock_movements entry above provides
        // the full audit trail of the physical movement.

        // 3. Upsert into branch_inventory_batches (carry unit_price for DP value tracking)
        // source_batch_id (#10) links this row back to the exact stock_batch for recall tracing.
        const batchId = generateId('BIB');
        await client.query(
          `INSERT INTO branch_inventory_batches (id, branch_id, product_name, batch_no, expiry_date, quantity, unit_price, source_warehouse, source_batch_id, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, 'in_stock', NOW(), NOW())
           ON CONFLICT (branch_id, product_name, batch_no, expiry_date) DO UPDATE
             SET quantity = branch_inventory_batches.quantity + EXCLUDED.quantity,
                 unit_price = COALESCE(EXCLUDED.unit_price, branch_inventory_batches.unit_price),
                 source_warehouse = COALESCE(EXCLUDED.source_warehouse, branch_inventory_batches.source_warehouse),
                 source_batch_id = COALESCE(EXCLUDED.source_batch_id, branch_inventory_batches.source_batch_id),
                 updated_at = NOW()`,
          [batchId, branchId, productName, batchNo, expirySqlDate, qtyReceived,
           unitDP || null, sourceLocation || null, sourceBatchId]
        );

        // 4. Insert into branch_inventory_movements
        // source_branch_id = source warehouse so the branch inventory enrichment
        // query can surface the SOURCE column in the branch portal.
        const bimId = generateId('BIM');
        await client.query(
          `INSERT INTO branch_inventory_movements (id, branch_id, type, product_name, batch_no, quantity, unit_price, source_branch_id, reference, notes, created_by, created_at)
           VALUES ($1, $2, 'receive', $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
          [bimId, branchId, productName, batchNo, qtyReceived, unitDP || null,
           sourceLocation || null,
           dispatchNoteId,
           `Received from warehouse — dispatch ${dispatchNoteId}${item.discrepancyNote ? ` (${item.discrepancyNote})` : ''}`,
           receivedBy || 'system']
        );

        result.push({ productName, batchNo, expiryDate, qtyReceived, unitDP, unitCIF });
      }

      // Update dispatch status within the same transaction.
      // Use resolvedTransfer.id (the actual stock_transfers.id) to ensure correct update
      // regardless of whether dispatchNoteId was a transfer ID or a dispatch note reference.
      await client.query(
        `UPDATE stock_transfers SET status = 'received', updated_at = NOW() WHERE id = $1`,
        [resolvedTransfer.id]
      );

      // ── #11: Dispatch note auto-close ────────────────────────────────────────
      // Mark the linked dispatch note 'completed' once the transfer is fully received.
      await client.query(
        `UPDATE dispatch_notes SET status='completed', updated_at=NOW()
         WHERE transfer_id=$1 OR id=$2 OR barcode=$2`,
        [resolvedTransfer.id, dispatchNoteId]
      ).catch(e => console.warn('[confirm-receipt] dispatch-note close warning:', e.message));

      // ── #4: Short-delivery discrepancy detection ─────────────────────────────
      // Compare received qty per item vs the qty recorded in stock_transfer_items.
      // Any shortfall is logged in stock_transfer_discrepancies and notifies the stock manager.
      try {
        const transferItemsRes = await client.query(
          `SELECT product_name, COALESCE(quantity_approved, quantity) AS dispatched_qty
           FROM stock_transfer_items WHERE transfer_id=$1`,
          [resolvedTransfer.id]
        );
        const dispatchedMap = new Map();
        for (const ti of transferItemsRes.rows) {
          dispatchedMap.set((ti.product_name || '').toLowerCase().trim(), Number(ti.dispatched_qty || 0));
        }

        let discrepancyCount = 0;
        for (const item of items) {
          const pName = (item.productName || item.product_name || '').trim();
          const received   = Number(item.qtyReceived || 0);
          const dispatched = dispatchedMap.get(pName.toLowerCase()) || 0;
          if (dispatched > 0 && received < dispatched) {
            const shortfall = dispatched - received;
            const discrepId = `DISC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
            await client.query(
              `INSERT INTO stock_transfer_discrepancies
                 (id, transfer_id, dispatch_note_id, branch_id, product_name, batch_no,
                  dispatched_qty, received_qty, shortfall_qty, notes, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
               ON CONFLICT DO NOTHING`,
              [discrepId, resolvedTransfer.id, dispatchNoteId, branchId, pName,
               item.batchNo || null, dispatched, received, shortfall,
               item.discrepancyNote || `Short delivery: dispatched ${dispatched}, received ${received}`]
            );
            discrepancyCount++;
          }
        }

        if (discrepancyCount > 0) {
          const notifId = `NOTIF-DISC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          await client.query(
            `INSERT INTO notifications (id, recipient_type, recipient_id, title, message, type, is_read, created_at)
             VALUES ($1,'staff','stock',$2,$3,'warning',false,NOW()) ON CONFLICT DO NOTHING`,
            [notifId,
             `⚠️ Short Delivery — ${branchId.replace(/_/g, ' ')}`,
             `Transfer ${resolvedTransfer.id} from ${(sourceLocation || 'warehouse').replace(/_/g, ' ')} was received at ${branchId.replace(/_/g, ' ')} with ${discrepancyCount} short-delivered item(s). Please investigate and reconcile with the dispatch note.`]
          );
          console.warn(`[confirm-receipt] ${discrepancyCount} discrepancy(ies) recorded for transfer ${resolvedTransfer.id}`);
        }
      } catch (discrepErr) {
        console.warn('[confirm-receipt] discrepancy check error:', discrepErr.message);
      }
      // ── End discrepancy detection ─────────────────────────────────────────────

      return result;
    });
  } catch (err) {
    console.error('[confirm-receipt] transaction error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to record receipt: ' + err.message });
  }

  // Recompute both the branch (inflow) and source warehouse (outflow).
  // Both run fire-and-forget — transaction is already committed at this point.
  recomputeLocationBalances('branch', branchId).catch(e =>
    console.error('[stockEngine] confirm-receipt branch recompute error:', e.message)
  );
  if (sourceLocation) {
    recomputeLocationBalances('warehouse', sourceLocation).catch(e =>
      console.error('[stockEngine] confirm-receipt warehouse recompute error:', e.message)
    );
  }

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
