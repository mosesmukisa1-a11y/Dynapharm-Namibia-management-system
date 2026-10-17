// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';import {
  getOne, query } from "./helpers/owned-raw-database.js";
import clients from '../api/clients.js';
const consultant = { sub: 'SYNTH-C', role: 'consultant', branch: 'townshop', branches: ['tsumeb'] };
async function call(method = 'POST', user = consultant, url = '/api/clients?action=sync-checkups') {
  const result = { status: 200 };
  await clients({ method, user, url, headers: { host: 'isolated.test' }, body: {} }, {
    setHeader() {}, status(n) {result.status = n;return this;}, json(body) {result.body = body;return this;}, end() {}
  });
  return result;
}
const counts = () => getOne(`SELECT (SELECT COUNT(*) FROM stock_movements) stock,
 (SELECT COUNT(*) FROM reports) reports,(SELECT COUNT(*) FROM online_orders) orders,
 (SELECT COUNT(*) FROM branch_activity_transactions) payments`);
beforeAll(async () => {
  await query(`INSERT INTO clients(id,reference_number,full_name,phone,branch,data) VALUES
   ('SYNC-EXISTING','SYNC-REF','Existing Synthetic','100','Windhoek CBD','{"medicalHistory":"preserve"}'),
   ('SYNC-OTHER','SYNC-OTHER','Other Branch','300','swakopmund','{}')`);
  await query(`INSERT INTO appointments(id,client_reference,full_name,phone,branch,date,time,type,status,data) VALUES
   ('SYNC-A','SYNC-REF','Existing Synthetic','100','Windhoek CBD','2026-10-13','09:00','Checkup','completed','{}'),
   ('SYNC-B','SYNC-NEW','New Synthetic','200','Windhoek CBD','2026-10-13','09:00','Checkup','pending','{"allergies":"Synthetic only"}'),
   ('SYNC-C','SYNC-NEW','New Synthetic','200','townshop','2026-10-14','09:00','Checkup','pending','{}'),
   ('SYNC-D',NULL,'Other Branch','300','swakopmund','2026-10-13','09:00','Checkup','pending','{}'),
   ('SYNC-E','SYNC-NEW','Different Patient','200','Tsumeb','2026-10-13','09:00','Checkup','pending','{}'),
   ('SYNC-F',NULL,'New Synthetic','999','townshop','2026-10-13','09:00','Checkup','pending','{}'),
   ('SYNC-G',NULL,'General appointment only','999','townshop','2026-10-13','09:00','General','pending','{}')`);
});
it('feeds scoped checkups into persistent profiles, preserving existing profiles and avoiding name-only merges', async () => {
  const before = await counts();
  const appointments = (await query("SELECT * FROM appointments ORDER BY id")).rows;
  const r = await call();expect(r.status).toBe(200);expect(r.body.created).toBe(3);
  const list = await call('GET', consultant, '/api/clients');
  expect(list.body).toHaveLength(4);
  expect(list.body.find((c) => c.id === 'SYNC-EXISTING').medicalHistory).toBe('preserve');
  expect(list.body.find((c) => c.phone === '200' && c.branch === 'townshop').allergies).toBe('Synthetic only');
  expect(list.body.filter((c) => c.fullName === 'New Synthetic')).toHaveLength(2);
  expect(list.body.some((c) => c.branch === 'tsumeb')).toBe(true);
  expect(list.body.some((c) => c.id === 'SYNC-OTHER')).toBe(false);
  expect((await query('SELECT * FROM appointments ORDER BY id')).rows).toEqual(appointments);
  expect(await counts()).toEqual(before);
});
it('concurrent refresh and retry do not duplicate clients', async () => {
  await query("UPDATE clients SET full_name='Corrected Synthetic Name' WHERE id='SYNC-EXISTING'");
  const results = await Promise.all([call(), call()]);
  expect(results.map((r) => r.body.created)).toEqual([0, 0]);
  expect((await call('GET', consultant, '/api/clients')).body).toHaveLength(4);
  expect((await getOne("SELECT full_name FROM clients WHERE id='SYNC-EXISTING'")).full_name).toBe('Corrected Synthetic Name');
});
it('denies unauthorized sync and cross-branch client reads, and returns no records with no assigned scope', async () => {
  expect((await call('POST', { sub: 'SYNTH-D', role: 'distributor', branch: 'townshop' })).status).toBe(403);
  expect((await call('POST', null)).status).toBe(401);
  expect((await call('GET', consultant, '/api/clients?id=SYNC-OTHER')).status).toBe(403);
  const noBranch = { sub: 'SYNTH-N', role: 'consultant' };
  expect((await call('POST', noBranch)).body.created).toBe(0);
  expect((await call('GET', noBranch, '/api/clients')).body).toEqual([]);
});
it('new checkups appear on next refresh without changing earlier profile data', async () => {
  await query(`INSERT INTO appointments(id,full_name,phone,branch,date,time,status,type)
   VALUES('SYNC-LATER','Later Synthetic','444','townshop','2026-10-15','09:00','pending','Checkup')`);
  expect((await call()).body.created).toBe(1);
  expect((await call('GET', consultant, '/api/clients')).body.some((c) => c.fullName === 'Later Synthetic')).toBe(true);
});
