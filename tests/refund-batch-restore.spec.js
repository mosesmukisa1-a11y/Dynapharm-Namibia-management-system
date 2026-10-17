// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';import {
  query } from "./helpers/owned-raw-database.js";
import { reversalSchema } from '../api/services/linkedReversals.js';
import { saleAllocationSchema } from '../api/services/stockSaleAllocations.js';
import submitRefund from '../api/branch/refund-requests.js';
import approveRefund from '../api/stock/refund-requests.js';

const prefix = `TEST-RFND-${randomUUID().slice(0, 8)}`;
const branch = `${prefix.toLowerCase()}_branch`,product = prefix;
const branchUser = { id: prefix, role: 'dispenser', branch };
const stockUser = { id: prefix, role: 'stock' };
async function invoke(handler, body, user, method) {
  const result = { status: 200 };
  const res = { setHeader() {}, status(code) {result.status = code;return this;}, json(body) {result.body = body;return this;}, end() {} };
  await handler({ method, body, user, url: '/api/test', headers: { host: 'localhost' } }, res);
  return result;
}
async function seed(scenario, expiryDate, keepBatch = true) {
  const id = `${prefix}-${scenario}`;
  const lot = `LOT-${scenario}`;
  await query(`INSERT INTO stock_movements
    (id,product_name,batch_no,expiry_date,quantity,movement_type,source_location,source_location_type,reference_id,status,unit_dp)
    VALUES ($1,$2,$3,$4,5,'walk_in_member_sale',$5,'branch',$1,'posted',10)`, [id, product, lot, expiryDate, branch]);
  const snapshot = { id: `${id}-batch`, batch_type: 'branch', location: branch, product_name: product, batch_no: lot,
    expiry_date: expiryDate, quantity: 5, revenue_unit: 10, financial_dp_unit: 10, unit_dp: 10, unit_cost: null,
    cost_layers: [{ quantity: 5, source: { id: null, dpc_unit_value: 10, cif_unit_cost: null } }] };
  await query(`INSERT INTO stock_sale_allocations
    (movement_id,sale_reference,branch_batch_id,branch_id,product_name,batch_no,expiry_date,quantity,snapshot)
    VALUES ($1,$1,$2,$3,$4,$5,$6,5,$7)`, [id, `${id}-batch`, branch, product, lot, expiryDate, JSON.stringify(snapshot)]);
  if (keepBatch) await query(`INSERT INTO branch_inventory_batches
    (id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,status)
    VALUES ($1,$2,$3,$4,$5,20,10,'in_stock')`, [`${id}-batch`, branch, product, lot, expiryDate]);
  const submitted = await invoke(submitRefund, { allocation_id: id, quantity: 5, reason: 'Returned unused',
    physical_return_confirmed: true, operation_key: id }, branchUser, 'POST');
  expect(submitted.status, JSON.stringify(submitted)).toBe(200);
  return { id, batch: `${id}-batch`, refundId: submitted.body.id, lot };
}
const approve = (id, condition = 'saleable') => invoke(approveRefund, { id, action: 'approve',
  return_condition: condition, physical_return_confirmed: true, inspection_reason: 'Inspected original returned lot' }, stockUser, 'PATCH');
async function clean() {
  await query('DELETE FROM branch_refund_requests WHERE branch_id=$1', [branch]);
  await query('DELETE FROM stock_linked_reversals WHERE original_reference LIKE $1', [`${prefix}%`]);
  await query("DELETE FROM stock_segregated_batches WHERE snapshot->>'product_name'=$1", [product]);
  await query('DELETE FROM branch_activity_transactions WHERE branch_id=$1', [branch]);
  await query('DELETE FROM branch_inventory_movements WHERE product_name=$1', [product]);
  await query('DELETE FROM branch_inventory_batches WHERE product_name=$1', [product]);
  await query('DELETE FROM stock_movements WHERE product_name=$1', [product]);
  await query('DELETE FROM inventory_balances WHERE product_name=$1', [product]);
}
describe.sequential('linked refunds retain original expiry evidence', () => {
  beforeAll(async () => {await query(saleAllocationSchema);await query(reversalSchema);});
  afterAll(clean);
  it('restores a saleable return only into its exact original physical lot', async () => {
    const fixture = await seed('existing', '2031-06-30');
    expect((await approve(fixture.refundId)).status).toBe(200);
    const rows = (await query('SELECT * FROM branch_inventory_batches WHERE product_name=$1 AND batch_no=$2', [product, fixture.lot])).rows;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].quantity)).toBe(25);
    expect(rows[0].expiry_date.toISOString().slice(0, 10)).toBe('2031-06-30');
  });
  it('quarantines a returned depleted lot without silently recreating available stock', async () => {
    const fixture = await seed('deleted', '2031-07-31', false);
    expect((await approve(fixture.refundId)).status).toBe(409);
    expect((await approve(fixture.refundId, 'quarantine')).status).toBe(200);
    expect((await query('SELECT id FROM branch_inventory_batches WHERE id=$1', [fixture.batch])).rows).toHaveLength(0);
    const held = (await query('SELECT * FROM stock_segregated_batches WHERE operation_id=$1', [fixture.refundId])).rows[0];
    expect(held.snapshot.expiry_date).toBe('2031-07-31');
    expect(Number(held.quantity)).toBe(5);
    expect(held.snapshot.release_without_source).toBe(true);
  });
  it('retains an explicitly recorded missing expiry without inventing another lot', async () => {
    const fixture = await seed('missing-expiry', null);
    expect((await approve(fixture.refundId)).status).toBe(200);
    const row = (await query('SELECT * FROM branch_inventory_batches WHERE id=$1', [fixture.batch])).rows[0];
    expect(row.expiry_date).toBeNull();
    expect(Number(row.quantity)).toBe(25);
  });
});
