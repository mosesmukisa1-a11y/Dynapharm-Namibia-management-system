// @vitest-environment node
import { it, expect } from 'vitest';import {
  query } from "./helpers/owned-raw-database.js";
import handler from '../api/stock-movements.js';
async function invoke(body, role = 'stock', branch = null) {
  const result = { status: 200 };
  const res = { setHeader() {}, status(s) {result.status = s;return this;}, json(b) {result.body = b;return this;} };
  await handler({ method: 'PUT', url: '/api/stock-movements', headers: { host: 'localhost' }, body,
    user: { id: 'AUDIT-DISPOSER', username: 'synthetic-disposer', role, branch } }, res);
  return result;
}
it('disposes both pending statuses exactly once, without moving physical stock or crediting warehouses', async () => {
  const ids = ['AUDIT-DISPOSAL-1', 'AUDIT-DISPOSAL-2'];
  const physical = async () => (await query(`SELECT
 (SELECT COALESCE(SUM(remaining_quantity),0) FROM stock_batches) AS warehouse,
 (SELECT COALESCE(SUM(quantity),0) FROM branch_inventory_batches) AS branch`)).rows[0];
  const before = await physical();
  try {
    for (let i = 0; i < 2; i++) await query(`INSERT INTO stock_movements
    (id,product_name,movement_type,quantity,source_location,status,disposal_status)
    VALUES($1,'SYNTHETIC DISPOSAL','write_off',1,'townshop','approved',$2)`,
    [ids[i], i ? 'dispose_off' : 'pending_disposal']);
    const result = await invoke({ action: 'dispose_all', ids, disposed_by: 'forged-actor' });
    expect(result.status).toBe(200);expect(result.body.disposed).toBe(2);
    expect(await physical()).toEqual(before);
    expect((await query('SELECT DISTINCT disposed_by FROM stock_movements WHERE id=ANY($1)', [ids])).rows).
    toEqual([{ disposed_by: 'synthetic-disposer' }]);
    expect((await invoke({ action: 'dispose_all', ids })).status).toBe(409);
    expect(await physical()).toEqual(before);
  } finally {await query('DELETE FROM stock_movements WHERE id=ANY($1)', [ids]);}
});
it('denies unauthorized approval and disposal roles before mutation', async () => {
  expect((await invoke({ action: 'approve', id: 'absent' }, 'branch_manager', 'townshop')).status).toBe(403);
  expect((await invoke({ action: 'dispose', id: 'absent' }, 'finance')).status).toBe(403);
});
it('restricts a scoped stock manager and does not dispose an unapproved request', async () => {
  const id = 'AUDIT-DISPOSAL-SCOPE';
  try {
    await query(`INSERT INTO stock_movements(id,product_name,movement_type,quantity,source_location,status,disposal_status)
   VALUES($1,'SYNTHETIC DISPOSAL','write_off',1,'swakopmund','approved','dispose_off')`, [id]);
    expect((await invoke({ action: 'dispose', id }, 'stock_manager', 'townshop')).status).toBe(409);
    expect((await query('SELECT disposal_status FROM stock_movements WHERE id=$1', [id])).rows[0].disposal_status).toBe('dispose_off');
    await query("UPDATE stock_movements SET status='pending_approval' WHERE id=$1", [id]);
    expect((await invoke({ action: 'dispose', id })).status).toBe(409);
  } finally {await query('DELETE FROM stock_movements WHERE id=$1', [id]);}
});
