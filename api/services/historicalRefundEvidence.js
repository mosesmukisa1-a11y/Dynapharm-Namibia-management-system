import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";import { randomUUID, createHash } from 'node:crypto';
import { historicalRefundCandidatesTx, allocationEvidenceHash } from './stockSaleAllocations.js';
import { saleReturnRemainingTx } from './linkedReversals.js';
import { fail } from './stockCostLayers.js';
import { branchSearchTerms } from '../_lib/branchUtils.js';

export const GM_EVIDENCE_ROLES = ['gm', 'general_manager'];
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity = (user) => {const id = user.sub ?? user.id;if (!id) fail('An authenticated user identity is required', 401);return String(id);};
const requestIdentity = (r) => [r.id, r.branch_id, r.sale_reference, r.product_name, r.batch_no, String(r.quantity), r.reason, r.original_snapshot];
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const day = (value) => value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const normalized = (value) => value == null ? null : String(value).trim().toLowerCase() || null;
const scalar = (value) => value == null ? null : String(value);
function frozenSourceIdentity(source, depth = 0) {
  if (!source) return null;
  if (depth > 8) fail('Original source ancestry is invalid', 409);
  return {
    id: source.id ?? null, product: normalized(source.description ?? source.product_name),
    batch: source.batch_no ?? null, expiry: day(source.expiry_date),
    supplierImport: source.supplier_import_id ?? null, supplierId: source.supplier_id ?? null,
    supplierName: normalized(source.supplier_name),
    cf: scalar(source.cif_unit_cost), dp: scalar(source.dpc_unit_value),
    receivedCf: scalar(source.received_unit_cif_exact), originalCf: scalar(source.original_unit_cif),
    originalDp: scalar(source.original_unit_dp),
    receivedSource: frozenSourceIdentity(source.received_source, depth + 1),
    receiptAncestor: frozenSourceIdentity(source.metadata?.original_source, depth + 1)
  };
}
function sameCost(a, b) {
  if (a == null || b == null) return a == null && b == null;
  const x = Number(a),y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= Number.EPSILON * 8 * Math.max(1, Math.abs(x), Math.abs(y));
}

async function uniqueEvidence(client, refund, reference, allocationId) {
  const candidates = await historicalRefundCandidatesTx(client, refund, reference);
  if (candidates.length !== 1) fail(candidates.length ? 'Original sale evidence is ambiguous; no link can be inferred' : 'No matching frozen original sale allocation was found', 409);
  const a = candidates[0];
  if (a.movement_id !== allocationId) fail('Selected allocation does not match the unique historical evidence', 409);
  if (a.snapshot?.batch_type !== 'branch' || a.snapshot.id !== a.branch_batch_id ||
  !Number.isSafeInteger(Number(a.quantity)) || Number(a.quantity) <= 0)
  fail('Original allocation identity or base-unit quantity evidence is incomplete', 409);
  const layers = a.snapshot?.cost_layers;
  if (!Array.isArray(layers) || !layers.length || layers.some((l) => !Number.isFinite(Number(l.quantity)) || Number(l.quantity) <= 0) ||
  Math.abs(layers.reduce((s, l) => s + Number(l.quantity), 0) - Number(a.quantity)) > 1e-7)
  fail('Original sale cost-layer quantities are incomplete', 409);
  if (a.snapshot.revenue_unit == null || !Number.isFinite(Number(a.snapshot.revenue_unit)) || Number(a.snapshot.revenue_unit) < 0)
  fail('Original selling-price evidence is missing', 409);
  const sources = new Set(layers.map((l) => JSON.stringify(frozenSourceIdentity(l.source))));
  if (sources.size !== 1) fail('Original sale contains ambiguous supplier/cost layers; historical linking cannot assign a returned source', 409);
  const source = layers[0].source || null,identity = frozenSourceIdentity(source);
  if (JSON.stringify(identity) !== JSON.stringify(frozenSourceIdentity(a.snapshot.original_source)) ||
  (a.snapshot.source_batch_id ?? null) !== (source?.id ?? null) ||
  (a.snapshot.supplier_import_id ?? null) !== (source?.supplier_import_id ?? null) ||
  normalized(a.snapshot.supplier_name) !== normalized(source?.supplier_name) ||
  Object.hasOwn(a.snapshot, 'supplier_id') && a.snapshot.supplier_id !== (source?.supplier_id ?? null) ||
  !sameCost(a.snapshot.unit_cost, source?.cif_unit_cost) || !sameCost(a.snapshot.unit_dp, source?.dpc_unit_value))
  fail('Frozen allocation source or cost fields conflict with its original layers', 409);
  if (source && (identity.product !== normalized(a.product_name) || identity.batch !== (a.batch_no ?? null) ||
  identity.expiry !== day(a.expiry_date)))
  fail('Frozen source product, lot or expiry conflicts with the original sale allocation', 409);
  if (normalized(a.snapshot.product_name) !== normalized(a.product_name) ||
  (a.snapshot.batch_no ?? null) !== (a.batch_no ?? null) || day(a.snapshot.expiry_date) !== day(a.expiry_date) ||
  !branchSearchTerms(a.branch_id).map(normalized).includes(normalized(a.snapshot.location)))
  fail('Frozen sale product, lot or expiry identity is incomplete or conflicting', 409);
  return a; // Unknown source fields remain unknown; never fill them from live stock.
}

export async function proposeHistoricalRefundTx(client, refund, body, user) {
  const actor = identity(user);
  if (GM_EVIDENCE_ROLES.includes(String(user.role).toLowerCase())) fail('Stock must propose evidence before a separate GM review', 403);
  if (refund.allocation_id || refund.historical_evidence_link_id) fail('This refund already has original allocation evidence', 409);
  if (!Number.isSafeInteger(Number(refund.quantity)) || Number(refund.quantity) <= 0)
  fail('Historical quantity is not a positive whole base-unit quantity; it cannot be corrected by linking', 409);
  if (!text(body.evidence_reference, 1000) || !text(body.proposal_reason, 2000))
  fail('An archived evidence reference and linking reason are required', 400);
  const a = await uniqueEvidence(client, refund, body.sale_reference, body.allocation_id);
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/historicalRefundEvidence.js:79:0"), [`refund-sale:${a.sale_reference}`]);
  if (Number(refund.quantity) > (await saleReturnRemainingTx(client, a, refund.id, true))) fail('Historical quantity exceeds the shared original allocation cap', 409);
  const prior = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/historicalRefundEvidence.js:81:1"), [String(refund.id)])).rows[0];
  if (prior) {
    if (prior.allocation_id === a.movement_id && prior.evidence_reference === body.evidence_reference.trim() &&
    prior.proposal_reason === body.proposal_reason.trim()) return { success: true, proposal: prior };
    fail('A historical evidence proposal is already awaiting GM review', 409);
  }
  const proposal = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/historicalRefundEvidence.js:87:2"),


  [`HRE-${randomUUID()}`, String(refund.id), a.movement_id, actor, body.evidence_reference.trim(), body.proposal_reason.trim(),
  JSON.stringify(refund), JSON.stringify(a), hash(requestIdentity(refund)), allocationEvidenceHash(a)])).rows[0];
  return { success: true, proposal, message: 'Evidence proposed; no quantities or stock were changed' };
}

export async function reviewHistoricalRefundTx(client, refund, body, user) {
  if (!GM_EVIDENCE_ROLES.includes(String(user.role).toLowerCase())) fail('GM review is required', 403);
  const actor = identity(user);
  if (!text(body.review_reason, 2000)) fail('A GM review reason of up to 2000 characters is required', 400);
  const proposal = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/historicalRefundEvidence.js:99:3"),
  [body.proposal_id, String(refund.id)])).rows[0];
  if (!proposal || proposal.status !== 'proposed') fail('The proposal is missing or has already been reviewed', 409);
  if (proposal.proposed_by === actor) fail('The proposer cannot approve their own historical evidence', 403);
  const approve = body.action === 'approve_evidence';
  if (approve) {
    if (refund.allocation_id || refund.historical_evidence_link_id) fail('Refund evidence has already been linked', 409);
    if (hash(requestIdentity(refund)) !== proposal.request_hash) fail('The historical request changed; submit a new evidence proposal', 409);
    const a = await uniqueEvidence(client, refund, proposal.allocation_snapshot.sale_reference, proposal.allocation_id);
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/historicalRefundEvidence.js:108:4"), [`refund-sale:${a.sale_reference}`]);
    const locked = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/historicalRefundEvidence.js:109:5"), [a.movement_id])).rows[0];
    if (allocationEvidenceHash(locked) !== proposal.allocation_hash) fail('Original sale evidence changed; submit a new proposal', 409);
    if (Number(refund.quantity) > (await saleReturnRemainingTx(client, locked, refund.id, true)))
    fail('Historical quantity exceeds the shared original allocation cap', 409);
    // Evidence only: no status approval, stock correction, custody confirmation,
    // price rewrite, quantity rewrite, entitlement reset or financial reversal.
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/historicalRefundEvidence.js:115:6"),

    [locked.movement_id, locked.sale_reference, JSON.stringify(locked.snapshot), proposal.id, refund.id]);
  }
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/historicalRefundEvidence.js:119:7"),
  [approve ? 'approved' : 'rejected', actor, body.review_reason.trim(), proposal.id]);
  return { success: true, message: approve ? 'Original evidence linked. Physical refund approval is still required.' : 'Historical evidence proposal rejected' };
}
