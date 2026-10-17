import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";import fs from 'node:fs/promises';
import { priceReferenceCount } from './queryDescriptors.js';
import crypto from 'node:crypto';
import { query, withTransaction, publishRealtimeEvent } from '../db.js';
import { businessToday, nameKey, normalizeCode, splitCode, resolveProduct } from '../../shared/price-list-import.js';

let schemaPromise;
export function ensurePriceImportSchema() {
  if (!schemaPromise) schemaPromise = (async () => {
    const sql = await fs.readFile(new URL('../../migrations/027_price_import_identity.sql', import.meta.url), 'utf8');
    await __qd_executePlan(query, __qd_registeredPlan("api/services/priceImport.js:11:0"), []);
  })().catch((error) => {schemaPromise = null;throw error;});
  return schemaPromise;
}
const fail = (message, status = 422) => Object.assign(new Error(message), { status });
const values = (p) => ['dp', 'cp', 'cif', 'bv'].map((k) => Number(p[k] ?? 0));
const same = (a, b) => values(a).every((v, i) => v === values(b)[i]);
export function validateDate(date, today = businessToday()) {
  const value = date || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`)) ||
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value || value < today)
  throw fail('Choose today or a valid future start date in Africa/Windhoek.');
  return value;
}
function validateProducts(products) {
  if (!Array.isArray(products) || !products.length || products.length > 5000) throw fail('Provide between 1 and 5000 products.');
  return products.map((p, i) => {
    const split = splitCode(p.description);
    const description = split.name.toUpperCase().replace(/\s+/g, ' ').trim();
    const code = normalizeCode(p.product_code || split.code);
    if (!description || code && !/^[A-Z0-9-]{2,30}$/.test(code) ||
    p.product_code && split.code && normalizeCode(p.product_code) !== split.code)
    throw fail(`Row ${i + 1}: invalid product identity.`);
    for (const key of ['dp', 'cp', 'cif', 'bv']) {
      if ((key === 'dp' || key === 'cp') && (p[key] === null || p[key] === undefined || p[key] === '')) throw fail(`Row ${i + 1}: ${key.toUpperCase()} is required.`);
      if (p[key] !== undefined && (p[key] === null || p[key] === '' || !Number.isFinite(Number(p[key])) || Number(p[key]) < 0))
      throw fail(`Row ${i + 1}: invalid ${key.toUpperCase()}.`);
    }
    if (Number(p.dp) <= 0 || Number(p.cp) <= 0) throw fail(`Row ${i + 1}: DP and CP must be positive.`);
    const prices = {};
    for (const key of ['dp', 'cp', 'cif', 'bv']) if (p[key] !== undefined) {
      prices[key] = Math.round((Number(p[key]) + Number.EPSILON) * 100) / 100;
      if (prices[key] >= 100000000) throw fail(`Row ${i + 1}: ${key.toUpperCase()} exceeds the supported amount.`);
    }
    return { ...p, ...prices, description, product_code: code || null, rowNumber: p.rowNumber || i + 1 };
  });
}
async function catalogue(client) {
  const live = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:49:1"), [])).rows;
  const staged = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:50:2"), [])).rows;
  return [...live, ...staged.map((p) => ({ ...p, id: p.match_id, staged_id: p.id }))];
}
const dateOf = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
export async function previewImport(client, products, date) {
  const effective_from = validateDate(date),today = businessToday(),catalog = await catalogue(client);
  const scheduled = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:56:3"), [effective_from])).rows;
  const input = validateProducts(products),seen = new Map(),rows = [];
  for (const product of input) {
    const resolved = resolveProduct(product, catalog);
    const existing = resolved.existing || null;
    const full = { ...product, cif: product.cif ?? existing?.cif ?? 0, bv: product.bv ?? existing?.bv ?? 0 };
    let status = resolved.conflict ? 'conflict' : existing ? 'update' : 'new',reason = resolved.conflict || '';
    if (existing?.staged_id && (dateOf(existing.effective_from) !== effective_from || !same(existing, full))) {
      status = 'conflict';reason = 'This new product already has a different pending date or prices. Review its schedule before replacing it.';
    } else if (existing && effective_from !== today && scheduled.some((h) => h.product_id === existing.id &&
    !same({ dp: h.new_dp, cp: h.new_cp, cif: h.new_cif, bv: h.new_bv }, full))) {
      status = 'conflict';reason = 'Different prices are already scheduled for this date. Review the pending change first.';
    }
    const key = existing ? `id:${existing.id}` : product.product_code ? `code:${product.product_code}` : `name:${nameKey(product.description)}`;
    const prior = seen.get(key);
    if (prior) {
      if (same(prior.product, full) && normalizeCode(prior.product.product_code) === normalizeCode(full.product_code)) {
        status = 'duplicate';reason = `Same as row ${prior.rowNumber}; imported once.`;
      } else {status = 'conflict';reason = 'Repeated identity has conflicting prices or codes.';prior.status = 'conflict';prior.reason = reason;}
    } else seen.set(key, { product: full, rowNumber: full.rowNumber });
    const row = { rowNumber: full.rowNumber, product: full, existing, status, reason };
    if (!prior) seen.set(key, row);
    rows.push(row);
  }
  const names = new Map();
  for (const row of rows) {const key = nameKey(row.product.description);if (!names.has(key)) names.set(key, []);names.get(key).push(row);}
  for (const group of names.values()) if (new Set(group.map((r) => normalizeCode(r.product.product_code))).size > 1) {
    for (const row of group) {row.status = 'conflict';row.reason = 'Repeated names have different or missing codes. Resolve the identity before importing.';}
  }
  return { today, effective_from, isImmediate: effective_from === today, canImport: rows.every((r) => r.status !== 'conflict'),
    rows, counts: { updated: rows.filter((r) => r.status === 'update').length, created: rows.filter((r) => r.status === 'new').length,
      duplicates: rows.filter((r) => r.status === 'duplicate').length, conflicts: rows.filter((r) => r.status === 'conflict').length } };
}
async function lock(client) {await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:89:4"), []);}
async function history(client, row, p, date, actor, status) {
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:91:5"),


  [row.id, row.description, ...values(row), ...values(p), actor, date, status]);
}
async function updateLive(client, row, p, actor) {
  // Identity and package flags are not overwritten by imported display names.
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:98:6"),

  [...values(p), p.product_code, actor, row.id]);
}
export async function importPrices(products, date, actor) {
  await ensurePriceImportSchema();
  const result = await withTransaction(async (client) => {
    await lock(client);
    const preview = await previewImport(client, products, date);
    if (!preview.canImport) throw fail('Resolve ambiguous or conflicting rows before importing.', 409);
    const result = { success: true, effective_from: preview.effective_from, isImmediate: preview.isImmediate,
      updated: 0, created: 0, scheduled: 0, unchanged: 0, duplicates: preview.counts.duplicates };
    for (const row of preview.rows) {
      if (row.status === 'duplicate') continue;
      const p = row.product,existing = row.existing;
      if (existing?.staged_id) {
        if (existing.effective_from.toISOString?.().slice(0, 10) !== preview.effective_from && String(existing.effective_from).slice(0, 10) !== preview.effective_from)
        throw fail('A new product already has a different pending start date; review its schedule first.', 409);
        if (same(existing, p)) {result.unchanged++;continue;}
        throw fail('A pending addition has different prices; review its schedule first.', 409);
      }
      if (existing) {
        const pending = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:120:7"), [existing.id, preview.effective_from])).rows;
        const dateOf = (p) => p.effective_from instanceof Date ? p.effective_from.toISOString().slice(0, 10) : String(p.effective_from).slice(0, 10);
        const target = pending.filter((h) => dateOf(h) === preview.effective_from).at(-1);
        const earlier = pending.filter((h) => dateOf(h) < preview.effective_from).at(-1);
        const expectedBefore = !preview.isImmediate && earlier ? { dp: earlier.new_dp, cp: earlier.new_cp, cif: earlier.new_cif, bv: earlier.new_bv } : existing;
        if (!preview.isImmediate && target && same({ dp: target.new_dp, cp: target.new_cp, cif: target.new_cif, bv: target.new_bv }, p)) {result.unchanged++;continue;}
        if (!preview.isImmediate && target) throw fail('This product already has different prices scheduled for that date; review its pending change first.', 409);
        if (same(expectedBefore, p)) {result.unchanged++;
          if (p.product_code && !existing.product_code) await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:128:8"), [p.product_code, existing.id]);
          continue;
        }
        await history(client, existing, p, preview.effective_from, actor, preview.isImmediate ? 'applied' : 'pending');
        if (preview.isImmediate) {await updateLive(client, existing, p, actor);result.updated++;} else
        {result.scheduled++;if (p.product_code && !existing.product_code) await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:133:9"), [p.product_code, existing.id]);}
      } else if (preview.isImmediate) {
        const created = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:135:10"),
        [p.description, p.product_code, ...values(p), actor])).rows[0];
        await history(client, { ...created, dp: 0, cp: 0, cif: 0, bv: 0 }, p, preview.effective_from, actor, 'applied');
        result.created++;
      } else {
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:140:11"),
        [p.description, p.product_code, ...values(p), preview.effective_from, actor]);
        result.scheduled++;
      }
    }
    return result;
  });
  if (result.isImmediate && (result.updated || result.created)) await publishRealtimeEvent('prices', 'updated', result);
  return result;
}
export async function activateDuePrices(today = businessToday()) {
  await ensurePriceImportSchema();
  const applied = await withTransaction(async (client) => {
    await lock(client);
    const staged = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:154:12"), [today])).rows;
    const pending = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:155:13"), [today])).rows;
    const due = [...staged.map((p) => ({ ...p, kind: 'addition' })), ...pending.map((p) => ({ ...p, kind: 'history' }))].
    sort((a, b) => dateOf(a.effective_from).localeCompare(dateOf(b.effective_from)) ||
    new Date(a.created_at || a.changed_at) - new Date(b.created_at || b.changed_at) || a.id - b.id);
    let count = 0;
    for (const p of due) {
      if (p.kind === 'history') {
        const row = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:162:14"), [p.product_id])).rows[0];
        if (!row || row.merged_into_id) throw fail('A pending price points to a missing or archived product; review reconciliation.', 409);
        await updateLive(client, row, { dp: p.new_dp, cp: p.new_cp, cif: p.new_cif, bv: p.new_bv, product_code: row.product_code }, p.changed_by);
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:165:15"), [p.id]);count++;continue;
      }
      const resolved = resolveProduct(p, (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:167:16"), [])).rows);
      if (resolved.conflict) {await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:168:17"), [p.id, resolved.conflict]);continue;}
      let existing = resolved.existing;
      if (existing) {await history(client, existing, p, p.effective_from, p.changed_by, 'applied');await updateLive(client, existing, p, p.changed_by);} else
      {existing = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:171:18"), [p.description, p.product_code, ...values(p), p.changed_by])).rows[0];
        await history(client, { ...existing, dp: 0, cp: 0, cif: 0, bv: 0 }, p, p.effective_from, p.changed_by, 'applied');}
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:173:19"), [existing.id, p.id]);count++;
    }
    return count;
  });
  if (applied) await publishRealtimeEvent('prices', 'activated', { count: applied, today });
  return applied;
}
export async function assertActivePriceProducts(items) {
  await ensurePriceImportSchema();
  const staged = (await __qd_executePlan(query, __qd_registeredPlan("api/services/priceImport.js:182:20"), [])).rows;
  if (!staged.length) return;
  const active = (await __qd_executePlan(query, __qd_registeredPlan("api/services/priceImport.js:184:21"), [])).rows;
  for (const item of items || []) {
    const description = item.name || item.product_name || item.description || '';
    const product = { description, product_code: item.product_code };
    const pending = staged.find((p) => nameKey(p.description) === nameKey(description) ||
    product.product_code && normalizeCode(p.product_code) === normalizeCode(product.product_code));
    if (pending && !resolveProduct(product, active).existing)
    throw fail(`${description}: this new product's price is not active. Its scheduled start date is ${dateOf(pending.effective_from)}.`, 409);
  }
}
function token(group) {return crypto.createHash('sha256').update(JSON.stringify(group)).digest('hex');}
async function duplicateGroups(client) {
  const rows = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:196:22"), [])).rows;
  const grouped = new Map(),uncertain = [];
  for (const row of rows) {const key = nameKey(row.description);if (!grouped.has(key)) grouped.set(key, []);grouped.get(key).push(row);}
  const groups = [];
  const foreignKeys = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:200:23"), [])).



  rows;
  for (const [key, list] of grouped) {
    if (list.length < 2) continue;
    const codes = new Set(list.map((r) => normalizeCode(r.product_code || splitCode(r.description).code)).filter(Boolean));
    const proven = codes.size <= 1 && new Set(list.map((r) => Boolean(r.is_package))).size === 1;
    const canonical = [...list].sort((a, b) => Number(Boolean(b.product_code)) - Number(Boolean(a.product_code)) || a.id - b.id)[0];
    const schedules = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:210:24"), [list.map((r) => r.id)])).rows;
    const sameDates = new Map();let conflicting = false;
    for (const schedule of schedules) {
      const date = String(schedule.effective_from);
      const price = [schedule.new_dp, schedule.new_cp, schedule.new_cif, schedule.new_bv].map(Number).join('|');
      if (sameDates.has(date) && sameDates.get(date) !== price) conflicting = true;
      sameDates.set(date, price);
    }
    const group = { key, rows: list, canonicalId: canonical.id, proven: proven && !conflicting,
      reason: !proven ? 'Distinct codes or package types: do not merge.' : conflicting ? 'Conflicting pending prices on the same date: review required.' : 'Same conservative name/pack identity and compatible codes; GM confirmation required.',
      references: [], schedules };
    for (const reference of foreignKeys) {
      const { rows: counts } = await __qd_executePlan(client.query.bind(client), priceReferenceCount(reference.schema, reference.table, reference.column, list.map((r) => r.id)));
      if (counts[0].count) group.references.push({ ...reference, count: counts[0].count });
    }
    group.reviewToken = token(group);(group.proven ? groups : uncertain).push(group);
  }
  // Identify the old single-space parser defect, but do not infer that a
  // numeric suffix is a CIF or erase a legitimate numeric product variant.
  for (const row of rows) {
    const suffix = nameKey(row.description).match(/^(.+)\s+(\d+(?:[.,]\d+)?)$/);
    if (!suffix) continue;
    const candidates = rows.filter((other) => other.id !== row.id && nameKey(other.description) === suffix[1]);
    if (candidates.length) uncertain.push({ key: `numeric:${row.id}`, proven: false, rows: [...candidates, row], canonicalId: candidates[0].id, references: [],
      reason: 'Possible old CIF-in-name import defect; numeric suffix could be a product variant. Confirm source evidence before repair.' });
  }
  return { groups, uncertain };
}
export async function reviewDuplicates() {
  await ensurePriceImportSchema();
  return withTransaction(duplicateGroups);
}
export async function reconcileDuplicates({ key, canonicalId, reviewToken, confirm }, actor) {
  if (confirm !== true) throw fail('Explicit GM confirmation is required.');
  await ensurePriceImportSchema();
  return withTransaction(async (client) => {
    await lock(client);
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:247:25"), []);
    const { groups } = await duplicateGroups(client),group = groups.find((g) => g.key === key);
    if (!group || group.reviewToken !== reviewToken) throw fail('Duplicate review is stale or uncertain. Reload before applying.', 409);
    const canonical = group.rows.find((r) => r.id === Number(canonicalId));
    if (!canonical) throw fail('Canonical identity must be one of the reviewed products.');
    const ids = group.rows.filter((r) => r.id !== canonical.id).map((r) => r.id);
    const histories = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:253:26"), [group.rows.map((r) => r.id)])).rows;
    const foreignKeys = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:254:27"), [])).rows;
    const backup = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:255:28"),
    [actor, canonical.id, JSON.stringify({ group, histories, foreignKeys })])).rows[0];
    // Archive, never DELETE: original IDs/names and all dependent stock/cost
    // references survive. Only catalogue schedules/history follow the GM's identity.
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:259:29"), [canonical.id, ids]);
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:260:30"), [canonical.id, ids]);
    const code = group.rows.map((r) => r.product_code || splitCode(r.description).code).find(Boolean);
    if (code && !canonical.product_code) {
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:263:31"), [ids]);
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/priceImport.js:264:32"), [code, canonical.id]);
    }
    return { success: true, canonicalId: canonical.id, archivedIds: ids, backupId: backup.id };
  });
}
