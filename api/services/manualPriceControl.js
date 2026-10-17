import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";import { query, withTransaction, publishRealtimeEvent } from '../db.js';
import { businessToday } from '../../shared/price-list-import.js';

const fields = ['dp', 'cp', 'cif', 'bv'];
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const date = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const prices = (row) => Object.fromEntries(fields.map((k) => [k, Number(row[k])]));
const same = (a, b) => fields.every((k) => Number(a[k]) === Number(b[k]));
export function authorizePriceOperator(user) {
  if (!user) throw fail('Authentication required', 401);
  if (!['gm', 'admin', 'superadmin', 'super_admin'].includes(String(user.role).toLowerCase()))
  throw fail('General Manager permission required', 403);
  const id = user.id || user.sub;
  if (!id) throw fail('A stable staff session is required', 403);
  return { id: String(id), name: user.fullName || user.username || String(id) };
}
function validateInput(input) {
  if (input?.scope !== 'global' || input.branch_id || input.branchId)
  throw fail('Only the existing global pricebook is supported. Branch-specific pricing requires separate policy and implementation.', 422);
  if (input.confirmApproval !== true) throw fail('Explicit GM price approval is required', 422);
  if (typeof input.approvalReference !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._:/-]{2,119}$/.test(input.approvalReference))
  throw fail('Enter a 3–120 character approval reference; no personal or clinical data.', 422);
}
function validateId(id) {
  if (!/^[1-9]\d{0,9}$/.test(String(id)) || Number(id) > 2147483647) throw fail('A numeric existing-product schedule ID is required; staged additions need separate review.', 422);
}
function replay(audit, actor, input) {
  if (audit.actor_id !== actor.id || audit.approval_reference !== input.approvalReference)
  throw fail('Already processed under a different actor or approval reference. Review the audit.', 409);
  return { success: true, replayed: true, audit };
}
async function live(client, id) {
  return (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/manualPriceControl.js:33:0"), [id])).rows[0];
}
async function update(client, row, p, actor) {
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/manualPriceControl.js:36:1"),
  [...fields.map((k) => p[k]), actor.name, row.id]);
  return live(client, row.id);
}
async function audit(client, historyId, action, reverses, row, updated, actor, input) {
  return (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/manualPriceControl.js:41:2"),


  [historyId, action, reverses, actor.id, actor.name, input.approvalReference, JSON.stringify(prices(row)), JSON.stringify(prices(updated)), updated.version])).rows[0];
}
export async function listManualPrices(user) {
  authorizePriceOperator(user);
  const pending = (await __qd_executePlan(query, __qd_registeredPlan("api/services/manualPriceControl.js:48:3"), [])).

  rows;
  const actions = (await __qd_executePlan(query, __qd_registeredPlan("api/services/manualPriceControl.js:51:4"), [])).
  rows;
  return { success: true, today: businessToday(), timezone: 'Africa/Windhoek', pending, actions,
    limitations: 'Existing global products only. Staged additions and branch-specific prices require manual policy review. Automatic activation remains disabled.' };
}
export async function activateManualPrice(id, input, user) {
  const actor = authorizePriceOperator(user);validateId(id);validateInput(input);
  const result = await withTransaction(async (client) => {
    // Same transaction lock as imports, direct edits and the legacy activator.
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/manualPriceControl.js:60:5"), []);
    const done = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/manualPriceControl.js:61:6"), [id])).rows[0];
    if (done) return replay(done, actor, input);
    const h = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/manualPriceControl.js:63:7"), [id])).rows[0];
    if (!h) throw fail('Schedule not found', 404);
    if (h.status !== 'pending') throw fail('Schedule is not pending');
    if (date(h.effective_from) > businessToday()) throw fail('Not yet effective in Africa/Windhoek');
    const row = await live(client, h.product_id);
    if (!row || row.merged_into_id) throw fail('Product is missing or archived');
    const overlaps = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/manualPriceControl.js:69:8"),
    [row.id, h.effective_from, h.id]);
    if (overlaps.rowCount) throw fail('Overlapping or earlier pending schedules require review; nothing activated');
    const before = Object.fromEntries(fields.map((k) => [k, h['old_' + k]]));
    const after = Object.fromEntries(fields.map((k) => [k, Number(h['new_' + k])]));
    if (fields.some((k) => before[k] === null || before[k] === undefined) || !same(row, before))
    throw fail('Live prices differ from the scheduled prior prices; review rather than overwrite');
    if (fields.some((k) => h['new_' + k] === null || h['new_' + k] === undefined || !Number.isFinite(after[k]) || after[k] < 0) || after.dp <= 0 || after.cp <= 0)
    throw fail('Scheduled prices are invalid', 422);
    const updated = await update(client, row, after, actor);
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/manualPriceControl.js:79:9"), [h.id]);
    const action = await audit(client, h.id, 'activation', null, row, updated, actor, input);
    return { success: true, replayed: false, audit: action };
  });
  if (!result.replayed) await publishRealtimeEvent('prices', 'updated', { historyId: Number(id), action: 'manual-activation' });
  return result;
}
export async function compensateManualPrice(id, input, user) {
  const actor = authorizePriceOperator(user);validateId(id);validateInput(input);
  const result = await withTransaction(async (client) => {
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/manualPriceControl.js:89:10"), []);
    const done = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/manualPriceControl.js:90:11"), [id])).rows[0];
    if (done) return replay(done, actor, input);
    const original = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/manualPriceControl.js:92:12"),
    [id])).rows[0];
    if (!original) throw fail('Manual activation not found', 404);
    const row = await live(client, original.product_id);
    if (!row || row.merged_into_id || !same(row, original.after_prices) || row.version !== original.live_version)
    throw fail('Another price update occurred. Compensation requires review; nothing overwritten');
    const changed = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/manualPriceControl.js:98:13"),


    [row.id, row.description, ...fields.map((k) => row[k]), ...fields.map((k) => original.before_prices[k]), actor.name, businessToday()])).rows[0];
    const updated = await update(client, row, original.before_prices, actor);
    const action = await audit(client, changed.id, 'compensation', Number(id), row, updated, actor, input);
    return { success: true, replayed: false, audit: action };
  });
  if (!result.replayed) await publishRealtimeEvent('prices', 'updated', { historyId: Number(id), action: 'manual-compensation' });
  return result;
}
