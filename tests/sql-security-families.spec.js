import { ownedStatement as __ownedStatement } from "./helpers/owned-statement.js";import { query as __owned_app_query } from "../api/db.js"; // @vitest-environment node
// Actual handlers and PostgreSQL, never a mocked database. Authentication
// semantics are separately tested by the retained real-session browser suite.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { insert, update, findById, findAll, remove, withRequestTransaction } from '../api/db.js';import { query } from "./helpers/owned-raw-database.js";
import { applicationFields, applicationColumns } from '../api/services/sqlFieldPolicy.js';
import { errorOutputBoundary } from '../api/services/errorOutputBoundary.js';
import { getStockCostProjection, getSalesCostPage } from '../api/services/stockCostReporting.js';
import { readControlledStockRegister } from '../api/services/controlledStockRegister.js';
import { stockLedgerPage } from '../api/services/stockLedgerPage.js';
const marker = 'SQL_ATTACK_MARKER',attack = marker + "'); DROP TABLE clients; --";
const id = 'OFFLINE-SQL-' + randomUUID(),foreign = id + '-unrelated';
let server,base,spy,quiet,observed = [],tracking = false;
const handlers = {},user = { id: 'CLOSURE-GM', username: 'closure-gm', fullName: 'Synthetic SQL reviewer', role: 'gm', branch: 'townshop' };
const families = [
['daily', '../api/reports/branch-sales/daily.js', (v) => ({ date: '2026-10-17', branch_id: v })],
['monthly', '../api/reports/branch-sales/monthly.js', (v) => ({ month: '2026-10', branch_id: v })],
['summary', '../api/reports/branch-sales/summary.js', (v) => ({ from: '2026-10-01', to: '2026-10-17', branch: v })],
['walkin', '../api/branch/walkin-sales.js', (v) => ({ branch: 'townshop', search: v, distributor_nb: v, from: '2026-10-01', to: '2026-10-17', limit: '20' })],
['warehouse', '../api/warehouse/inventory.js', (v) => ({ warehouse: id, product: v, includeMovements: '1', limit: '20' })],
['csi', '../api/mis/csi-entries.js', (v) => ({ branch: v, startDate: '2026-10-01', endDate: '2026-10-17' })],
['receipts', '../api/mis/receipts.js', (v) => ({ branch: v, q: v, date: '2026-10-17' })],
['misstock', '../api/mis/stock-report.js', (v) => ({ branch: v, start: '2026-10-01', end: '2026-10-17' })],
['profit', '../api/director/products/profit-analysis.js', (v) => ({ startDate: v === attack ? attack : '2026-10-01', endDate: '2026-10-17' }), { rejectedBeforeQuery: true }],
['trace', '../api/stock/trace.js', (v) => ({ search: v })],
['movements', '../api/stock-movements.js', (v) => ({ branch: 'townshop', search: v, reference_id: v, limit: '20' })],
['imports', '../api/supplier-imports.js', (v) => ({ warehouse: v, supplier: v, product: v, limit: '20' })],
['employees', '../api/employees.js', (v) => ({ department: v })],
['cost', '../api/stock/cost-report.js', (v) => ({ productName: v, audit: 'stock_csv' })]];

beforeAll(async () => {
  quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  await query('INSERT INTO clients(id,full_name,branch) VALUES($1,$2,$3),($4,$5,$6)',
  [id, 'Synthetic SQL own', 'townshop', foreign, 'Synthetic SQL unrelated', 'tsumeb']);
  await query("INSERT INTO warehouse_locations(id,name,type) VALUES($1,'Synthetic SQL warehouse','warehouse')", [id]);
  const syntheticHash = await bcrypt.hash(randomUUID(), 6);
  await query(`INSERT INTO users(id,username,password_hash,role,full_name,branch,phone)
    VALUES('CLOSURE-GM','closure-gm',$1,'gm','Synthetic SQL reviewer','townshop','own'),
    ($2,$3,$1,'consultant','Synthetic unrelated user','tsumeb','unchanged')`,
  [syntheticHash, foreign, foreign.toLowerCase()]);
  for (const [name, file] of families) handlers[name] = (await import(file)).default;
  handlers.profile = (await import('../api/staff/profile.js')).default;
  const app = express();app.use(errorOutputBoundary);app.use(express.json());
  app.use((req, res, next) => {req.user = user;next();});
  app.all('/family/:family', (req, res, next) => {
    if (!Object.hasOwn(handlers, req.params.family)) return res.status(404).json({ success: false });
    Promise.resolve(handlers[req.params.family](req, res)).catch(next);
  });
  server = http.createServer(app);await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const original = pg.Client.prototype.query;
  spy = vi.spyOn(pg.Client.prototype, 'query').mockImplementation(function (...args) {
    const text = typeof args[0] === 'string' ? args[0] : args[0]?.text;
    if (tracking && typeof text === 'string') observed.push({
      fingerprint: createHash('sha256').update(text).digest('hex'), hostileStructure: text.toUpperCase().includes(marker),
      hostileBound: JSON.stringify(args[1] || args[0]?.values || []).replaceAll('\\\\', '').toUpperCase().includes(marker)
    });
    return original.apply(this, args);
  });
});
afterAll(async () => {
  tracking = false;spy?.mockRestore();quiet?.mockRestore();
  if (server) await new Promise((r) => server.close(r));
  await query('DELETE FROM clients WHERE id=ANY($1::text[])', [[id, foreign]]);
  await query('DELETE FROM warehouse_locations WHERE id=$1', [id]);
  await query("DELETE FROM users WHERE id=ANY($1::text[])", [['CLOSURE-GM', foreign]]);
});
describe('native finite CRUD repository', () => {
  it.each(Object.keys(applicationFields))('policy fields exist in repository schema: %s', async (table) => {
    const cols = (await query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1`, [table])).rows.map((r) => r.column_name);
    expect(applicationFields[table].every((c) => cols.includes(c))).toBe(true);
  });
  it('hostile values stay data for insert/update/find/delete; unrelated record untouched', async () => {
    const key = id + '-crud';tracking = true;observed = [];
    try {
      await insert('clients', { id: key, full_name: attack, branch: 'townshop' });
      expect((await findById('clients', key)).full_name === attack).toBe(true);
      expect((await findAll('clients', { id: key }, 'created_at DESC')).length).toBe(1);
      await update('clients', key, { full_name: attack + 'updated' });
      expect((await findById('clients', key)).full_name === attack + 'updated').toBe(true);
      await remove('clients', key);
      expect(observed.length > 0 && observed.every((x) => !x.hostileStructure)).toBe(true);
    } finally {tracking = false;await query('DELETE FROM clients WHERE id=$1', [key]);}
    expect((await findById('clients', foreign)).full_name).toBe('Synthetic SQL unrelated');
  });
  it.each([attack, '__proto__', 'constructor', 'id DESC; SELECT 1', '../../server.js'])('rejects identifiers and spread aliases before native query %#', async (value) => {
    observed = [];tracking = true;
    try {
      await expect(insert(value, { id: 'bad' })).rejects.toThrow();
      await expect(update('clients', id, { [value]: 'bad' })).rejects.toThrow();
      await expect(findAll('clients', {}, value)).rejects.toThrow();
      expect(observed.length).toBe(0);
    } finally {tracking = false;}
  });
  it('rolls back real earlier writes on PostgreSQL failure, then retries once', async () => {
    const key = id + '-rollback';
    await expect(withRequestTransaction(async () => {
      await insert('clients', { id: key, full_name: 'Synthetic rollback', branch: 'townshop' });
      await __owned_app_query(__ownedStatement("owned-tests/tests/sql-security-families.spec.js:105:0", []));
    })).rejects.toThrow();
    expect(await findById('clients', key)).toBeNull();
    await withRequestTransaction(() => insert('clients', { id: key, full_name: 'Synthetic retry', branch: 'townshop' }));
    expect((await findAll('clients', { id: key })).length).toBe(1);
    await remove('clients', key);
  });
});
describe('actual read handler families with native PostgreSQL', () => {
  it.each(families)('%s: legitimate and hostile request keep statement structure unchanged', async (name, file, params, policy = {}) => {
    const invoke = (v) => fetch(base + '/family/' + name + '?' + new URLSearchParams(params(v)));
    await invoke('SYNTHETIC-NO-MATCH'); // Prime connection guard, never a shared target.
    observed = [];tracking = true;let normal, hostile, normalText, hostileText, normalShapes, hostileShapes;
    try {
      normal = await invoke('SYNTHETIC-NO-MATCH');normalText = await normal.text();
      normalShapes = observed.map((x) => x.fingerprint);observed = [];
      hostile = await invoke(attack);hostileText = await hostile.text();
      hostileShapes = observed.map((x) => x.fingerprint);
      expect(observed.every((x) => !x.hostileStructure)).toBe(true);
      if (policy.rejectedBeforeQuery) expect(observed).toHaveLength(0);else
      expect(observed.some((x) => x.hostileBound), 'Hostile input must reach a native bound parameter').toBe(true);
    } finally {tracking = false;}
    expect(normal.status).toBe(200);expect(hostile.status).toBe(policy.rejectedBeforeQuery ? 422 : 200);
    expect(normalShapes.length).toBeGreaterThan(0);
    if (!policy.rejectedBeforeQuery) expect(hostileShapes).toEqual(normalShapes);
    // Successful reports retain their selected-filter label; errors must not echo it.
    if (hostile.status >= 400) expect(hostileText.includes(attack)).toBe(false);
    expect(hostileText.includes(foreign)).toBe(false);
    expect((await findById('clients', foreign)).full_name).toBe('Synthetic SQL unrelated');
  });
  it('profile write binds JSON values, ignores spread/prototype fields, and leaves other identities unchanged', async () => {
    const response = await fetch(base + '/family/profile', { method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'update_contact', phone: attack, role: 'admin', password_hash: attack, [attack]: 'bad',
        ['__proto__']: { role: 'admin' } }) });
    expect(response.status).toBe(200);
    const own = (await query("SELECT phone,role FROM users WHERE id='CLOSURE-GM'")).rows[0];
    expect(own.phone === attack && own.role === 'gm').toBe(true);
    expect((await query('SELECT phone FROM users WHERE id=$1', [foreign])).rows[0].phone).toBe('unchanged');
    expect((await findById('clients', foreign)).full_name).toBe('Synthetic SQL unrelated');
  });
  it('actual projection and ledger callbacks bind hostile search/scope values', async () => {
    observed = [];tracking = true;
    try {
      const layers = await getStockCostProjection({ locations: [attack], productName: attack });
      expect(layers.length).toBe(0);
      await getSalesCostPage({ aliases: [attack], productName: attack, limit: 10 });
      await stockLedgerPage(new URL('http://test/?search=' + encodeURIComponent(attack)), { enforced: true, branches: ['townshop'] });
      expect(observed.length > 0 && observed.every((x) => !x.hostileStructure)).toBe(true);
    } finally {tracking = false;}
  });
  it('controlled register scopes physical/operation queries before hydration and rejects page/type fragments', async () => {
    const client = { query },options = { fail: (m) => {throw Error(m);}, physicalBatchSnapshot: (r) => r };
    observed = [];tracking = true;
    try {
      await readControlledStockRegister(client, { role: 'branch', branch: 'townshop' },
      { view: 'all', batch_search: attack, operation_search: attack, location: attack }, options);
      expect(observed.length > 0 && observed.every((x) => !x.hostileStructure)).toBe(true);
      for (const input of [{ batch_type: attack }, { batch_page: attack }, { operation_status: attack }]) {
        observed = [];await expect(readControlledStockRegister(client, user, input, options)).rejects.toThrow();
        expect(observed.length).toBe(0);
      }
    } finally {tracking = false;}
  });
});
