import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";import { getBranchScope } from '../_lib/auth.js';
import { physicalPrefix } from './queryDescriptors.js';
import { normalizeBranchSlug, branchSearchTerms } from '../_lib/branchUtils.js';

const operationStatuses = ['draft', 'submitted', 'partially_reviewed', 'approved', 'partially_dispatched', 'rejected', 'dispatched', 'credited', 'cancelled'];
const batchStatuses = ['saleable', 'expired', 'damaged', 'quarantine', 'out_of_stock'];
const branchTerms = (location) => [...new Set([normalizeBranchSlug(location),
...branchSearchTerms(location)].filter((term) => term && normalizeBranchSlug(term) === normalizeBranchSlug(location)))];
const locationExpressions = Object.freeze({
  'b.branch_id': __qd_registeredPlan("api/services/controlledStockRegister.js:10:0"),
  's.location': __qd_registeredPlan("api/services/controlledStockRegister.js:11:1"),
  location: __qd_registeredPlan("api/services/controlledStockRegister.js:12:2"),
  "l->'snapshot'->>'location'": __qd_registeredPlan("api/services/controlledStockRegister.js:13:3")
});
const sqlLocation = (expression) => {
  if (!Object.hasOwn(locationExpressions, expression)) throw Error('Invalid SQL location expression');
  return locationExpressions[expression];
};
const escapedSearch = (value) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;

function paging(input, prefix, defaultSize, fail) {
  const parse = (key, fallback, maximum) => {
    if (input[key] == null || input[key] === '') return fallback;
    const value = Number(input[key]);
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail(`Invalid ${key}`);
    return value;
  };
  const page = parse(`${prefix}_page`, 1, 1000000);
  const page_size = parse(`${prefix}_page_size`, defaultSize, 100);
  return { page, page_size, offset: (page - 1) * page_size };
}
const pageInfo = (page, total) => ({
  page: page.page, page_size: page.page_size, total: Number(total),
  total_pages: Math.ceil(Number(total) / page.page_size)
});

// All visibility predicates run before counts, search, ordering and pagination.
// No ids from another branch are hydrated or returned, including detail requests.
export async function readControlledStockRegister(client, user, input, { fail, physicalBatchSnapshot }) {
  const scope = getBranchScope(user);
  const branchRole = ['branch', 'branch_manager'].includes(String(user.role || '').toLowerCase());
  const restricted = scope.enforced || branchRole;
  const allowed = restricted ? [...new Set((scope.branches || []).flatMap(branchTerms))] : [];
  const view = input.view || 'all';
  if (!['all', 'batches', 'operations'].includes(view)) fail('Unknown register view');
  // Validate the entire requested view before any counts, hydration or reads.
  // Previously an invalid operations filter on view=all performed batch reads.
  if (view !== 'operations') {
    paging(input, 'batch', 50, fail);
    if (input.batch_status && !batchStatuses.includes(String(input.batch_status))) fail('Unknown batch status');
    if (input.batch_type && !['branch', 'warehouse', 'segregated'].includes(String(input.batch_type))) fail('Unknown batch type');
  }
  if (view !== 'batches') {
    paging(input, 'operation', 20, fail);
    if (input.operation_status && !operationStatuses.includes(String(input.operation_status))) fail('Unknown operation status');
  }
  const location = String(input.location || '').trim();
  const locationTerms = location ? [...new Set([location.toLowerCase(), ...branchTerms(location)])] : [];
  const values = [restricted, allowed, locationTerms];
  const operationScope = __qd_registeredPlan("api/services/controlledStockRegister.js:60:4", [


  sqlLocation("l->'snapshot'->>'location'")]);

  if (input.operation_id) {
    const operation = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/controlledStockRegister.js:66:5", [
    operationScope]), [...values.slice(0, 2), String(input.operation_id)])).rows[0];
    if (!operation || operation.kind === 'branch_clearance') fail('Operation not found; use the dedicated GM clearance view', 404);
    const credits = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/controlledStockRegister.js:69:6"), [operation.id])).rows;
    const financial_entries = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/controlledStockRegister.js:70:7"), [operation.id])).rows;
    return { operation, credits, financial_entries };
  }

  const result = {};
  if (view !== 'operations') {
    const page = paging(input, 'batch', 30, fail);
    const search = String(input.batch_search || '').trim().slice(0, 200);
    const status = String(input.batch_status || '');
    if (status && !batchStatuses.includes(status)) fail('Unknown batch status');
    const type = String(input.batch_type || '');
    if (type && !['branch', 'warehouse', 'segregated'].includes(type)) fail('Unknown batch type');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Windhoek', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const physical = __qd_registeredPlan("api/services/controlledStockRegister.js:83:8", [




    sqlLocation('b.branch_id'),










    sqlLocation('s.location'),

    sqlLocation('location')]);








    const params = [...values, search, escapedSearch(search), status, today, type];
    const total = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/controlledStockRegister.js:111:9", [physical]), params)).rows[0].total;
    // Hydrate physical and original source rows only after the page boundary.
    // One set-based join replaces a read for every selected branch batch.
    const rows = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/controlledStockRegister.js:114:10", [physical]),









    [...params, page.page_size, page.offset])).rows;
    const batches = [],segregated = [];
    for (const { batch_type, raw, original_source } of rows) {
      if (batch_type === 'segregated') segregated.push({ ...raw.snapshot, ...raw, batch_type, quantity: Number(raw.quantity) });else
      batches.push(physicalBatchSnapshot(raw, batch_type, batch_type === 'warehouse' ? raw : original_source));
    }
    result.batches = batches;
    result.segregated = segregated;
    result.batch_pagination = pageInfo(page, total);
    // Location choices must remain stable when the current search has no matches.
    result.locations = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/controlledStockRegister.js:134:11", [physicalPrefix(physical)]),
    params.slice(0, 2))).rows.map((r) => r.location).filter(Boolean);
  }
  if (view !== 'batches') {
    const page = paging(input, 'operation', 20, fail);
    const search = String(input.operation_search || '').trim().slice(0, 200);
    const status = String(input.operation_status || '');
    if (status && !operationStatuses.includes(status)) fail('Unknown operation status');
    const where = __qd_registeredPlan("api/services/controlledStockRegister.js:142:12", [operationScope,

    sqlLocation("l->'snapshot'->>'location'")]);





    const params = [...values, status, search, escapedSearch(search)];
    const total = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/controlledStockRegister.js:151:13", [where]), params)).rows[0].total;
    result.operations = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/controlledStockRegister.js:152:14", [
    where]),
    [...params, page.page_size, page.offset])).rows;
    result.operation_pagination = pageInfo(page, total);
  }
  return result;
}
