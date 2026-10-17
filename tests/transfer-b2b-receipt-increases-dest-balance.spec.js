// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';import {
  query } from "./helpers/owned-raw-database.js";
import handler from '../api/stock/transfers.js';
import { receiptFixtures, invokeReceipt, destinationTotals, expiry } from './helpers/receiptStockFixtures.js';
const fixture = receiptFixtures('B2B-RCPT');
const receive = (f, status, cumulative) => invokeReceipt(handler, 'PATCH', `/api/stock/transfers?id=${f.id}`,
{ id: f.id, status, items: [{ product_name: f.product, batch_no: f.lot, expiry_date: expiry, quantity_received: cumulative }] },
{ sub: `${f.id}-recipient`, role: 'branch', branch: f.dest });
async function assertReceived(f, total) {
  expect(await destinationTotals(f)).toEqual({ physical: total, projected: total });
  const receipts = (await query(`SELECT COALESCE(SUM(quantity),0) AS qty FROM stock_movements
    WHERE reference_id=$1 AND movement_type='transfer_in' AND status='posted' AND destination_location=$2
      AND product_name=$3 AND batch_no=$4 AND expiry_date=$5`, [f.id, f.dest, f.product, f.lot, expiry])).rows[0];
  expect(Number(receipts.qty)).toBe(total);
  const item = (await query('SELECT quantity_received FROM stock_transfer_items WHERE transfer_id=$1', [f.id])).rows[0];
  expect(Number(item.quantity_received)).toBe(total);
  const source = (await query('SELECT quantity FROM branch_inventory_batches WHERE id=$1', [f.sourceId])).rows[0];
  expect(Number(source.quantity)).toBe(30 - f.qty); // receiving must not deduct the source twice
}
describe.sequential('isolated branch-to-branch receipt evidence and stock balances', () => {
  beforeAll(fixture.initialize);afterAll(fixture.clean);
  it('receives the full original dispatch and projects destination stock after background updates settle', async () => {
    const f = await fixture.seedTransfer('full');
    expect(await destinationTotals(f)).toEqual({ physical: 0, projected: 0 });
    const result = await receive(f, 'delivered', 12);
    expect(result.status, result.body?.error).toBe(200);
    expect(result.body.success).toBe(true);
    await assertReceived(f, 12);
  });
  it('receives explicit cumulative partials 5 then 8 then 12, not their sum, and blocks repeated/regressive receipt', async () => {
    const f = await fixture.seedTransfer('partial');
    for (const total of [5, 8]) {
      const result = await receive(f, 'partially_received', total);
      expect(result.status, result.body?.error).toBe(200);
      await assertReceived(f, total);
    }
    for (const [total, status] of [[8, 409], [7, 400]]) {
      expect((await receive(f, 'partially_received', total)).status).toBe(status);
      await assertReceived(f, 8);
    }
    expect((await receive(f, 'delivered', 12)).status).toBe(200);
    await assertReceived(f, 12);
  });
  it('rejects duplicate full receipts with 409 and leaves physical, ledger and projection quantities unchanged', async () => {
    const f = await fixture.seedTransfer('duplicate');
    expect((await receive(f, 'delivered', 12)).status).toBe(200);
    expect((await receive(f, 'delivered', 12)).status).toBe(409);
    await assertReceived(f, 12);
  });
});
