// @vitest-environment node
import { it, expect } from 'vitest';import {
  query } from "./helpers/owned-raw-database.js";
import { getDailySales } from '../api/services/dailySales.js';
import handler from '../api/gm/daily-sales.js';
import realtime from '../api/stock/realtime.js';
import director from '../api/director/summary.js';
import { buildEmployeeRecord } from '../api/employees.js';
it('preserves a distinct existing user link during HR edits', () => {
  const existing = { id: 'ROW-1', employee_id: 'EMPLOYEE-1', user_id: 'USER-1', full_name: 'Synthetic' };
  const updated = buildEmployeeRecord({ fullName: 'Synthetic edited', employeeId: 'EMPLOYEE-2' }, existing);
  expect(updated).toMatchObject({ id: 'ROW-1', employee_id: 'EMPLOYEE-2', user_id: 'USER-1', full_name: 'Synthetic edited' });
});
it('uses Windhoek half-open day boundaries, stable receipts, and saved DP across sale channels', async () => {
  const prefix = 'CROSS-PORTAL-';
  const fixtures = [
  ['before', '2026-10-11T21:59:59.999999Z', 'non_member'],
  ['midnight', '2026-10-11T22:00:00Z', 'member'],
  ['after', '2026-10-11T22:00:00.000001Z', 'non_member'],
  ['last', '2026-10-12T21:59:59.999999Z', 'online'],
  ['next', '2026-10-12T22:00:00Z', 'non_member'],
  ['next-after', '2026-10-12T22:00:00.000001Z', 'non_member']];
  try {
    for (const [id, date, customer] of fixtures) await query(`INSERT INTO branch_walkin_sales
   (id,branch_id,sale_date,customer_type,payment_method,total,subtotal,status,items,data)
   VALUES($1,'cross_portal_branch',$2,$3,'cash',$4,$4,'completed',$5,'{}')`,
    [prefix + id, date, customer, customer === 'non_member' ? 9 : 7, JSON.stringify([{ name: 'CROSS-PORTAL', quantity: 1, dpPrice: 7 }])]);
    for (const suffix of ['a', 'b']) await query(`INSERT INTO stock_movements
   (id,product_name,movement_type,quantity,source_location,status,reference_id,created_at)
   VALUES($1,'CROSS-PORTAL','walk_in_non_member_sale',1,'cross_portal_branch','posted',$2,'2026-10-12T10:00:00Z')`,
    [prefix + 'duplicate-' + suffix, prefix + 'after']);
    const daily = await getDailySales('2026-10-12');
    const branch = daily.branches.find((b) => b.branchId === 'cross_portal_branch');
    expect(branch).toMatchObject({ transactions: 3, revenue: 21, memberRevenue: 7, nonMemberRevenue: 7, onlineRevenue: 7, walkinCustomerReceipts: 23 });
  } finally {
    await query("DELETE FROM stock_movements WHERE id LIKE 'CROSS-PORTAL-%'");
    await query("DELETE FROM branch_walkin_sales WHERE id LIKE 'CROSS-PORTAL-%'");
  }
});
it('denies unauthenticated and branch-scoped callers company daily sales, realtime and Director summaries', async () => {
  for (const endpoint of [handler, realtime, director]) {
    for (const [user, status] of [[null, 401], [{ role: 'branch_manager', branch: 'townshop' }, 403]]) {
      const result = {};const res = { setHeader() {}, status(s) {result.status = s;return this;}, json() {return this;} };
      await endpoint({ method: 'GET', headers: { host: 'test' }, url: '/api/gm/daily-sales?date=2026-10-12', user }, res);
      expect(result.status).toBe(status);
    }
  }
});
