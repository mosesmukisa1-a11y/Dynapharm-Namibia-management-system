// @vitest-environment node
import { beforeAll, it, expect } from 'vitest';import {
  query } from "./helpers/owned-raw-database.js";
import report from '../api/mis/stock-report.js';
import receipts from '../api/mis/receipts.js';
import walkin from '../api/branch/walkin-sales.js';
const product = 'MIS-BOUNDARY-ITEM',actor = { id: 'MIS-TEST-ACTOR', role: 'mis', branch: 'townshop' };
async function invoke(handler, url, user = actor) {
  const response = { statusCode: 200, body: null, setHeader() {}, status(code) {this.statusCode = code;return this;},
    json(body) {this.body = body;return this;}, end() {} };
  await handler({ method: 'GET', url, headers: { host: 'isolated.test' }, user }, response);
  return response;
}
beforeAll(async () => {
  if (process.env.STOCK_AUDIT_ISOLATED !== '1') throw Error('Use the isolated stock audit runner');
  const name = (await query('SELECT current_database() AS name')).rows[0].name;
  if (name !== process.env.STOCK_AUDIT_DATABASE || !/^stock_audit_[a-f0-9]{32}$/.test(name)) throw Error('Disposable database required');
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price)
  VALUES('MIS-BOUNDARY-BATCH','townshop',$1,'MIS-LOT','2035-01-01',8,341)`, [product]);
  const dates = ['2026-10-14T21:59:59.999Z', '2026-10-14T22:00:00Z', '2026-10-15T21:59:59.999Z', '2026-10-15T22:00:00Z', '2026-10-15T11:00:00Z'];
  for (const [i, date] of dates.entries()) await query(`INSERT INTO branch_inventory_movements(id,branch_id,product_name,type,quantity,created_at)
 VALUES($1,'townshop',$2,'walk_in_non_member_sale',$3,$4)`, ['MIS-BOUNDARY-' + i, product, i === 4 ? 2 : 1, date]);
  const items = [{ product_name: product, quantity: 2, unit_price: 443, dpPrice: 999 }];
  await query(`INSERT INTO branch_walkin_sales(id,branch_id,sale_number,status,total,subtotal,sale_date,items,data)
 VALUES('MIS-CANONICAL-SALE','townshop','MIS-RECEIPT-1','completed',886,886,'2026-10-15T11:00:00Z',$1,$2)`,
  [JSON.stringify(items), JSON.stringify({ items, saleNumber: 'MIS-RECEIPT-1' })]);
  await query(`INSERT INTO stock_movements(id,product_name,quantity,movement_type,reference_id,source_location,status,metadata)
 VALUES('MIS-CAPTURED-DP',$1,2,'walk_in_non_member_sale','MIS-CANONICAL-SALE','townshop','posted',$2)`,
  [product, JSON.stringify({ sale_evidence: { version: 1, sale_reference: 'MIS-CANONICAL-SALE', dp_unit_price: 341 } })]);
  const other = [{ product_name: product, quantity: 1, unit_price: 443 }];
  await query(`INSERT INTO branch_walkin_sales(id,branch_id,sale_number,status,total,subtotal,sale_date,items,data)
 VALUES('MIS-UNMIRRORED','swakopmund','MIS-RECEIPT-2','completed',443,443,'2026-10-15T12:00:00Z',$1,$2)`,
  [JSON.stringify(other), JSON.stringify({ items: other })]);
});
it('uses local midnight through next midnight, excludes adjacent days, and does not double-count the walk-in mirror', async () => {
  const result = await invoke(report, '/api/mis/stock-report?start=2026-10-15&end=2026-10-15&branch=townshop');
  expect(result.statusCode).toBe(200);
  expect(result.body.summary.sales).toBe(4);
  expect(result.body.summary.closing).toBe(8);
  expect(result.body.period.timezone).toBe('Africa/Windhoek');
  const all = await invoke(report, '/api/mis/stock-report?start=2026-10-15&end=2026-10-15');
  expect(all.body.summary.sales).toBe(5);
  expect(all.body.branches.flatMap((b) => b.products).some((p) => p.product_name === 'Unknown')).toBe(false);
});
it('finds the displayed receipt for a same-day range and an exact business date', async () => {
  for (const filter of ['start=2026-10-15&end=2026-10-15', 'date=2026-10-15']) {
    const result = await invoke(receipts, '/api/mis/receipts?' + filter + '&branch=townshop&q=MIS-RECEIPT-1');
    expect(result.statusCode).toBe(200);expect(result.body.receipts).toHaveLength(1);
    expect(result.body.receipts[0].receiptNumber).toBe('MIS-RECEIPT-1');
    expect(result.body.receipts[0].total).toBe(886);
    expect(result.body.receipts[0].amountBasis).toBe('original_customer_charge');
    expect(result.body.receipts[0].items[0]).toMatchObject({ productName: product, quantity: 2, unitPrice: 443 });
  }
});
it('rejects anonymous and branch access, and invalid calendar ranges', async () => {
  for (const handler of [report, receipts]) {
    expect((await invoke(handler, '/api/mis/test', null)).statusCode).toBe(401);
    expect((await invoke(handler, '/api/mis/test', { role: 'branch_manager', branch: 'townshop' })).statusCode).toBe(403);
    expect((await invoke(handler, '/api/mis/test?start=2026-02-30&end=2026-03-01')).statusCode).toBe(422);
  }
});
it('keeps prescription DP separate from original customer receipts', async () => {
  await query(`INSERT INTO branch_activity_transactions(id,branch_id,activity_type,workflow_source,
   service_date,client_name,product_total_dp,form_reference_id)
   VALUES('MIS-TEST-RX-BASIS','townshop','prescription_dispensing','branch_portal','2026-10-15',
     'Synthetic RX basis',25,'MIS-TEST-RX-BASIS')`);
  try {
    const result = await invoke(receipts, '/api/mis/receipts?date=2026-10-15&branch=townshop');
    expect(result.statusCode).toBe(200);
    expect(result.body.totals.customerChargedAmount).toBe(886);
    expect(result.body.totals.prescriptionDPAmount).toBe(25);
    expect(result.body.totals.mixedBases).toBe(true);
    expect(result.body.totals.totalAmount).toBeNull();
    expect(result.body.receipts.find((r) => r.source === 'prescription')).toMatchObject({ chargedAmount: null, amountBasis: 'prescription_dp_only', total: 25 });
  } finally {await query("DELETE FROM branch_activity_transactions WHERE id='MIS-TEST-RX-BASIS'");}
});
it('reloads the invoice DP from the real typed sale movement without rewriting raw history or exposing CIF', async () => {
  const result = await invoke(walkin, '/api/branch/walkin-sales?id=MIS-CANONICAL-SALE', { id: 'SYNTHETIC-ADMIN', role: 'admin' });
  expect(result.statusCode).toBe(200);
  expect(result.body.sale.products[0].dpPrice).toBe(341);
  expect(result.body.sale.total).toBe(886);
  expect(result.body.sale.dpEvidence).toBe('captured_sale_dp');
  const raw = (await query("SELECT items FROM branch_walkin_sales WHERE id='MIS-CANONICAL-SALE'")).rows[0];
  expect(raw.items[0].dpPrice).toBe(999);
  expect(JSON.stringify(result.body).toLowerCase()).not.toContain('cif');
});
