import { ownedStatement as __ownedStatement } from "./helpers/owned-statement.js";import { query as __owned_app_query } from "../api/db.js"; // @vitest-environment node
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { withTransaction, withRequestTransaction, deferUntilCommit } from '../api/db.js';import { query } from "./helpers/owned-raw-database.js";
import { atomicStockRequest } from '../api/_lib/atomicStockRequest.js';
import transfers from '../api/stock/transfers.js';
import barcodeReceipt from '../api/stock/dispatch/confirm-receipt.js';
import requestReceipt from '../api/stock/receive-request.js';
import refunds from '../api/stock/refund-requests.js';
import reconciliation from '../api/admin/stock-reconciliation.js';
import { deductStock } from '../api/branch/campaign-sale.js';
import { recomputeInventoryBalance } from '../api/services/stockEngine.js';
import stockMovements from '../api/stock-movements.js';

const branch = 'test_stock_safety_branch';
const product = 'TEST_STOCK_SAFETY_PRODUCT';
const transferId = 'TEST-SAFETY-TRANSFER';
const refundId = 'TEST-SAFETY-REFUND';
const refundSaleId = 'TEST-SAFETY-REFUND-SALE';
const batch = 'TEST-SAFETY-BATCH';
const expiry = '2030-12-31';
function invoke(handler, method, body, path = '/api/stock/transfers') {
  const captured = { status: 200 };
  const res = {
    setHeader() {},
    status(status) {captured.status = status;return this;},
    json(body) {captured.body = body;return this;},
    end(body) {captured.body = body;return this;},
    send(body) {captured.body = body;return this;}
  };
  return handler({ method, body, url: path, headers: { host: 'localhost' }, user: { id: 'test-safety-admin', role: 'admin', fullName: 'Test Safety Admin' } }, res).then(() => captured);
}
async function cleanup() {
  await query('DELETE FROM stock_batches WHERE description=$1', [product]);
  await query("DELETE FROM notifications WHERE id LIKE 'NOTIF-RCPT-%' AND message LIKE $1", [`%${transferId}%`]);
  await query('DELETE FROM branch_refund_requests WHERE id=$1', [refundId]);
  await query('DELETE FROM stock_linked_reversals WHERE original_reference=$1', [refundSaleId]);
  await query('DELETE FROM stock_segregated_batches WHERE operation_id=$1', [refundId]);
  await query('DELETE FROM stock_sale_allocations WHERE movement_id=$1', [refundSaleId]);
  await query('DELETE FROM branch_activity_transactions WHERE branch_id=$1', [branch]);
  await query('DELETE FROM branch_inventory_movements WHERE branch_id=$1', [branch]);
  await query('DELETE FROM branch_inventory_batches WHERE branch_id=$1', [branch]);
  await query('DELETE FROM inventory_balances WHERE product_name=$1', [product]);
  await query('DELETE FROM stock_movements WHERE product_name=$1', [product]);
  await query('DELETE FROM dispatch_notes WHERE transfer_id=$1', [transferId]);
  await query('DELETE FROM stock_transfer_items WHERE product_name=$1', [product]);
  await query("DELETE FROM stock_transfers WHERE id=ANY($1::text[])", [[transferId, 'TEST-SAFETY-MISMATCHED-LOT']]);
  await query("DELETE FROM stock_request_items WHERE request_id='TEST-SAFETY-REQUEST'");
  await query("DELETE FROM stock_requests WHERE id='TEST-SAFETY-REQUEST'");
}
describe.sequential('stock safety: atomic operations, partial receipt and segregated returns', () => {
  beforeAll(async () => {
    await cleanup();
    await query(`INSERT INTO stock_requests (id,requesting_branch,status,dispatch_warehouse,items)
      VALUES ('TEST-SAFETY-REQUEST',$1,'dispatched','windhoek_warehouse','[]'::jsonb)`, [branch]);
    await query(`INSERT INTO stock_transfers (id,request_id,from_warehouse,to_branch,status,gm_approved_by,created_at,updated_at)
      VALUES ($1,'TEST-SAFETY-REQUEST','windhoek_warehouse',$2,'dispatched','Test GM',NOW(),NOW())`, [transferId, branch]);
    await query(`INSERT INTO stock_transfer_items (transfer_id,product_id,product_name,batch_no,expiry_date,quantity,quantity_approved)
      VALUES ($1,$2,$2,$3,$4,12,12)`, [transferId, product, batch, expiry]);
  });
  afterAll(cleanup);

  it('rolls back standalone helper writes when a legacy handler returns an error', async () => {
    let published = false;
    const handler = atomicStockRequest(async (req, res) => {
      await __owned_app_query(__ownedStatement('owned-tests/atomic-rollback',[product,branch]));
      deferUntilCommit(() => {published = true;});
      res.status(409).json({ success: false, error: 'Injected rejection' });
    });
    expect((await invoke(handler, 'POST', {})).status).toBe(409);
    expect((await query("SELECT 1 FROM stock_movements WHERE id='TEST-SAFETY-ROLLBACK'")).rowCount).toBe(0);
    expect(published).toBe(false);
  });

  it('keeps nested withTransaction and pool helpers on the same connection', async () => {
    await withRequestTransaction(async () => {
      const outer = (await __owned_app_query(__ownedStatement("owned-tests/tests/stock-safety-atomic.spec.js:77:17", []))).rows[0].pid;
      await withTransaction(async (client) => {
        expect((await client.query(__ownedStatement("owned-tests/tests/stock-safety-atomic.spec.js:79:18", []))).rows[0].pid).toBe(outer);
        expect((await __owned_app_query(__ownedStatement("owned-tests/tests/stock-safety-atomic.spec.js:80:19", []))).rows[0].pid).toBe(outer);
      });
    });
  });

  it('records an actual partial receipt without replacing dispatched items', async () => {
    const result = await invoke(transfers, 'PATCH', {
      id: transferId, status: 'partially_received',
      items: [{ productName: product, batchNo: batch, expiryDate: expiry, quantityReceived: 5, quantity: 12 }]
    });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect((await query('SELECT status FROM stock_transfers WHERE id=$1', [transferId])).rows[0].status).toBe('partially_received');
    expect(Number((await query('SELECT quantity_received FROM stock_transfer_items WHERE transfer_id=$1', [transferId])).rows[0].quantity_received)).toBe(5);
  });

  it('rejects replay of the same cumulative partial receipt', async () => {
    const result = await invoke(transfers, 'PATCH', {
      id: transferId, status: 'partially_received',
      items: [{ productName: product, batchNo: batch, expiryDate: expiry, quantityReceived: 5, quantity: 12 }]
    });
    expect(result.status).toBe(409);
  });

  it('serializes simultaneous regular and barcode completion without double credit', async () => {
    const results = await Promise.all([
    invoke(transfers, 'PATCH', { id: transferId, status: 'delivered' }),
    invoke(barcodeReceipt, 'POST', {
      dispatchNoteId: transferId, branchId: branch, receiptId: 'TEST-SAFETY-REMAINDER',
      items: [{ productName: product, batchNo: batch, expiryDate: expiry, qtyReceived: 7 }]
    }, '/api/stock/dispatch/confirm-receipt'),
    invoke(requestReceipt, 'POST', {
      requestId: 'TEST-SAFETY-REQUEST', branchId: branch, warehouseSource: 'windhoek_warehouse',
      items: [{ productName: product, batchNo: batch, expiryDate: expiry, quantity: 7 }]
    }, '/api/stock/receive-request')]
    );
    expect(results.map((result) => result.status).sort(), JSON.stringify(results)).toEqual([200, 409, 409]);
    const stock = await query('SELECT SUM(quantity) AS qty FROM branch_inventory_batches WHERE branch_id=$1 AND product_name=$2', [branch, product]);
    expect(Number(stock.rows[0].qty)).toBe(12);
    const history = await query("SELECT SUM(quantity) AS qty FROM stock_movements WHERE reference_id=$1 AND movement_type IN ('transfer_in','transit_receipt','branch_receipt')", [transferId]);
    expect(Number(history.rows[0].qty)).toBe(12);
    expect((await query("SELECT 1 FROM stock_movements WHERE reference_id=$1 AND movement_type='branch_receipt'", [transferId])).rowCount).toBe(0);
  });

  it('segregates a damaged refund and prevents a second approval', async () => {
    // A historical, depleted sale lot supplies evidence without creating new
    // available stock. Current approvals require this link and a confirmed return.
    const soldBatchId = 'TEST-SAFETY-SOLD-BATCH';
    const saleSnapshot = {
      id: soldBatchId, batch_type: 'branch', location: branch,
      product_name: product, batch_no: batch, expiry_date: expiry,
      quantity: 3, revenue_unit: 10, financial_dp_unit: 10, unit_dp: 10, unit_cost: null,
      cost_layers: [{ quantity: 3, source: { id: null, cif_unit_cost: null, dpc_unit_value: 10 } }]
    };
    await query(`INSERT INTO stock_movements
      (id,product_name,batch_no,expiry_date,quantity,movement_type,source_location,source_location_type,reference_id,status,unit_dp)
      VALUES ($1,$2,$3,$4,3,'walk_in_member_sale',$5,'branch',$1,'posted',10)`,
    [refundSaleId, product, batch, expiry, branch]);
    await query(`INSERT INTO stock_sale_allocations
      (movement_id,sale_reference,branch_batch_id,branch_id,product_name,batch_no,expiry_date,quantity,snapshot)
      VALUES ($1,$1,$2,$3,$4,$5,$6,3,$7)`,
    [refundSaleId, soldBatchId, branch, product, batch, expiry, JSON.stringify(saleSnapshot)]);
    await query(`INSERT INTO branch_refund_requests
      (id,branch_id,product_name,batch_no,quantity,unit_price,refund_amount,reason,status,
       sale_reference,allocation_id,physical_return_confirmed,original_snapshot)
      VALUES ($1,$2,$3,$4,3,10,30,'Damaged customer return','pending',$5::text,$5::text,true,$6)`,
    [refundId, branch, product, batch, refundSaleId, JSON.stringify(saleSnapshot)]);
    const approval = {
      id: refundId, action: 'approve', return_condition: 'damaged',
      physical_return_confirmed: true, inspection_reason: 'Original returned lot inspected and damaged'
    };
    const result = await invoke(refunds, 'PATCH', approval, '/api/stock/refund-requests');
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.success).toBe(true);
    const approved = (await query('SELECT status,stock_disposition FROM branch_refund_requests WHERE id=$1', [refundId])).rows[0];
    expect(approved).toEqual({ status: 'approved', stock_disposition: 'segregated' });
    expect(Number((await query('SELECT SUM(quantity) AS qty FROM branch_inventory_batches WHERE branch_id=$1', [branch])).rows[0].qty)).toBe(12);
    const hold = (await query("SELECT destination_location_type,quantity FROM stock_movements WHERE reference_id=$1 AND movement_type='refund_return'", [refundId])).rows[0];
    expect(hold.destination_location_type).toBe('quarantine');
    expect(Number(hold.quantity)).toBe(3);
    expect((await invoke(refunds, 'PATCH', { ...approval, return_condition: 'saleable' })).status).toBe(409);
    expect(Number((await query('SELECT SUM(quantity) AS qty FROM branch_inventory_batches WHERE branch_id=$1', [branch])).rows[0].qty)).toBe(12);
    expect((await query("SELECT 1 FROM stock_movements WHERE reference_id=$1 AND movement_type='refund_return'", [refundId])).rowCount).toBe(1);
  });

  it('does not create physical campaign stock from a cached balance', async () => {
    await query(`INSERT INTO stock_movements (id,product_name,quantity,movement_type,source_location,source_location_type,destination_location,destination_location_type,status)
      VALUES ('TEST-SAFETY-STALE',$1,10,'received','supplier','external',$2,'branch','posted')`, [product, `${branch}_empty`]);
    await recomputeInventoryBalance({ locationType: 'branch', locationId: `${branch}_empty`, productName: product, batchNo: '' });
    const projection = (await query('SELECT closing_qty,inward_qty,available_qty FROM inventory_balances WHERE location_id=$1 AND product_name=$2', [`${branch}_empty`, product])).rows[0];
    expect(Number(projection.inward_qty)).toBe(10);
    expect(Number(projection.closing_qty)).toBe(0);
    expect(Number(projection.available_qty)).toBe(0);
    const result = await withTransaction((client) => deductStock(client, `${branch}_empty`, product, 2, 'campaign_sale', 'Safety regression', 'TEST-SAFETY-CAMPAIGN', 10, 'test'));
    expect(result.short).toBe(2);
    expect((await query('SELECT 1 FROM branch_inventory_batches WHERE branch_id=$1', [`${branch}_empty`])).rowCount).toBe(0);
  });

  it('reconciliation SQL executes and includes the isolated branch', async () => {
    const result = await invoke(reconciliation, 'GET', null, '/api/admin/stock-reconciliation');
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.branches.some((row) => row.branchId === branch)).toBe(true);
  });
  it.each(['2020-01-01', '2099-01-01'])('consumes received cost layers without creating warehouse stock on a %s write-off', async (writeoffExpiry) => {
    const id = `TEST-SAFETY-COST-WRITEOFF-${writeoffExpiry}`,lot = `COST-WRITEOFF-${writeoffExpiry}`;
    const source = { id: 'TEST-SAFETY-COST-SOURCE', cif_unit_cost: 2, dpc_unit_value: 7 };
    await query(`INSERT INTO branch_inventory_batches
      (id,branch_id,product_name,batch_no,expiry_date,quantity,status,metadata)
      VALUES($1,$2,$3,$4,$6::date,4,'in_stock',$5::jsonb)`,
    [id, branch, product, lot, JSON.stringify({ cost_layers: [{ quantity: 4, source }] }), writeoffExpiry]);
    await query(`INSERT INTO stock_movements
      (id,product_name,batch_no,expiry_date,quantity,movement_type,source_location,source_location_type,status,write_off_reason)
      VALUES($1,$2,$3,$5::date,1,'write_off',$4,'branch','pending_approval','damaged')`,
    [id, product, lot, branch, writeoffExpiry]);
    const approved = await invoke(stockMovements, 'PUT', { id, action: 'approve' }, '/api/stock-movements');
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const row = (await query('SELECT quantity,metadata FROM branch_inventory_batches WHERE id=$1', [id])).rows[0];
    expect(Number(row.quantity)).toBe(3);
    expect(row.metadata.cost_layers).toEqual([{ quantity: 3, source }]);
    const balance = (await query(`SELECT closing_qty,stock_value_cif,stock_value_dp FROM inventory_balances
      WHERE location_type='branch' AND location_id=$1 AND product_name=$2 AND batch_no=$3`,
    [branch, product, lot])).rows[0];
    expect(Number(balance.closing_qty)).toBe(3);
    expect(Number(balance.stock_value_cif)).toBe(6);
    expect(Number(balance.stock_value_dp)).toBe(21);
    expect((await query('SELECT 1 FROM stock_batches WHERE description=$1 AND batch_no=$2', [product, lot])).rowCount).toBe(0);
    expect((await query('SELECT 1 FROM warehouse_inventory WHERE product_name=$1 AND batch_no=$2', [product, lot])).rowCount).toBe(0);
    expect((await query('SELECT disposal_status FROM stock_movements WHERE id=$1', [id])).rows[0].disposal_status).toBe('dispose_off');
  });
  it('does not reserve a different physical lot even when the requested lot has a cached balance', async () => {
    const id = 'TEST-SAFETY-MISMATCHED-LOT';
    await query(`INSERT INTO stock_transfers(id,from_warehouse,to_branch,status,created_at,updated_at)
      VALUES($1,'windhoek_warehouse',$2,'pending',NOW(),NOW())`, [id, branch]);
    await query(`INSERT INTO stock_transfer_items(transfer_id,product_id,product_name,batch_no,expiry_date,quantity,quantity_approved)
      VALUES($1,$2,$2,'EXPECTED-LOT','2030-12-31',8,8)`, [id, product]);
    await query(`INSERT INTO stock_batches(id,description,location,batch_no,expiry_date,quantity,remaining_quantity,dispatched_quantity,status)
      VALUES('TEST-SAFETY-OTHER-SB',$1,'windhoek_warehouse','OTHER-LOT','2030-12-31',20,20,0,'available')`, [product]);
    await query(`INSERT INTO stock_movements(id,product_name,batch_no,quantity,movement_type,source_location,source_location_type,destination_location,destination_location_type,status)
      VALUES('TEST-SAFETY-CACHE-LOT',$1,'EXPECTED-LOT',8,'received','supplier','external','windhoek_warehouse','warehouse','posted')`, [product]);
    await recomputeInventoryBalance({ locationType: 'warehouse', locationId: 'windhoek_warehouse', productName: product, batchNo: 'EXPECTED-LOT' });
    const result = await invoke(transfers, 'PATCH', { id, status: 'approved' });
    expect(result.status, JSON.stringify(result.body)).toBe(422);
    expect((await query('SELECT status FROM stock_transfers WHERE id=$1', [id])).rows[0].status).toBe('pending');
    expect(Number((await query("SELECT remaining_quantity FROM stock_batches WHERE id='TEST-SAFETY-OTHER-SB'")).rows[0].remaining_quantity)).toBe(20);
    expect((await query("SELECT 1 FROM stock_movements WHERE reference_id=$1 AND movement_type='reserved'", [id])).rowCount).toBe(0);
  });
});
