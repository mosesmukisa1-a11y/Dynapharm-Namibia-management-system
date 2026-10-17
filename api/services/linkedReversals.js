import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";import { randomUUID, createHash } from 'node:crypto';
import { restoreWarehouseReturnStockTx } from './warehouseReturnStock.js';
import { getBranchScope } from '../_lib/auth.js';
import { normalizeBranchSlug, branchSearchTerms } from '../_lib/branchUtils.js';
import { preserveRestoredProvenanceTx, allocationEvidenceHash } from './stockSaleAllocations.js';
import { branchLayers, day, fail } from './stockCostLayers.js';
import { inferLocationType, recomputeLocationBalances } from './stockEngine.js';
import { postActivityRecord } from '../_lib/activityCapture.js';
import { registerRefundSegregationTx } from './controlledStock.js';

export const reversalSchema = `
ALTER TABLE branch_refund_requests ADD COLUMN IF NOT EXISTS allocation_id TEXT;
ALTER TABLE branch_refund_requests ADD COLUMN IF NOT EXISTS physical_return_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE branch_refund_requests ADD COLUMN IF NOT EXISTS inspection_reason TEXT;
ALTER TABLE branch_refund_requests ADD COLUMN IF NOT EXISTS original_snapshot JSONB;
ALTER TABLE branch_refund_requests ADD COLUMN IF NOT EXISTS operation_key TEXT;
ALTER TABLE branch_activity_transactions ADD COLUMN IF NOT EXISTS total_bv NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE branch_distributor_profit ADD COLUMN IF NOT EXISTS original_profit_id TEXT;
ALTER TABLE branch_distributor_profit ADD COLUMN IF NOT EXISTS reversal_reference TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS refund_operation_key ON branch_refund_requests(operation_key) WHERE operation_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS refund_allocation_status ON branch_refund_requests(allocation_id,status);
CREATE TABLE IF NOT EXISTS stock_linked_reversals (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, original_reference TEXT NOT NULL,
 allocation_id TEXT NOT NULL, quantity NUMERIC NOT NULL CHECK(quantity>0),
 reason TEXT NOT NULL, return_condition TEXT NOT NULL, actor TEXT NOT NULL,
 snapshot JSONB NOT NULL, operation_key TEXT UNIQUE NOT NULL, payload_hash TEXT NOT NULL,
 response JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS linked_reversal_allocation ON stock_linked_reversals(kind,allocation_id);
`;

export const STOCK_RETURN_ROLES = ['stock', 'stock_manager', 'admin', 'superadmin', 'super_admin', 'gm', 'general_manager'];
export function authorizeBranchReturn(user, branch) {
  if (!user) fail('Authentication required', 401);
  const role = String(user.role || '').toLowerCase();
  if (![...STOCK_RETURN_ROLES, 'dispenser', 'branch', 'branch_manager', 'branch_staff', 'branch_admin', 'frontdesk', 'front_desk'].includes(role))
  fail('Branch staff or stock management access required', 403);
  const scope = getBranchScope(user);
  const unrestricted = ['admin', 'superadmin', 'super_admin', 'gm', 'general_manager', 'stock', 'stock_manager'].includes(role);
  const branches = scope.branches || [user.branch, ...(Array.isArray(user.branches) ? user.branches : [])].filter(Boolean);
  if (!unrestricted && !branches.some((b) => normalizeBranchSlug(b) === normalizeBranchSlug(branch)))
  fail('You cannot return goods for this branch', 403);
}
export function authorizeStockReturn(user) {
  if (!user) fail('Authentication required', 401);
  if (!STOCK_RETURN_ROLES.includes(String(user.role || '').toLowerCase())) fail('Stock Manager access required', 403);
}
export function returnEvidence(body, inspection = false) {
  const qty = Number(body.quantity);
  if (!Number.isSafeInteger(qty) || qty <= 0) fail('Return quantity must be a positive whole base-unit quantity', 400);
  if (!body.reason?.trim()) fail('A return reason is required', 400);
  if (body.physical_return_confirmed !== true) fail('Confirm the goods have physically returned before recording a return', 400);
  if (inspection && !['saleable', 'damaged', 'expired', 'quarantine'].includes(body.return_condition))
  fail('Inspect and select the returned goods condition', 400);
  return qty;
}
const actor = (user) => user.fullName || user.username || user.id;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Windhoek', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function saleableExpiry(snapshot, condition) {
  if (condition === 'saleable' && day(snapshot.expiry_date) && day(snapshot.expiry_date) < today())
  fail('Expired goods cannot be restored to saleable stock', 400);
}

// Unlinked approved legacy refunds conservatively consume the shared lot cap.
// We never assign them an invented original allocation or supplier.
export async function saleReturnRemainingTx(client, allocation, excludeId = null, includePending = false) {
  const prior = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:67:0"),




  [allocation.movement_id, allocation.sale_reference, branchSearchTerms(allocation.branch_id), allocation.product_name, allocation.batch_no, excludeId, includePending])).rows[0];
  return Math.max(0, Number(allocation.quantity) - Number(prior.quantity));
}

export async function approveLinkedRefundTx(client, refund, body, user) {
  authorizeStockReturn(user);
  const qty = returnEvidence({ ...body, quantity: refund.quantity, reason: refund.reason }, true);
  if (!body.inspection_reason?.trim()) fail('An inspection reason is required', 400);
  if (!refund.allocation_id || !refund.physical_return_confirmed && !refund.historical_evidence_link_id) fail('Legacy unlinked refunds require reviewed original-sale evidence before approval', 409);
  let reviewed;
  if (refund.historical_evidence_link_id) {
    reviewed = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:83:1"),

    [refund.historical_evidence_link_id, String(refund.id), refund.allocation_id])).rows[0];
    if (!reviewed) fail('Approved historical evidence is required before physical refund approval', 409);
  }
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:88:2"), [`refund-sale:${refund.sale_reference}`]);
  const allocation = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:89:3"), [refund.allocation_id])).rows[0];
  if (!allocation) fail('Original sale allocation not found', 409);
  if (reviewed && allocationEvidenceHash(allocation) !== reviewed.allocation_hash)
  fail('GM-reviewed original sale evidence changed; physical refund approval is blocked', 409);
  if (qty > (await saleReturnRemainingTx(client, allocation, refund.id))) fail('Quantity exceeds the original allocation remaining after prior refunds', 409);
  const original = allocation.snapshot;
  const previousQuantity = Number(allocation.quantity) - (await saleReturnRemainingTx(client, allocation, refund.id));
  let skip = previousQuantity,remaining = qty;
  const layers = [];
  for (const layer of original.cost_layers || []) {
    if (skip >= Number(layer.quantity)) {skip -= Number(layer.quantity);continue;}
    const take = Math.min(remaining, Number(layer.quantity) - skip);
    if (take) layers.push({ ...layer, quantity: take });
    remaining -= take;skip = 0;if (!remaining) break;
  }
  if (remaining) fail('Original returned cost layer is incomplete', 409);
  const layerCost = (field) => layers.some((l) => l.source?.[field] == null) ? null :
  layers.reduce((sum, l) => sum + Number(l.source[field]) * Number(l.quantity), 0) / qty;
  const snapshot = { ...original, cost_layers: layers, unit_cost: layerCost('cif_unit_cost'), unit_dp: layerCost('dpc_unit_value') };
  if (snapshot.revenue_unit == null || !Number.isFinite(Number(snapshot.revenue_unit))) fail('Original selling price is missing; reviewed financial evidence is required', 409);
  saleableExpiry(snapshot, body.return_condition);
  const id = `REV-${randomUUID()}`;
  const amount = (Math.round(Number(snapshot.revenue_unit) * (previousQuantity + qty) * 100) -
  Math.round(Number(snapshot.revenue_unit) * previousQuantity * 100)) / 100;
  const dpTotal = Math.round(Number(snapshot.financial_dp_unit ?? snapshot.unit_dp ?? 0) * qty * 100) / 100;
  const bvTotal = Number(snapshot.bv_unit || 0) * qty;
  if (body.return_condition === 'saleable') {
    const batch = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:116:4"), [allocation.branch_batch_id])).rows[0];
    if (!batch || batch.branch_id !== allocation.branch_id || batch.product_name !== allocation.product_name ||
    (batch.batch_no || '') !== (allocation.batch_no || '') || day(batch.expiry_date) !== day(allocation.expiry_date))
    fail('Original physical lot is missing or changed. Accept into quarantine and use the reviewed release workflow', 409);
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:120:5"), [qty, batch.id]);
    // Restore only the returned part of the original cost layers.
    await preserveRestoredProvenanceTx(client, { batchId: batch.id, receivedQuantity: qty,
      snapshot: { ...snapshot, return_cost_layers: layers, refund_reference: refund.id } });
  } else await registerRefundSegregationTx(client, { ...refund, original_snapshot: snapshot }, allocation.expiry_date, body.return_condition, user);
  const branch = allocation.branch_id;
  const destination = body.return_condition === 'saleable' ? branch : `quarantine:${branch}`;
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:127:6"),



  [id, allocation.product_name, allocation.batch_no, allocation.expiry_date, qty, destination,
  body.return_condition === 'saleable' ? 'branch' : 'quarantine', refund.id, `${body.inspection_reason}; original allocation ${allocation.movement_id}`, actor(user), snapshot.unit_dp, snapshot.unit_cost]);
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:133:7"),


  [id, branch, allocation.product_name, allocation.batch_no, qty, snapshot.revenue_unit, snapshot.revenue_unit, refund.id, refund.reason, actor(user)]);
  await postActivityRecord({ id, branch_id: branch, client_name: 'Linked customer return', activity_type: 'refund_return',
    form_reference_id: refund.id, product_total_dp: -dpTotal, product_total_cp: -amount, total_qty: -qty, total_bv: -bvTotal,
    grand_total: -amount, payment_status: 'refunded', stock_impact: true, stock_status: body.return_condition === 'saleable' ? 'returned' : 'segregated',
    reporting_status: 'posted', captured_by: actor(user) });
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:141:8"), [-bvTotal, id]);
  // Append a proportional commission reversal, rather than rewriting earnings.
  const profitRows = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:143:9"),
  [allocation.sale_reference])).rows;
  const originalRevenue = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:145:10"),
  [allocation.sale_reference])).rows[0]?.amount;
  const previousRevenue = Number((await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:147:11"),
  [allocation.sale_reference])).rows[0].amount);
  for (const profit of profitRows) {
    const previousCredit = Number((await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:150:12"),
    [profit.id])).rows[0].amount);
    const target = Number(originalRevenue) > 0 ? Math.min(Number(profit.profit_amount),
    Math.round(Number(profit.profit_amount) * (previousRevenue + amount) / Number(originalRevenue) * 100) / 100) : 0;
    const reversed = Math.max(0, Math.round((target - previousCredit) * 100) / 100);
    if (reversed) await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:155:13"),


    [`RC-${randomUUID()}`, branch, profit.distributor_nb, profit.distributor_name, refund.id, allocation.sale_reference, -reversed, profit.id, id]);
  }
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:160:14"),


  [id, allocation.sale_reference, allocation.movement_id, qty, refund.reason, body.return_condition, actor(user),
  JSON.stringify(snapshot), `refund:${refund.id}`, createHash('sha256').update(JSON.stringify(body)).digest('hex')]);
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:165:15"),

  [actor(user), id, body.return_condition, body.return_condition === 'saleable' ? 'available' : 'segregated', body.inspection_reason, refund.id, amount]);
  await recomputeLocationBalances('branch', branch);
  if (body.return_condition !== 'saleable') await recomputeLocationBalances('quarantine', destination);
  return { success: true, movement_id: id, refund_amount: amount, message: 'Linked refund recorded. Original sale history is preserved.' };
}

export async function dispatchReturnAllocationsTx(client, transfer) {
  const lines = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:174:16"), [transfer.id])).rows;
  const allocations = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:175:17"), [transfer.id])).rows;
  const receipts = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:176:18"),


  [transfer.id])).rows[0];
  if (Number(receipts.quantity) > lines.reduce((sum, line) => sum + Number(line.quantity_received || 0), 0))
  fail('Unlinked receipt evidence needs discrepancy review before a dispatch return', 409);
  const returns = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:182:19"), [transfer.id])).rows;
  const used = new Map();
  for (const r of returns) used.set(r.allocation_id, (used.get(r.allocation_id) || 0) + Number(r.quantity));
  const results = [];
  for (const line of lines) {
    let received = Number(line.quantity_received || 0);
    for (const a of allocations.filter((a) => String(a.line_id) === String(line.id))) {
      const returned = used.get(a.id) || 0;
      const receivedHere = Math.min(received, Number(a.quantity) - returned);
      received -= receivedHere;
      results.push({ ...a, product_name: line.product_name, batch_no: a.snapshot.batch_no, expiry_date: a.snapshot.expiry_date,
        returned_quantity: returned, received_quantity: receivedHere, remaining_quantity: Math.max(0, Number(a.quantity) - returned - receivedHere) });
    }
    if (received > 0) fail('Receipt evidence exceeds the remaining dispatch allocations; discrepancy review is required', 409);
  }
  return { allocations: results, returns };
}

export async function returnDispatchTx(client, body, user) {
  authorizeStockReturn(user);
  const qty = returnEvidence(body, true);
  if (!body.operation_key || String(body.operation_key).length > 200) fail('A stable operation key is required', 400);
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:204:20"), [`dispatch-return:${body.operation_key}`]);
  const hash = createHash('sha256').update(JSON.stringify([body.transfer_id, body.allocation_id, qty, body.reason.trim(), body.return_condition])).digest('hex');
  const transfer = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:206:21"), [body.transfer_id])).rows[0];
  if (!transfer) fail('Transfer not found', 404);
  const prior = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:208:22"), [body.operation_key])).rows[0];
  if (prior) {if (prior.payload_hash !== hash) fail('Operation key was already used for a different return', 409);return prior.response;}
  if (!['dispatched', 'in_transit', 'partially_received'].includes(transfer.status)) fail('Only unreceived dispatched goods can be returned. Received goods require a branch-to-source transfer', 409);
  if (!(await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:211:23"), [transfer.id])).rowCount)
  fail('Missing linked transit dispatch evidence; a reviewed correction is required', 409);
  const { allocations } = await dispatchReturnAllocationsTx(client, transfer);
  const allocation = allocations.find((a) => a.id === body.allocation_id);
  if (!allocation || qty > allocation.remaining_quantity) fail('Return exceeds dispatched quantity still in transit after receipts and earlier returns', 409);
  saleableExpiry(allocation.snapshot, body.return_condition);
  const { source, batch_no, expiry_date } = allocation.snapshot;
  const location = transfer.from_warehouse;
  const type = inferLocationType(location);
  const saleable = body.return_condition === 'saleable';
  const id = `DRET-${randomUUID()}`;
  if (allocation.source_type === 'stock') {
    await restoreWarehouseReturnStockTx(client, { sourceId: allocation.source_id, location, productName: allocation.product_name,
      batchNo: batch_no, expiryDate: expiry_date, quantity: qty, originalSource: source, restoreAvailable: saleable });
  }
  if (saleable && allocation.source_type !== 'stock') {
    const row = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:227:24"), [allocation.source_id])).rows[0];
    if (!row || normalizeBranchSlug(row.branch_id) !== normalizeBranchSlug(location) || row.product_name !== allocation.product_name ||
    (row.batch_no || '') !== (batch_no || '') || day(row.expiry_date) !== day(expiry_date)) fail('Original branch lot is missing or changed', 409);
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:230:25"), [qty, row.id]);
    await preserveRestoredProvenanceTx(client, { batchId: row.id, receivedQuantity: qty, snapshot: {
        original_source: source, source_batch_id: source?.id || null, unit_cost: source?.cif_unit_cost ?? null,
        unit_dp: source?.dpc_unit_value ?? null, supplier_import_id: source?.supplier_import_id || null,
        supplier_name: source?.supplier_name || null, refund_reference: id, return_cost_layers: [{ quantity: qty, source }]
      } });
  } else if (!saleable) {
    await registerRefundSegregationTx(client, { id, branch_id: location, product_name: allocation.product_name, batch_no,
      quantity: qty, sale_reference: null, original_snapshot: { id: allocation.source_id, batch_type: allocation.source_type === 'stock' ? 'warehouse' : 'branch',
        location, product_name: allocation.product_name, batch_no, expiry_date, source_batch_id: source?.id || null,
        original_source: source, unit_cost: source?.cif_unit_cost ?? null, unit_dp: source?.dpc_unit_value ?? null,
        supplier_import_id: source?.supplier_import_id || null, supplier_name: source?.supplier_name || null } },
    expiry_date, body.return_condition, user);
  }
  const destination = saleable ? location : `quarantine:${location}`;
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:245:26"),



  [id, allocation.product_name, batch_no, expiry_date, qty, `in_transit:${transfer.id}`, destination, saleable ? type : 'quarantine',
  transfer.id, actor(user), `${body.reason}; original allocation ${allocation.id}`, source?.dpc_unit_value ?? null, source?.cif_unit_cost ?? null]);
  const response = { success: true, id, quantity: qty, message: 'Physical dispatch return recorded. Received branch stock was not changed.' };
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:252:27"),


  [id, transfer.id, allocation.id, qty, body.reason.trim(), body.return_condition, actor(user), JSON.stringify(allocation.snapshot), body.operation_key, hash, JSON.stringify(response)]);
  if (allocations.reduce((sum, a) => sum + a.remaining_quantity, 0) === qty) {
    const anyReceived = allocations.some((a) => a.received_quantity > 0);
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:258:28"), [anyReceived ? 'delivered' : 'returned', transfer.id]);
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:259:29"), [transfer.id]);
    if (transfer.request_id) await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/linkedReversals.js:260:30"), [anyReceived ? 'received' : 'returned', transfer.request_id]);
  }
  await recomputeLocationBalances('in_transit', `in_transit:${transfer.id}`);
  await recomputeLocationBalances(saleable ? type : 'quarantine', destination);
  return response;
}
