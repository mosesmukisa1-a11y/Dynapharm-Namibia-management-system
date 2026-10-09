// @vitest-environment node
import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {query} from '../api/db.js';
import handler from '../api/stock/receive-request.js';
import journalHandler from '../api/stock-movements.js';
import {receiptFixtures,invokeReceipt,destinationTotals,expiry} from './helpers/receiptStockFixtures.js';
const fixture=receiptFixtures('REQ-RCPT');
// A standalone received journal is not physical custody evidence. Exercise the
// actual original-dispatch-linked request receipt, then its physical projection.
const receive=f=>invokeReceipt(handler,'POST','/api/stock/receive-request',{
  requestId:f.id,branchId:f.dest,status:'received',
  items:[{productName:f.product,batchNo:f.lot,expiryDate:expiry,quantityReceived:f.qty}],
},fixture.stockUser);
async function assertEvidence(f){
  expect(await destinationTotals(f)).toEqual({physical:f.qty,projected:f.qty});
  const received=(await query(`SELECT COUNT(*) AS events,COALESCE(SUM(quantity),0) AS qty
    FROM stock_movements WHERE reference_id=$1 AND movement_type='transfer_in' AND status='posted'
      AND destination_location=$2 AND product_name=$3 AND batch_no=$4 AND expiry_date=$5`,
    [f.id,f.dest,f.product,f.lot,expiry])).rows[0];
  expect(Number(received.events)).toBe(1);expect(Number(received.qty)).toBe(f.qty);
  expect((await query('SELECT status FROM stock_requests WHERE id=$1',[f.id])).rows[0].status).toBe('received');
  expect(Number((await query('SELECT remaining_quantity FROM stock_batches WHERE id=$1',[f.sourceId])).rows[0].remaining_quantity)).toBe(30-f.qty);
}
describe.sequential('isolated original request/dispatch receipts converge to branch balances',()=>{
  beforeAll(fixture.initialize);afterAll(fixture.clean);
  it('returns 200 and the confirmed fixture-specific physical quantity is projected after background updates settle',async()=>{
    const f=await fixture.seedRequest('full',20);
    expect((await destinationTotals(f)).projected).toBe(0);
    const result=await receive(f);
    expect(result.status,result.body?.error).toBe(200);
    expect(result.body.success).toBe(true);
    await assertEvidence(f);
  });
  it('blocks a duplicate receipt with exactly 409 and does not add stock or a second posted receipt',async()=>{
    const f=await fixture.seedRequest('duplicate',5);
    expect((await receive(f)).status).toBe(200);
    await assertEvidence(f);
    const duplicate=await receive(f);
    expect(duplicate.status).toBe(409);expect(duplicate.body.success).toBe(false);
    // Preserve the old journal endpoint's duplicate guard coverage too: after
    // confirmed receipt it must not append another inward stock event.
    const journalDuplicate=await invokeReceipt(journalHandler,'POST','/api/stock-movements',{
      movementType:'received',productName:f.product,batch_no:f.lot,expiry_date:expiry,
      quantity:f.qty,destination_location:f.dest,destination_location_type:'branch',
      reference_id:f.id,
    },fixture.stockUser);
    expect(journalDuplicate.status).toBe(409);
    expect(Number((await query(`SELECT COUNT(*) AS events FROM stock_movements
      WHERE reference_id=$1 AND movement_type='received'`,[f.id])).rows[0].events)).toBe(0);
    await assertEvidence(f);
  });
});
