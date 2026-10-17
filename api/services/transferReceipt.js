import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";import { createHash, randomUUID } from 'node:crypto';
import { getBranchScope } from '../_lib/auth.js';
import { normalizeBranchSlug, branchSearchTerms } from '../_lib/branchUtils.js';
import { inferLocationType, recomputeLocationBalances } from './stockEngine.js';
import { lockStockBatchTx } from './stockLocks.js';
import { receiveAllocatedBranchTx } from './stockCostLayers.js';

const key = (product, batch, expiry) => JSON.stringify([
String(product || '').trim().toLowerCase(), batch || '',
expiry instanceof Date ? expiry.toISOString().slice(0, 10) : String(expiry || '').slice(0, 10)]
);
function reject(message, statusCode = 409) {
  throw Object.assign(new Error(message), { statusCode });
}

const day = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10) || null;
// A unique, exact source is evidence; FIFO's first similarly named batch is not.
// Ambiguous legacy allocations remain explicitly unlinked rather than acquiring
// an invented supplier or cost. New receipts freeze the verified original layer.
async function originalSourceTx(client, transfer, line) {
  // User-supplied transfer metadata is not proof of an actual reserved layer.
  let specified = null;
  if (inferLocationType(transfer.from_warehouse) === 'branch') {
    const aliases = [...new Set([transfer.from_warehouse, ...branchSearchTerms(transfer.from_warehouse)].
    map((value) => String(value).toLowerCase().trim()))];
    const rows = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:26:0"),


    [aliases, line.product_name, line.batch_no, day(line.expiry_date)])).rows;
    if (rows.length !== 1 || !rows[0].source_batch_id || rows[0].metadata?.provenance_conflict) return null;
    const frozen = rows[0].metadata?.original_source;
    if (frozen && frozen.id === rows[0].source_batch_id && frozen.batch_no === line.batch_no &&
    day(frozen.expiry_date) === day(line.expiry_date)) return frozen;
    specified = rows[0].source_batch_id;
  }
  const rows = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:36:1"),





  [transfer.from_warehouse, line.product_name, line.batch_no, day(line.expiry_date), specified,
  inferLocationType(transfer.from_warehouse) === 'branch'])).rows;
  if (rows.length !== 1) return null;
  const source = rows[0];
  return { ...source, expiry_date: day(source.expiry_date),
    cif_unit_cost: source.cif_unit_cost == null ? null : Number(source.cif_unit_cost),
    dpc_unit_value: source.dpc_unit_value == null ? null : Number(source.dpc_unit_value) };
}

// Used by both regular and barcode receipt. Quantities on the regular route
// are cumulative; barcode quantities are increments with a repeat-safe key.
export async function receiveTransferTx(client, { transferId, items = [], user, mode = 'cumulative', receiptId, requestedStatus }) {
  if (!user) reject('Authentication required', 401);
  const transfer = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:55:2"), [transferId])).rows[0];
  if (!transfer) reject('Transfer not found', 404);
  if (!['dispatched', 'in_transit', 'partially_received'].includes(transfer.status)) reject(`Transfer cannot be received from status '${transfer.status}'.`);
  if (!transfer.gm_approved_by) reject('GM approval is required before receipt.', 403);
  const branch = normalizeBranchSlug(transfer.to_branch) || transfer.to_branch;
  const branchAliases = [...new Set([branch, transfer.to_branch, ...branchSearchTerms(branch)].filter(Boolean).map((value) => value.toLowerCase().trim()))];
  if (inferLocationType(transfer.to_branch) !== 'branch') reject('Use warehouse receipt for a warehouse destination.', 400);
  const scope = getBranchScope(user);
  if (scope.enforced && !scope.branches.map((b) => normalizeBranchSlug(b) || b).includes(branch)) reject('You cannot receive stock for this branch.', 403);
  const lines = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:64:3"), [transferId])).rows;
  if (!lines.length) reject('Transfer has no lines.', 400);
  // Legacy barcode receipts used dispatch-note references. Recognize both.
  const prior = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:68:4"),







  [transferId, branchAliases])).
  rows;
  const received = new Map();
  for (const row of prior) {
    const batchKey = key(row.product_name, row.batch_no, row.expiry_date);
    received.set(batchKey, (received.get(batchKey) || 0) + Number(row.quantity));
  }
  const hasAllocations = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:82:5"), [transferId])).rowCount > 0;
  if (hasAllocations && prior.reduce((sum, row) => sum + Number(row.quantity), 0) > lines.reduce((sum, line) => sum + Number(line.quantity_received || 0), 0))
  reject('Unlinked receipt evidence needs discrepancy review before another receipt.', 409);
  const hasTransit = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:85:6"), [transferId])).rowCount > 0;
  const normalizedItems = items.map((item) => ({
    product: item.product_name || item.productName || item.product || item.name,
    batch: item.batch_no ?? item.batchNo ?? null,
    expiry: item.expiry_date ?? item.expiryDate ?? null,
    qty: item.qtyReceived ?? item.quantity_received ?? item.quantityReceived ?? item.quantity ?? item.qty
  }));
  const selected = new Map();
  for (const item of normalizedItems) {
    const matches = lines.filter((line) => key(line.product_name, line.batch_no, line.expiry_date) === key(item.product, item.batch, item.expiry));
    if (matches.length !== 1) reject('Received product, batch and expiry must match exactly one dispatched line.', 400);
    if (selected.has(matches[0].id)) reject('Duplicate receipt line.', 400);
    const qty = Number(item.qty);
    if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) reject('Receipt quantity must be a finite whole base-unit quantity.', 400);
    selected.set(matches[0].id, qty);
  }
  if (mode === 'increment' && !normalizedItems.length) reject('Received items are required.', 400);
  const eventKey = createHash('sha256').update(JSON.stringify([transferId, receiptId || normalizedItems])).digest('hex').slice(0, 32);
  if (mode === 'increment' && (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:103:7"), [`RCPT-${eventKey}-%`])).rowCount) reject('This receipt has already been recorded.');
  let changed = 0;
  let allReceived = true;
  for (const line of lines) {
    const originalAllocations = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:107:8"), [line.id])).rows;
    const returns = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:108:9"),
    [transferId])).rows;
    const returned = new Map(returns.map((row) => [row.allocation_id, Number(row.quantity)]));
    const allocations = originalAllocations.map((a) => ({ ...a, quantity: Number(a.quantity) - (returned.get(a.id) || 0) }));
    if (allocations.some((a) => a.quantity < 0)) reject('Returned allocations exceed dispatch evidence. Review discrepancy.', 409);
    const matchingLines = lines.filter((other) => key(other.product_name, other.batch_no, other.expiry_date) === key(line.product_name, line.batch_no, line.expiry_date));
    if (!allocations.length && matchingLines.length > 1) reject('Ambiguous legacy receipt lines require discrepancy review.', 409);
    const before = allocations.length ? Number(line.quantity_received || 0) : Math.max(Number(line.quantity_received || 0), received.get(key(line.product_name, line.batch_no, line.expiry_date)) || 0);
    const expected = allocations.length ? allocations.reduce((sum, a) => sum + Number(a.quantity), 0) : Number(line.quantity_approved ?? line.quantity);
    let delta = 0;
    if (selected.has(line.id)) delta = mode === 'increment' ? selected.get(line.id) : selected.get(line.id) - before;else
    if (!normalizedItems.length && mode === 'cumulative') {
      const target = requestedStatus === 'partially_received' && Number(line.quantity_received) > before ? Number(line.quantity_received) : expected;
      delta = target - before;
    }
    if (!Number.isFinite(expected) || expected < 0 || delta < 0 || before + delta > expected) reject('Receipt exceeds dispatched quantity after returns or reduces an earlier receipt.', 400);
    if (delta > 0) {
      if (allocations.length) {
        await receiveAllocatedBranchTx(client, { transfer, line, allocations, before, quantity: delta, branch, aliases: branchAliases,
          actor: user.fullName || user.username || user.id, hasTransit });
        if (mode === 'increment') await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:128:10"),

        [`RCPT-${eventKey}-${line.id}`, line.product_name, transferId]);
      } else {
        await lockStockBatchTx(client, branch, line.product_name, line.batch_no, line.expiry_date);
        const existing = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:134:11"),


        [branchAliases, line.product_name, line.batch_no || null, line.expiry_date || null])).
        rows[0];
        const cost = await originalSourceTx(client, transfer, line);
        const conflict = Number(existing?.quantity || 0) > 0 && (
        existing.metadata?.provenance_conflict || !existing.source_batch_id || !cost || existing.source_batch_id !== cost.id ||
        existing.metadata?.original_source && Number(existing.metadata.original_source.cif_unit_cost) !== Number(cost.cif_unit_cost));
        const original = conflict ? null : cost;
        const metadata = { ...(existing?.metadata || {}), original_source: original,
          source_transfer_id: transferId, provenance_conflict: Boolean(conflict),
          // Remove obsolete coarse cost hints when a physical row mixes unknown layers.
          cif_unit_cost: original?.cif_unit_cost ?? null, unit_cif: original?.cif_unit_cost ?? null,
          supplier_import_id: original?.supplier_import_id || null, supplier_name: original?.supplier_name || null };
        if (existing) await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:148:12"),

        [delta, existing.id, original?.id || null, JSON.stringify(metadata)]);else
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:152:13"),



        [`BIB-${randomUUID()}`, branch, line.product_name, line.batch_no || null, line.expiry_date || null, delta,
        cost?.dpc_unit_value ?? null, transfer.from_warehouse, original?.id || null, JSON.stringify(metadata)]);

        const movementId = mode === 'increment' ? `RCPT-${eventKey}-${line.id}` : `RCPT-${randomUUID()}`;
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:160:14"),



        [movementId, line.product_name, line.batch_no || null, line.expiry_date || null, delta, hasTransit ? 'transit_receipt' : 'transfer_in',
        hasTransit ? `in_transit:${transferId}` : transfer.from_warehouse, hasTransit ? 'in_transit' : inferLocationType(transfer.from_warehouse),
        branch, transferId, user.fullName || user.username || user.id, `Staff-confirmed receipt ${receiptId || eventKey}`, cost?.dpc_unit_value ?? null, cost?.cif_unit_cost ?? null]);

        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:168:15"),


        [`BIM-${randomUUID()}`, branch, line.product_name, line.batch_no || null, delta, transferId, 'Staff-confirmed transfer receipt', user.fullName || user.username || user.id]);

      }
      changed += delta;
    }
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:175:16"), [before + delta, line.id]);
    if (before + delta < expected) allReceived = false;
  }
  if (!changed) reject('No additional stock was received; duplicate receipt blocked.');
  const status = allReceived ? 'delivered' : 'partially_received';
  const updated = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:180:17"), [status, transferId])).rows[0];
  if (transfer.request_id && allReceived) await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:181:18"), [transfer.request_id]);
  if (allReceived) await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/transferReceipt.js:182:19"), [transferId]);
  await recomputeLocationBalances('in_transit', `in_transit:${transferId}`);
  return { transfer: updated, branchId: branch, receivedQuantity: changed, status };
}
