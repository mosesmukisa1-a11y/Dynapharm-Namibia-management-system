import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "./queryDescriptors.js";import { getMany } from '../db.js';
import { branchSearchTerms } from '../_lib/branchUtils.js';
import { movementSaleEvidence } from './saleEvidence.js';
import { validateBusinessDates, businessDatePredicate } from './businessDates.js';
import { classifySaleCostEvidence } from '../../shared/saleCostEvidence.js';

// Cursor order includes source: distinct legacy records with identical IDs/times
// must remain reachable. Only persisted mirror IDs authorize deduplication.
export async function stockLedgerPage(url, scope) {
  const branch = url.searchParams.get('branch');
  const location = url.searchParams.get('location');
  if (scope.enforced && [branch, location].some((value) => value && !scope.branches.includes(value))) {
    const error = new Error('Access denied');error.status = 403;throw error;
  }
  const limitText = url.searchParams.get('limit') || '100';
  if (!/^[1-9]\d*$/.test(limitText)) throw Object.assign(new Error('Invalid limit'), { status: 400 });
  const limit = Math.min(Number(limitText), 1000);
  const from = url.searchParams.get('date_from'),to = url.searchParams.get('date_to');
  validateBusinessDates(from, to);
  const params = [],where = [];
  const bind = (value) => {params.push(value);return __qd_registeredPlan("api/services/stockLedgerPage.js:21:0", [params.length]);};
  const owners = branch ? branchSearchTerms(branch) : scope.enforced ? scope.branches.flatMap(branchSearchTerms) : null;
  if (owners) {
    const p = bind(owners);
    where.push(__qd_registeredPlan("api/services/stockLedgerPage.js:25:1", [p,
    p,
    p]));
  }
  if (scope.enforced) where.push(__qd_registeredPlan("api/services/stockLedgerPage.js:29:2"));
  if (from) where.push(businessDatePredicate('created_at', bind(from)));
  if (to) where.push(businessDatePredicate('created_at', bind(to), true));
  for (const [param, field] of [['type', 'movement_type'], ['status', 'status'], ['reference_id', 'reference_id']]) {
    const value = url.searchParams.get(param);
    if (value) where.push(__qd_registeredPlan("api/services/stockLedgerPage.js:34:3", [field, bind(value)]));
  }
  for (const [param, field] of [['product_name', 'product_name'], ['batch_no', 'batch_no']]) {
    const value = url.searchParams.get(param)?.trim();
    if (value) where.push(__qd_registeredPlan("api/services/stockLedgerPage.js:38:4", [field, bind(`%${value.replace(/[\\%_]/g, '\\$&')}%`)]));
  }
  if (location) {
    const p = bind(location);
    where.push(__qd_registeredPlan("api/services/stockLedgerPage.js:42:5", [p]));
  }
  for (const [param, field] of [['warehouse', 'warehouse_id'], ['product', 'product_id']]) {
    const value = url.searchParams.get(param);
    if (value) where.push(__qd_registeredPlan("api/services/stockLedgerPage.js:46:6", [field, bind(value)]));
  }
  const search = url.searchParams.get('search')?.trim();
  if (search) {
    const p = bind(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(__qd_registeredPlan("api/services/stockLedgerPage.js:51:7", [p, p]));
  }
  const cursor = url.searchParams.get('cursor');
  if (cursor) {
    let position;
    try {position = JSON.parse(Buffer.from(cursor, 'base64url').toString());} catch {}
    if (!Array.isArray(position) || position.length !== 3 || position.some((value) => typeof value !== 'string') ||
    !Number.isFinite(Date.parse(position[0])) || cursor.length > 1000) {
      throw Object.assign(new Error('Invalid ledger cursor'), { status: 400 });
    }
    where.push(__qd_registeredPlan("api/services/stockLedgerPage.js:61:8", [bind(position[0]), bind(position[1]), bind(position[2])]));
  }
  const pageLimit = bind(limit + 1);
  const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/stockLedgerPage.js:64:11", [



















  where.length ? __qd_registeredPlan("api/services/stockLedgerPage.js:84:9", [__qd_joinPlans(where, "and")]) : __qd_registeredPlan("api/services/stockLedgerPage.js:84:10"),
  pageLimit]), params);
  const more = rows.length > limit;
  const selected = rows.slice(0, limit);
  const movements = selected.map(({ record, source, receipt_no }) => {
    const normalized = { ...record, ledger_source: source, ...movementSaleEvidence(record) };
    if (!normalized.receipt_no) normalized.receipt_no = receipt_no;
    return normalized;
  });
  const identities = movements.map((row) => row.metadata?.sale_evidence?.movement_id || row.id);
  if (identities.length) {
    const allocations = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/stockLedgerPage.js:95:12"), [identities]);
    for (const row of movements) {
      const parts = allocations.filter((part) => part.movement_id === (row.metadata?.sale_evidence?.movement_id || row.id));
      const qty = parts.reduce((sum, part) => sum + Number(part.quantity), 0);
      if (!qty || Math.abs(qty - Math.abs(Number(row.quantity))) > 1e-8) continue;
      const unit = (field) => parts.every((part) => {
        const n = part.snapshot?.[field];
        return n != null && n !== '' && Number.isFinite(Number(n)) && (
        Number(n) > 0 || Number(n) === 0 && part.snapshot.zeroCostApproved === true);
      }) ? parts.reduce((sum, part) => sum + Number(part.quantity) * Number(part.snapshot[field]), 0) / qty : null;
      row.original_received_dpc = unit('unit_dp');row.original_received_cost = unit('unit_cost');
      row.cost_evidence_status = classifySaleCostEvidence({ originalReceivedDPC: row.original_received_dpc,
        originalReceivedCost: row.original_received_cost, zeroCostApproved: parts.every((part) => part.snapshot.zeroCostApproved === true) });
    }
  }
  const last = selected.at(-1);
  return { success: true, movements, total: movements.length, hasMore: more,
    // JSON timestamp retains PostgreSQL microseconds; JS Date would truncate
    // them and could skip unseen rows within the cursor's millisecond.
    nextCursor: more ? Buffer.from(JSON.stringify([last.record.created_at, last.id, last.source])).toString('base64url') : null,
    coverage: 'Paged recorded evidence; only persisted mirror identities are deduplicated.' };
}
