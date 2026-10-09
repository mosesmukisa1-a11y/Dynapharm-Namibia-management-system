import { createHash, randomUUID } from 'node:crypto';
import { getBranchScope } from '../_lib/auth.js';
import { normalizeBranchSlug, branchSearchTerms } from '../_lib/branchUtils.js';
import { inferLocationType } from './stockEngine.js';
import { lockStockBatchTx } from './stockLocks.js';

const key = (product, batch, expiry) => JSON.stringify([
  String(product || '').trim().toLowerCase(), batch || '',
  expiry instanceof Date ? expiry.toISOString().slice(0, 10) : String(expiry || '').slice(0, 10),
]);
function reject(message, statusCode = 409) {
  throw Object.assign(new Error(message), { statusCode });
}

// Used by both regular and barcode receipt. Quantities on the regular route
// are cumulative; barcode quantities are increments with a repeat-safe key.
export async function receiveTransferTx(client, { transferId, items = [], user, mode = 'cumulative', receiptId, requestedStatus }) {
  if (!user) reject('Authentication required', 401);
  const transfer = (await client.query('SELECT * FROM stock_transfers WHERE id = $1 FOR UPDATE', [transferId])).rows[0];
  if (!transfer) reject('Transfer not found', 404);
  if (!['dispatched', 'in_transit', 'partially_received'].includes(transfer.status)) reject(`Transfer cannot be received from status '${transfer.status}'.`);
  if (!transfer.gm_approved_by) reject('GM approval is required before receipt.', 403);
  const branch = normalizeBranchSlug(transfer.to_branch) || transfer.to_branch;
  const branchAliases = [...new Set([branch,transfer.to_branch,...branchSearchTerms(branch)].filter(Boolean).map(value=>value.toLowerCase().trim()))];
  if (inferLocationType(transfer.to_branch) !== 'branch') reject('Use warehouse receipt for a warehouse destination.', 400);
  const scope = getBranchScope(user);
  if (scope.enforced && !scope.branches.map(b => normalizeBranchSlug(b) || b).includes(branch)) reject('You cannot receive stock for this branch.', 403);
  const lines = (await client.query('SELECT * FROM stock_transfer_items WHERE transfer_id = $1 ORDER BY id FOR UPDATE', [transferId])).rows;
  if (!lines.length) reject('Transfer has no lines.', 400);
  // Legacy barcode receipts used dispatch-note references. Recognize both.
  const prior = (await client.query(
    `SELECT sm.product_name, sm.batch_no, sm.expiry_date, SUM(sm.quantity) AS quantity
     FROM stock_movements sm
     WHERE sm.status IN ('posted','approved')
       AND sm.movement_type IN ('transfer_in','branch_receipt','transit_receipt')
       AND (sm.reference_id = $1 OR sm.reference_id IN (SELECT id FROM dispatch_notes WHERE transfer_id = $1))
       AND LOWER(TRIM(sm.destination_location)) = ANY($2::text[])
     GROUP BY sm.product_name, sm.batch_no, sm.expiry_date`,
    [transferId, branchAliases]
  )).rows;
  const received = new Map();
  for (const row of prior) {
    const batchKey = key(row.product_name, row.batch_no, row.expiry_date);
    received.set(batchKey, (received.get(batchKey) || 0) + Number(row.quantity));
  }
  const hasTransit = (await client.query("SELECT 1 FROM stock_movements WHERE reference_id = $1 AND movement_type = 'transit_dispatch' AND status = 'posted' LIMIT 1", [transferId])).rowCount > 0;
  const normalizedItems = items.map(item => ({
    product: item.product_name || item.productName || item.product || item.name,
    batch: item.batch_no ?? item.batchNo ?? null,
    expiry: item.expiry_date ?? item.expiryDate ?? null,
    qty: item.qtyReceived ?? item.quantity_received ?? item.quantityReceived ?? item.quantity ?? item.qty,
  }));
  const selected = new Map();
  for (const item of normalizedItems) {
    const matches = lines.filter(line => key(line.product_name, line.batch_no, line.expiry_date) === key(item.product, item.batch, item.expiry));
    if (matches.length !== 1) reject('Received product, batch and expiry must match exactly one dispatched line.', 400);
    if (selected.has(matches[0].id)) reject('Duplicate receipt line.', 400);
    const qty = Number(item.qty);
    if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) reject('Receipt quantity must be a finite whole base-unit quantity.', 400);
    selected.set(matches[0].id, qty);
  }
  if (mode === 'increment' && !normalizedItems.length) reject('Received items are required.', 400);
  const eventKey = createHash('sha256').update(JSON.stringify([transferId, receiptId || normalizedItems])).digest('hex').slice(0, 32);
  if (mode === 'increment' && (await client.query('SELECT 1 FROM stock_movements WHERE id LIKE $1 LIMIT 1', [`RCPT-${eventKey}-%`])).rowCount) reject('This receipt has already been recorded.');
  let changed = 0;
  let allReceived = true;
  for (const line of lines) {
    const before = received.get(key(line.product_name, line.batch_no, line.expiry_date)) || 0;
    const expected = Number(line.quantity_approved ?? line.quantity);
    let delta = 0;
    if (selected.has(line.id)) delta = mode === 'increment' ? selected.get(line.id) : selected.get(line.id) - before;
    else if (!normalizedItems.length && mode === 'cumulative') {
      const target = requestedStatus === 'partially_received' && Number(line.quantity_received) > before ? Number(line.quantity_received) : expected;
      delta = target - before;
    }
    if (!Number.isFinite(expected) || expected <= 0 || delta < 0 || before + delta > expected) reject('Receipt exceeds dispatched quantity or reduces an earlier receipt.', 400);
    if (delta > 0) {
      await lockStockBatchTx(client, branch, line.product_name, line.batch_no, line.expiry_date);
      const existing = (await client.query(
        `SELECT id FROM branch_inventory_batches WHERE LOWER(TRIM(branch_id))=ANY($1::text[]) AND LOWER(TRIM(product_name))=LOWER(TRIM($2))
         AND batch_no IS NOT DISTINCT FROM $3 AND expiry_date IS NOT DISTINCT FROM $4::date FOR UPDATE`,
        [branchAliases, line.product_name, line.batch_no || null, line.expiry_date || null]
      )).rows[0];
      const cost = (await client.query(
        `SELECT dpc_unit_value, cif_unit_cost FROM stock_batches WHERE location=$1
         AND LOWER(TRIM(description))=LOWER(TRIM($2)) AND COALESCE(batch_no,'')=COALESCE($3,'')
         AND expiry_date IS NOT DISTINCT FROM $4::date ORDER BY created_at LIMIT 1`,
        [transfer.from_warehouse, line.product_name, line.batch_no || null, line.expiry_date || null]
      )).rows[0];
      if (existing) await client.query('UPDATE branch_inventory_batches SET quantity=quantity+$1, updated_at=NOW() WHERE id=$2', [delta, existing.id]);
      else await client.query(
        `INSERT INTO branch_inventory_batches (id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,source_warehouse,status,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'in_stock',NOW(),NOW())`,
        [`BIB-${randomUUID()}`, branch, line.product_name, line.batch_no || null, line.expiry_date || null, delta, cost?.dpc_unit_value || null, transfer.from_warehouse]
      );
      const movementId = mode === 'increment' ? `RCPT-${eventKey}-${line.id}` : `RCPT-${randomUUID()}`;
      await client.query(
        `INSERT INTO stock_movements (id,product_name,batch_no,expiry_date,quantity,movement_type,source_location,source_location_type,
          destination_location,destination_location_type,reference_id,created_by,notes,status,unit_dp,unit_cif,movement_date,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'branch',$10,$11,$12,'posted',$13,$14,NOW(),NOW(),NOW())`,
        [movementId, line.product_name, line.batch_no || null, line.expiry_date || null, delta, hasTransit ? 'transit_receipt' : 'transfer_in',
         hasTransit ? `in_transit:${transferId}` : transfer.from_warehouse, hasTransit ? 'in_transit' : inferLocationType(transfer.from_warehouse),
         branch, transferId, user.fullName || user.username || user.id, `Staff-confirmed receipt ${receiptId || eventKey}`, cost?.dpc_unit_value || null, cost?.cif_unit_cost || null]
      );
      await client.query(
        `INSERT INTO branch_inventory_movements (id,branch_id,type,product_name,batch_no,quantity,reference,notes,created_by,created_at)
         VALUES ($1,$2,'receive',$3,$4,$5,$6,$7,$8,NOW())`,
        [`BIM-${randomUUID()}`, branch, line.product_name, line.batch_no || null, delta, transferId, 'Staff-confirmed transfer receipt', user.fullName || user.username || user.id]
      );
      changed += delta;
    }
    await client.query('UPDATE stock_transfer_items SET quantity_received=$1 WHERE id=$2', [before + delta, line.id]);
    if (before + delta < expected) allReceived = false;
  }
  if (!changed) reject('No additional stock was received; duplicate receipt blocked.');
  const status = allReceived ? 'delivered' : 'partially_received';
  const updated = (await client.query('UPDATE stock_transfers SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [status, transferId])).rows[0];
  if (transfer.request_id && allReceived) await client.query("UPDATE stock_requests SET status='received',updated_at=NOW() WHERE id=$1", [transfer.request_id]);
  if (allReceived) await client.query("UPDATE dispatch_notes SET status='closed',updated_at=NOW() WHERE transfer_id=$1", [transferId]);
  return { transfer: updated, branchId: branch, receivedQuantity: changed, status };
}
