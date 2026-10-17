// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';import {
  query } from "./helpers/owned-raw-database.js";
import { assertIsolatedTestDatabase } from '../api/testDatabaseGuard.js';
import policyHandler from '../api/stock/alert-policy.js';
import { getStockAlertPolicy } from '../api/services/stockAlertPolicy.js';
import { getLocationStockSummary, getCompanyStockSummary, getStockAlerts } from '../api/services/gmFinanceMisEngine.js';
import lowStockHandler from '../api/stock/reports/low-stock.js';
import expiryHandler from '../api/stock/reports/expiry.js';
import priorityHandler from '../api/stock/expiry-priority-batches.js';
import branchHandler from '../api/branch/stock-summary.js';
import gmAlertsHandler from '../api/gm/alerts/stock.js';

const id = `ALERT-${randomUUID()}`;
const products = [0, 5, 10, 15].map((q) => `${id}-${q}`);
const defaults = { lowStockThreshold: 10, expiryWarningDays: 90 };
async function invoke(handler, method = 'GET', body, role = 'stock', suffix = '', params = {}) {
  const result = { status: 200 };
  await handler({ method, body, user: role === null ? null : { id, role }, query: params,
    headers: { host: 'internal' }, url: `/api/stock/test${suffix}` },
  { setHeader() {}, end() {}, status(status) {result.status = status;return this;},
    json(value) {result.body = value;return this;} });
  return result;
}
beforeAll(async () => {
  assertIsolatedTestDatabase();
  await query(`CREATE TABLE IF NOT EXISTS system_settings(key VARCHAR(120) PRIMARY KEY,value TEXT NOT NULL,updated_at TIMESTAMPTZ DEFAULT NOW())`);
  for (const qty of [0, 5, 10, 15]) {
    const product = `${id}-${qty}`;
    await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,status)
      VALUES($1,'townshop',$2,$1,CURRENT_DATE + 45,$3,'in_stock')`, [product, product, qty]);
    await query(`INSERT INTO stock_batches(id,barcode,description,batch_no,expiry_date,quantity,remaining_quantity,location,status)
      VALUES($1,$1,$2,$1,CURRENT_DATE + 45,$3,$3,'windhoek_warehouse','available')`, [`W-${product}`, product, qty]);
    await query(`INSERT INTO inventory_balances(id,location_type,location_id,product_name,batch_no,expiry_date,closing_qty)
      VALUES($1,'branch','townshop',$2,$1,CURRENT_DATE + 45,$3)`, [`I-${product}`, product, qty]);
  }
});
beforeEach(async () => {await query("DELETE FROM system_settings WHERE key='stock_alert_policy'");});
afterAll(async () => {
  await query('DELETE FROM inventory_balances WHERE product_name=ANY($1)', [products]);
  await query('DELETE FROM stock_batches WHERE description=ANY($1)', [products]);
  await query('DELETE FROM branch_inventory_batches WHERE product_name=ANY($1)', [products]);
  await query("DELETE FROM system_settings WHERE key='stock_alert_policy'");
});
describe('saved stock warning policy in an isolated database', () => {
  it('retains the existing defaults until explicitly saved and persists both fields together', async () => {
    expect(await getStockAlertPolicy()).toEqual(defaults);
    const policy = { lowStockThreshold: 20, expiryWarningDays: 60 };
    expect((await invoke(policyHandler, 'PUT', policy)).body.policy).toEqual(policy);
    expect((await invoke(policyHandler)).body.policy).toEqual(policy);
  });
  it.each(['stock', 'stock_manager', 'gm', 'general_manager', 'admin', 'superadmin', 'super_admin'])('allows %s to save', async (role) => {
    const result = await invoke(policyHandler, 'PUT', defaults, role);
    expect(result.status).toBe(200);
    expect(result.body.canEdit).toBe(true);
  });
  it.each(['finance', 'mis', 'director', 'branch', 'branch_manager', 'warehouse', 'distributor', 'patient', null])('prevents %s from changing the policy', async (role) => {
    const result = await invoke(policyHandler, 'PUT', { lowStockThreshold: 99, expiryWarningDays: 1 }, role);
    expect(result.status).toBe(role === null ? 401 : 403);
    expect(await getStockAlertPolicy()).toEqual(defaults);
  });
  it.each([
  {}, { lowStockThreshold: 0, expiryWarningDays: 90 },
  { lowStockThreshold: 1.5, expiryWarningDays: 90 },
  { lowStockThreshold: '10', expiryWarningDays: 90 },
  { lowStockThreshold: 10, expiryWarningDays: -1 },
  { lowStockThreshold: 10, expiryWarningDays: 3651 },
  { lowStockThreshold: 2147483648, expiryWarningDays: 90 },
  { ...defaults, auto_receive_enabled: true }]
  )('rejects invalid policy %j without persisting it', async (body) => {
    expect((await invoke(policyHandler, 'PUT', body)).status).toBe(422);
    expect(await getStockAlertPolicy()).toEqual(defaults);
  });
  it('updates counts, GM alerts, low-stock/expiry reports and dispatch warnings without changing physical stock', async () => {
    const before = (await query('SELECT id,quantity,status FROM branch_inventory_batches ORDER BY id')).rows;
    const warehousesBefore = (await query('SELECT id,remaining_quantity,status FROM stock_batches ORDER BY id')).rows;
    const movementsBefore = (await query('SELECT COUNT(*)::integer AS count FROM stock_movements')).rows;
    const initial = await getLocationStockSummary('branch', 'townshop');
    expect(initial.lowStockCount).toBe(1);
    expect(initial.expiringCount).toBe(3);
    expect((await getCompanyStockSummary()).lowStockCount).toBe(1);
    const initialAlerts = await getStockAlerts();
    expect(initialAlerts.lowStock.filter((r) => products.includes(r.productName))).toHaveLength(1);
    await invoke(policyHandler, 'PUT', { lowStockThreshold: 15, expiryWarningDays: 30 });
    expect((await getLocationStockSummary('branch', 'townshop')).lowStockCount).toBe(2);
    expect((await getLocationStockSummary('branch', 'townshop')).expiringCount).toBe(0);
    expect((await getCompanyStockSummary()).lowStockCount).toBe(2);
    expect((await getCompanyStockSummary()).expiringCount).toBe(0);
    expect((await getStockAlerts()).expiring).toHaveLength(0);
    const low = await invoke(lowStockHandler);
    expect(low.status).toBe(200);
    expect(low.body.threshold).toBe(15);
    const expiry = await invoke(expiryHandler);
    expect(expiry.body.days).toBe(30);
    expect(expiry.body.summary.expiringSoonCount).toBe(0);
    const priority = await invoke(priorityHandler);
    expect(priority.body.warningDays).toBe(30);
    expect(priority.body.nearExpiry).toBe(0);
    const branches = await invoke(branchHandler);
    const town = branches.body.branches.find((r) => r.branch_id === 'townshop');
    expect(branches.status).toBe(200);
    expect(town.low_stock_count).toBe(2);
    expect(town.expiring_qty).toBe(0);
    expect(branches.body.alertPolicy.expiryWarningDays).toBe(30);
    const gm = await invoke(gmAlertsHandler);
    expect(gm.body.thresholdDays).toBe(30);
    expect(gm.body.expiring).toHaveLength(0);
    expect((await invoke(gmAlertsHandler, 'GET', undefined, 'gm', '', { thresholdDays: '30oops' })).status).toBe(422);
    expect((await invoke(lowStockHandler, 'GET', undefined, 'stock', '?threshold=10oops')).status).toBe(422);
    expect((await query('SELECT id,quantity,status FROM branch_inventory_batches ORDER BY id')).rows).toEqual(before);
    expect((await query('SELECT id,remaining_quantity,status FROM stock_batches ORDER BY id')).rows).toEqual(warehousesBefore);
    expect((await query('SELECT COUNT(*)::integer AS count FROM stock_movements')).rows).toEqual(movementsBefore);
  });
  it('supports zero-day expiry windows and refuses corrupt saved policy rather than silently guessing', async () => {
    await invoke(policyHandler, 'PUT', { lowStockThreshold: 1, expiryWarningDays: 0 });
    expect((await getStockAlerts()).thresholdDays).toBe(0);
    await query("UPDATE system_settings SET value='{}' WHERE key='stock_alert_policy'");
    expect((await invoke(policyHandler)).status).toBe(500);
  });
  it('includes the exact expiry boundary and expired stock, but not a day beyond it', async () => {
    await invoke(policyHandler, 'PUT', { lowStockThreshold: 10, expiryWarningDays: 45 });
    expect((await getStockAlerts()).expiring).toHaveLength(3);
    expect((await invoke(expiryHandler)).body.summary.expiringSoonCount).toBe(6);
    expect((await invoke(priorityHandler)).body.nearExpiry).toBe(3);
    await invoke(policyHandler, 'PUT', { lowStockThreshold: 10, expiryWarningDays: 44 });
    expect((await getStockAlerts()).expiring).toHaveLength(0);
    await query('UPDATE inventory_balances SET expiry_date=CURRENT_DATE-1 WHERE product_name=$1', [products[1]]);
    expect((await getStockAlerts()).expiring).toHaveLength(1);
    await query('UPDATE inventory_balances SET expiry_date=CURRENT_DATE+45 WHERE product_name=$1', [products[1]]);
  });
  it.each(['finance', 'finance_manager', 'mis', 'director', 'branch_manager', 'warehouse_manager'])('lets %s read but not edit warnings', async (role) => {
    const result = await invoke(policyHandler, 'GET', undefined, role);
    expect(result.status).toBe(200);
    expect(result.body.policy).toEqual(defaults);
    expect(result.body.canEdit).toBe(false);
  });
});
