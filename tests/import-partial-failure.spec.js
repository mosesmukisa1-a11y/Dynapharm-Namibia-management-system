// @vitest-environment node
// The approved contract is now atomic shipment receipt, not partial commit.
import { beforeAll, afterAll, describe, expect, it } from 'vitest';import {
  query } from "./helpers/owned-raw-database.js";
import handler from '../api/stock/import/receive.js';

const prefix = 'TEST_ATOMIC_IMPORT';
async function cleanup() {
  await query('DELETE FROM stock_batches WHERE description LIKE $1', [`${prefix}%`]);
  await query('DELETE FROM stock_movements WHERE product_name LIKE $1', [`${prefix}%`]);
  await query('DELETE FROM inventory_balances WHERE product_name LIKE $1', [`${prefix}%`]);
  await query('DELETE FROM supplier_imports WHERE product_name LIKE $1', [`${prefix}%`]);
  await query("DELETE FROM stock_import_receipts WHERE receipt_key='TEST-ATOMIC-IMPORT-REF'");
}
function receive(items) {
  const captured = { status: 200 };
  const res = {
    setHeader() {},
    status(code) {captured.status = code;return this;},
    json(body) {captured.body = body;return this;},
    end() {return this;}
  };
  const req = {
    method: 'POST', headers: {}, body: { referenceId: 'TEST-ATOMIC-IMPORT-REF', items },
    user: { id: 'test-stock-admin', role: 'admin', fullName: 'Test Stock Admin' }
  };
  return handler(req, res).then(() => captured);
}
const item = (suffix) => ({ productName: `${prefix}_${suffix}`, batchNo: `BATCH-${suffix}`, expiryDate: '2030-12-31', quantity: 10, unitDP: 4, unitCIF: 2 });
describe.sequential('import receiving is atomic across all submitted lines', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  it('rolls back earlier ledger and physical rows when a later batch insert fails', async () => {
    const result = await receive([item('A'), { ...item('B'), productId: 'X'.repeat(500) }]);
    expect(result.status).toBe(500);
    expect((await query('SELECT 1 FROM stock_movements WHERE product_name LIKE $1', [`${prefix}%`])).rowCount).toBe(0);
    expect((await query('SELECT 1 FROM stock_batches WHERE description LIKE $1', [`${prefix}%`])).rowCount).toBe(0);
    expect((await query('SELECT 1 FROM inventory_balances WHERE product_name LIKE $1', [`${prefix}%`])).rowCount).toBe(0);
  });
  it('rejects non-finite quantities without saving any line', async () => {
    const result = await receive([item('A'), { ...item('B'), quantity: 'not-a-number' }]);
    expect(result.status).toBe(422);
    expect((await query('SELECT 1 FROM stock_movements WHERE product_name LIKE $1', [`${prefix}%`])).rowCount).toBe(0);
  });
  it('commits both physical batches and ledger entries on a valid receipt', async () => {
    const result = await receive([item('A'), item('B')]);
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect((await query('SELECT 1 FROM stock_batches WHERE description LIKE $1', [`${prefix}%`])).rowCount).toBe(2);
    expect((await query('SELECT 1 FROM stock_movements WHERE product_name LIKE $1', [`${prefix}%`])).rowCount).toBe(2);
  });
});
