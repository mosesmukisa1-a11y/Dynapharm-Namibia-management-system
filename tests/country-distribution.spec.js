// @vitest-environment node
import { beforeAll, afterAll, it, expect } from 'vitest';import {
  query } from "./helpers/owned-raw-database.js";
import transfers from '../api/stock/transfers.js';
import catalog from '../api/stock/distribution/catalog.js';
import history from '../api/stock/distribution/history.js';
import receive from '../api/stock/warehouses/receive-stock.js';
import release from '../api/stock/country-stock/release.js';
import { totalOf, needsReview, productCountOf } from '../client/src/components/stock/distributionModel.js';
const stock = { id: 'ISOLATED-STOCK', role: 'stock', fullName: 'Synthetic stock' };
const gm = { id: 'ISOLATED-GM', role: 'gm', fullName: 'Synthetic GM' };
async function call(handler, body = {}, user = stock, method = 'POST', url = '/api/test') {
  const out = { status: 200 };const res = { setHeader() {}, getHeader() {}, status(n) {out.status = n;return this;},
    json(body) {out.body = body;return this;}, end() {return this;} };
  await handler({ method, url, body, user, headers: { host: 'isolated.test' } }, res);return out;
}
const draft = (quantity, key) => ({ from_location: 'country_stock', to_location: 'windhoek_warehouse',
  operation_key: key, dispatchNotes: 'Keep this note', items: [{ productId: 'DIST-1', productName: 'Distribution test', quantity }] });
beforeAll(async () => {
  if (process.env.STOCK_AUDIT_ISOLATED !== '1') throw Error('Isolated database required');
  expect((await query('SELECT current_database() AS db')).rows[0].db).toBe(process.env.STOCK_AUDIT_DATABASE);
  await query(`INSERT INTO products(id,sku,name,unit,is_active)
    VALUES('DIST-1','DIST-SKU','Distribution test','unit',true)`);
  await query(`INSERT INTO products(id,sku,name,unit,is_active)
    SELECT 'DIST-'||i,'SKU-'||i,'Additional product '||i,'unit',true FROM generate_series(2,107) i`);
  await query(`INSERT INTO stock_batches(id,description,batch_no,expiry_date,quantity,remaining_quantity,
    location,warehouse_id,status,product_id,cif_unit_cost,dpc_unit_value)
    VALUES('DIST-B1','Distribution test','LOT-1','2035-01-01',30,30,'country_stock','country_stock','available','DIST-1',2,7),
    ('DIST-B2','Distribution test','LOT-2','2036-01-01',70,70,'country_stock','country_stock','available','DIST-1',2,7)`);
});
afterAll(async () => {
  if (process.env.STOCK_AUDIT_ISOLATED !== '1' ||
  (await query('SELECT current_database() db')).rows[0].db !== process.env.STOCK_AUDIT_DATABASE)
  throw Error('Refusing cleanup outside the isolated audit database');
  const ids = (await query("SELECT DISTINCT transfer_id FROM stock_transfer_items WHERE product_name='Distribution test'")).rows.map((r) => r.transfer_id);
  await query("DELETE FROM stock_batches WHERE description='Distribution test'");
  await query("DELETE FROM stock_movements WHERE product_name='Distribution test'");
  await query("DELETE FROM inventory_balances WHERE product_name='Distribution test'");
  await query("DELETE FROM stock_transfer_allocations WHERE line_id IN (SELECT id FROM stock_transfer_items WHERE transfer_id=ANY($1::text[]))", [ids]);
  await query('DELETE FROM stock_transfer_items WHERE transfer_id=ANY($1::text[])', [ids]);
  await query('DELETE FROM dispatch_notes WHERE transfer_id=ANY($1::text[])', [ids]);
  await query('DELETE FROM stock_transfers WHERE id=ANY($1::text[])', [ids]);
  await query("DELETE FROM stock_transfers WHERE id LIKE 'DIST-LEGACY-%'");
  await query("DELETE FROM products WHERE id LIKE 'DIST-%'");
});
it('returns every catalogue entry and denies branch staff', async () => {
  const result = await call(catalog, {}, stock, 'GET');
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  expect(result.body.products.length).toBeGreaterThanOrEqual(107);
  expect(result.body.products.find((p) => p.id === 'DIST-1').available).toBe(100);
  expect((await call(catalog, {}, { role: 'branch_manager', branch: 'townshop' }, 'GET')).status).toBe(403);
  expect((await call(catalog, {}, { role: 'stock_manager' }, 'GET')).status).toBe(403);
});
it('rejects empty, fractional, invalid identity, invalid destination, and excessive requests', async () => {
  for (const body of [{ ...draft(1, 'empty'), items: [] }, draft(1.5, 'fraction'),
  { ...draft(1, 'bad-id'), items: [{ productId: 'missing', quantity: 1 }] },
  { ...draft(1, 'bad-dest'), to_location: 'townshop' }, draft(101, 'excess')]) {
    expect((await call(transfers, body)).status).toBeGreaterThanOrEqual(400);
  }
});
it('serializes competing submissions, retries safely, restores rejection, and receives once', async () => {
  const results = await Promise.all(['race-a', 'race-b'].map((key) => call(transfers, draft(60, key))));
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  const winner = results.findIndex((r) => r.status === 201),id = results[winner].body.transfer.id;
  const [replay, secondReplay] = await Promise.all([1, 2].map(() => call(transfers, draft(60, ['race-a', 'race-b'][winner]))));
  expect(replay.status, JSON.stringify(replay.body)).toBe(200);
  expect(replay.body.transfer.id).toBe(id);
  expect(secondReplay.body.transfer.id).toBe(id);
  expect((await call(transfers, { id, status: 'cancelled' }, { role: 'branch_manager', branch: 'townshop' }, 'PATCH')).status).toBe(403);
  const approved = await call(transfers, { id, status: 'approved', gmAction: 'approve' }, gm, 'PATCH');
  expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  expect((await call(receive, { transferId: id, action: 'accept' }, { role: 'warehouse_manager', branch: 'ondangwa_warehouse' })).status).toBe(403);
  expect((await call(receive, { transferId: id, action: 'reject', rejectionReason: 'Synthetic rejection' })).status).toBe(200);
  expect((await call(catalog, {}, stock, 'GET')).body.products.find((p) => p.id === 'DIST-1').available).toBe(100);
  const next = await call(release, { warehouseId: 'windhoek_warehouse', items: draft(60, 'second').items, operation_key: 'second' });
  expect(next.status, JSON.stringify(next.body)).toBe(201);
  const nextId = next.body.transferId;
  expect((await call(transfers, { id: nextId, status: 'approved', gmAction: 'approve' }, gm, 'PATCH')).status).toBe(200);
  expect((await call(receive, { transferId: nextId, action: 'accept' })).status).toBe(200);
  expect((await call(receive, { transferId: nextId, action: 'accept' })).status).toBe(409);
  expect(Number((await query("SELECT SUM(remaining_quantity) qty FROM stock_batches WHERE location='country_stock' AND description='Distribution test'")).rows[0].qty)).toBe(40);
  expect(Number((await query("SELECT SUM(remaining_quantity) qty FROM stock_batches WHERE location='windhoek_warehouse' AND description='Distribution test'")).rows[0].qty)).toBe(60);
  const page = await call(history, {}, stock, 'GET', '/api/test?page=1&pageSize=1&search=Distribution%20test');
  expect(page.status, JSON.stringify(page.body)).toBe(200);
  expect(page.body.total).toBe(2);
  expect(page.body.transfers.length).toBe(1);
});
it('projects legacy header evidence without backfilling lines, inventing IDs, or hiding real zero quantities', async () => {
  await query(`INSERT INTO stock_transfers(id,from_warehouse,to_branch,status,product_name,quantity,metadata)
    VALUES ('DIST-LEGACY-VALID','country_stock','ondangwa_warehouse','received','LEGACY-HEADER-PRODUCT',1,
      '{"batch_no":"HEADER-LOT","auto_received":true}'),
    ('DIST-LEGACY-EMPTY','country_stock','ondangwa_warehouse','received',NULL,NULL,'{}'),
    ('DIST-LEGACY-ZERO','country_stock','ondangwa_warehouse','received','LEGACY-ZERO-PRODUCT',0,'{"quantity":99}')`);
  const snapshot = await query("SELECT id,status,quantity,metadata,updated_at FROM stock_transfers WHERE id LIKE 'DIST-LEGACY-%' ORDER BY id");
  const result = await call(transfers, {}, stock, 'GET', '/api/test?id=DIST-LEGACY-VALID');
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  const transfer = result.body.transfers[0];
  expect(transfer.itemsSource).toBe('legacy_transfer_header');
  expect(transfer.items).toHaveLength(1);
  expect(transfer.items[0]).toMatchObject({ productId: null, productName: 'LEGACY-HEADER-PRODUCT', quantity: 1, batchNo: 'HEADER-LOT' });
  expect(totalOf(transfer)).toBe(1);
  expect(productCountOf(transfer)).toBe(1);
  expect(needsReview(transfer)).toBe(false);
  for (const id of ['DIST-LEGACY-EMPTY', 'DIST-LEGACY-ZERO']) {
    const record = (await call(transfers, {}, stock, 'GET', `/api/test?id=${id}`)).body.transfers[0];
    expect(totalOf(record)).toBe(0);
    expect(needsReview(record)).toBe(true);
  }
  const search = await call(history, {}, stock, 'GET', '/api/test?search=LEGACY-HEADER-PRODUCT');
  expect(search.body.total).toBe(1);
  expect(totalOf(search.body.transfers[0])).toBe(1);
  expect(Number((await query("SELECT COUNT(*) count FROM stock_transfer_items WHERE transfer_id LIKE 'DIST-LEGACY-%'")).rows[0].count)).toBe(0);
  expect((await query("SELECT id,status,quantity,metadata,updated_at FROM stock_transfers WHERE id LIKE 'DIST-LEGACY-%' ORDER BY id")).rows).toEqual(snapshot.rows);
});
