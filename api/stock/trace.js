import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { getMany, getOne } from '../db.js';
import { branchSearchTerms, normalizeBranchSlug } from '../_lib/branchUtils.js';
import { traceDocumentEvents } from '../services/stockTracePresentation.js';
import { stockLedgerPage } from '../services/stockLedgerPage.js';
import { businessDay } from '../services/businessDates.js';

const readers = ['admin', 'super_admin', 'superadmin', 'gm', 'general_manager', 'director', 'finance', 'finance_manager', 'mis',
'stock', 'stock_manager', 'warehouse', 'warehouse_manager', 'branch', 'branch_manager', 'branch_staff'];
export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Read-only endpoint' });
  if (!readers.includes(String(req.user.role || '').toLowerCase())) return res.status(403).json({ success: false, error: 'Staff stock evidence access required' });
  const url = new URL(req.url, 'http://local');
  const search = (url.searchParams.get('search') || '').trim(),branch = url.searchParams.get('branch');
  if (search.length < 3 || search.length > 160) return res.status(400).json({ success: false, error: 'Enter 3–160 characters to trace' });
  const scope = getBranchScope(req.user);
  if (scope.enforced && branch && !scope.branches.some((item) => normalizeBranchSlug(item) === normalizeBranchSlug(branch)))
  return res.status(403).json({ success: false, error: 'Access denied' });
  const owners = (branch ? [branch] : scope.enforced ? scope.branches : null)?.flatMap(branchSearchTerms) || null;
  const term = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  try {
    const events = [],gaps = [];
    const primaryAvailable = (await __qd_executePlan(getOne, __qd_registeredPlan("api/stock/trace.js:26:0"), []))?.name;
    const primary = primaryAvailable ? await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/trace.js:27:1"),






    [term, owners]) : [];
    if (!primaryAvailable) gaps.push('Primary sale source unavailable; receipt-to-sale matching not verified');
    const patterns = [term, ...primary.slice(0, 200).map((row) => `%${row.id.replace(/[\\%_]/g, '\\$&')}%`)];
    if (primary.length > 200) gaps.push('Primary sale matches truncated at 200 records; narrow the search');
    for (const row of primary.slice(0, 200)) {
      const timestamp = row.sale_date || row.created_at;
      events.push({ id: `primary:${row.id}`, source: 'branch_walkin_sales', recordId: row.id, type: 'recorded sale',
        reference: row.id, receipt: row.sale_number, timestamp, businessDate: timestamp ? businessDay(new Date(timestamp)) : null,
        location: row.branch_id, status: 'Primary record; not an additional transaction', actor: 'See captured movement/audit actor' });
    }
    // Follow persisted receipt -> sale reference -> movement identity. No writes,
    // catalogue-based reconstruction or guessed legacy joins.
    const movementURL = new URL('http://local/?page=1&limit=200');
    if (branch) movementURL.searchParams.set('branch', branch);
    movementURL.searchParams.set('search', search);
    const movementAvailable = (await __qd_executePlan(getOne, __qd_registeredPlan("api/stock/trace.js:49:2"), []))?.


    name;
    const movementPage = movementAvailable ? await stockLedgerPage(movementURL, scope) : { movements: [] };
    if (!movementAvailable) gaps.push('Movement source schema unavailable; timeline not verified');
    if (movementPage.hasMore) gaps.push('Movement timeline truncated at 200 records; narrow the search');
    for (const row of movementPage.movements) {
      if (row.reference_id) patterns.push(`%${row.reference_id.replace(/[\\%_]/g, '\\$&')}%`);
      if (row.batch_no) patterns.push(`%${row.batch_no.replace(/[\\%_]/g, '\\$&')}%`);
      events.push({ id: `movement:${row.ledger_source}:${row.id}`, source: row.ledger_source, recordId: row.id,
        type: row.movement_type, reference: row.reference_id, receipt: row.receipt_no, timestamp: row.created_at,
        businessDate: row.business_date || businessDay(new Date(row.created_at)), location: row.source_location || row.branch_id,
        actor: row.created_by || 'Not recorded', status: row.status || 'Not recorded' });
    }
    // All table names below are static allowlisted application tables.
    for (const [kind, table] of [['supplier_import', 'supplier_imports'], ['transfer', 'stock_transfers']]) {
      if (kind === 'supplier_import' && owners) {gaps.push('Warehouse/import documents excluded from branch-scoped trace; no expanded authority is inferred.');continue;}
      if (!(await __qd_executePlan(getOne, __qd_registeredPlan("api/stock/trace.js:67:3"), [`public.${table}`]))?.name) {gaps.push(`${kind} source table unavailable`);continue;}
      let itemSearch = __qd_registeredPlan("api/stock/trace.js:68:5");
      if (kind === 'transfer') {
        if ((await __qd_executePlan(getOne, __qd_registeredPlan("api/stock/trace.js:70:4"), []))?.name) {
          itemSearch = __qd_registeredPlan("api/stock/trace.js:71:6");
        } else gaps.push('Transfer child items unavailable; transfer search is limited to recorded header evidence');
      }
      const records = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/trace.js:74:7", [table,
      itemSearch]),


      [[...new Set(patterns)], owners]);
      if (records.length > 200) gaps.push(`${kind} matches truncated at 200 records; narrow the search`);
      for (const { record } of records.slice(0, 200)) events.push(...traceDocumentEvents(kind, record));
    }
    // MIS sale-created identity is authoritative captured sale evidence, not a new posting.
    if ((await __qd_executePlan(getOne, __qd_registeredPlan("api/stock/trace.js:83:8"), []))?.name) {
      const sales = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/trace.js:84:9"),



      [term, owners]);
      if (sales.length > 200) gaps.push('Sale audit matches truncated at 200 events');
      for (const row of sales.slice(0, 200)) events.push({ id: `audit:${row.id}`, source: 'sale_audit', recordId: row.record_id,
        type: 'sale created', reference: row.details?.reference || row.record_id, receipt: row.details?.receiptNumber || null,
        timestamp: row.created_at, businessDate: row.details?.businessDate || null, location: row.branch_id,
        dpValue: row.details?.dpTotal ?? null, chargedValue: row.details?.chargedTotal ?? null,
        branchProfit: row.details?.branchProfitTotal ?? null, actor: row.details?.staff || row.user_name || 'Not recorded', status: 'Captured audit' });
    } else gaps.push('Sale audit source unavailable');
    events.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
    if (owners) gaps.push('Branch-scope document matching requires an explicit destination or branch-source identity. Ambiguous legacy warehouse/branch names are not merged.');
    return res.json({ success: true, events, gaps, timezone: 'Africa/Windhoek', readOnly: true,
      coverage: 'Only recorded documents and timestamps. No missing events or stock quantities are reconstructed.' });
  } catch (error) {
    console.error('[stock-trace] Read failed:', error.message);
    return res.status(500).json({ success: false, error: 'Stock document evidence could not be loaded' });
  }
}
