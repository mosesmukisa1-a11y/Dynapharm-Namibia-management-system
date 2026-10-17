// @vitest-environment node
import { beforeAll, afterAll, it, expect } from 'vitest';
import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';import {
  query } from "./helpers/owned-raw-database.js";
import login from '../api/auth/login.js';
import sales from '../api/branch/walkin-sales.js';
import { getTokenFromRequest, verifyAuthToken } from '../api/_lib/auth.js';
const prefix = 'WRK-' + randomUUID().slice(0, 8),product = prefix + '-PRODUCT',actor = prefix + '-staff',branch = 'townshop';
const password = randomUUID();let server, origin, cookie;
const observations = [];
const count = async () => Number((await query('SELECT SUM(quantity) n FROM branch_inventory_batches WHERE product_name=$1', [product])).rows[0].n);
async function request(body, session = cookie) {
  const r = await fetch(origin + '/api/branch/walkin-sales', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(session ? { Cookie: session } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
const payload = (id) => ({ id, saleNumber: id, branch, customerType: 'non_member', subtotal: 443, total: 443, createdBy: 'forged',
  products: [{ product_name: product, quantity: 1, dp: 999, cp: 999, unit_price: 443 }] });
beforeAll(async () => {
  await query(`INSERT INTO users(id,username,password_hash,full_name,role,branch,is_active,must_change_password)
 VALUES($1::text,$1::text,$2,'Synthetic branch operator','branch',$3,true,false)`, [actor, await bcrypt.hash(password, 4), branch]);
  await query('INSERT INTO product_prices(description,product_code,dp,cp,cif,bv) VALUES($1::text,$1::text,341,443,70,1)', [product]);
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,status,metadata)
 VALUES($1,$2,$3,'ACK-LOT','2035-12-31',10,70,'in_stock',$4)`,
  [prefix + '-batch', branch, product, JSON.stringify({ cost_layers: [{ quantity: 10, source: { id: prefix + '-original', cif_unit_cost: 70, dpc_unit_value: 341 } }] })]);
  const app = express();app.use(express.json());app.post('/api/auth/login', login);
  app.use((req, res, next) => {const user = verifyAuthToken(getTokenFromRequest(req));if (user) req.user = user;next();});
  app.all('/api/branch/walkin-sales', sales);
  server = await new Promise((resolve) => {const s = app.listen(0, '127.0.0.1', () => resolve(s));});origin = 'http://127.0.0.1:' + server.address().port;
  const signed = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: actor, password }) });
  expect(signed.status).toBe(200);cookie = signed.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
});
afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
  await mkdir('generated-artifacts/stock-worker/test-evidence', { recursive: true });
  await writeFile('generated-artifacts/stock-worker/test-evidence/sale-commit-recovery.json', JSON.stringify({
    isolated: true, staffLogin: 'actual login handler and signed-cookie middleware', fault: 'lost acknowledgement after committed sale; not an OS process kill', observations }, null, 2));
  // This file runs in its own disposable database during --all. Explicit cleanup
  // also preserves safety when invoked as a focused suite.
  await query('DELETE FROM stock_sale_allocations WHERE product_name=$1', [product]);
  await query('DELETE FROM branch_distributor_profit WHERE sale_id LIKE $1', [prefix + '%']);
  await query('DELETE FROM stock_movements WHERE product_name=$1', [product]);
  await query('DELETE FROM branch_inventory_movements WHERE product_name=$1', [product]);
  await query('DELETE FROM branch_walkin_sales WHERE id LIKE $1', [prefix + '%']);
  await query('DELETE FROM inventory_balances WHERE product_name=$1', [product]);
  await query('DELETE FROM branch_inventory_batches WHERE product_name=$1', [product]);
  await query('DELETE FROM product_prices WHERE description=$1', [product]);
  await query('DELETE FROM hr_records WHERE employee_id=$1', [actor]);
  await query('DELETE FROM users WHERE id=$1', [actor]);
});
it('real branch staff sale survives lost commit acknowledgement and retry without another deduction', async () => {
  const id = prefix + '-ACK',before = await count(),original = pg.Client.prototype.query;
  const marked = new WeakSet();let injected = false,first;
  pg.Client.prototype.query = function (...args) {
    const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text,values = Array.isArray(args[1]) ? args[1] : args[0]?.values;
    const result = original.apply(this, args);
    if (/INSERT\s+INTO\s+branch_walkin_sales/i.test(sql || '') && values?.includes(id)) marked.add(this);
    if (String(sql).trim().toUpperCase() === 'COMMIT' && marked.has(this) && !injected) {
      injected = true;return Promise.resolve(result).then(() => {throw Object.assign(Error('Owned synthetic lost commit acknowledgement'), { code: '08006' });});
    }
    return result;
  };
  try {first = await request(payload(id));} finally {pg.Client.prototype.query = original;}
  expect(injected).toBe(true);expect(first.status).toBe(500);expect(await count()).toBe(before - 1);
  const retry = await request(payload(id));expect(retry.status).toBe(200);expect(await count()).toBe(before - 1);
  expect((await query('SELECT COUNT(*)::int n FROM branch_walkin_sales WHERE id=$1', [id])).rows[0].n).toBe(1);
  const { rows } = await query('SELECT quantity,unit_dp,created_by,reference_id FROM stock_movements WHERE reference_id=$1', [id]);
  expect(rows).toHaveLength(1);expect(Number(rows[0].quantity)).toBe(1);expect(Number(rows[0].unit_dp)).toBe(341);
  expect(String(rows[0].created_by)).toBeTruthy();
  expect(String(rows[0].created_by)).not.toBe('forged');
  observations.push({ action: 'POST /api/branch/walkin-sales', firstStatus: first.status, retryStatus: retry.status,
    before, after: await count(), saleId: id, authoritativeDP: 341, customerCP: 443, clientFakeDP: 999, movementCount: rows.length });
});
it('unauthenticated and other-branch submissions cannot change this stock', async () => {
  const before = await count();
  expect((await request(payload(prefix + '-NOAUTH'), null)).status).toBe(401);
  expect((await request({ ...payload(prefix + '-OTHER'), branch: 'tsumeb' })).status).toBe(403);
  expect(await count()).toBe(before);
  observations.push({ action: 'unauthenticated / cross-branch POST', statuses: [401, 403], before, after: await count() });
});
