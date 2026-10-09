// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { query } from '../api/db.js';
import handler from '../api/stock/transfers.js';

const product='TEST_CONTROLLED_TRANSFER_CANCEL';
const prefix='TEST-CTRL-CANCEL-';
const warehouse='windhoek_warehouse';
async function cleanup() {
  await query('DELETE FROM warehouse_inventory WHERE product_name=$1',[product]);
  await query('DELETE FROM stock_batches WHERE description=$1',[product]);
  await query('DELETE FROM stock_movements WHERE product_name=$1',[product]);
  await query('DELETE FROM inventory_balances WHERE product_name=$1',[product]);
  await query('DELETE FROM dispatch_notes WHERE transfer_id LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM stock_transfer_items WHERE product_name=$1',[product]);
  await query('DELETE FROM stock_transfers WHERE id LIKE $1',[`${prefix}%`]);
}
async function seed(id,status) {
  await query(`INSERT INTO stock_transfers(id,from_warehouse,to_branch,status,gm_approved_by,created_at,updated_at)
    VALUES($1,$2,'test_cancel_dest_branch',$3,'Test GM',NOW(),NOW())`,[id,warehouse,status]);
  await query(`INSERT INTO stock_transfer_items(transfer_id,product_id,product_name,batch_no,expiry_date,quantity,quantity_approved)
    VALUES($1,$2,$2,'CTRL-BATCH','2030-12-31',8,8)`,[id,product]);
  await query(`INSERT INTO stock_movements(id,product_name,batch_no,expiry_date,quantity,movement_type,source_location,source_location_type,destination_location,destination_location_type,reference_id,status,created_at,updated_at)
    VALUES($1,$2,'CTRL-BATCH','2030-12-31',8,$3,$4,'warehouse',$5,'in_transit',$6,'posted',NOW(),NOW())`,
    [`SM-${id}`,product,status==='approved'?'reserved':'transit_dispatch',warehouse,`in_transit:${id}`,id]);
}
async function cancel(id) {
  const result={status:200};
  const res={setHeader(){},status(code){result.status=code;return this;},json(body){result.body=body;return this;},end(){return this;}};
  await handler({method:'PATCH',url:'/api/stock/transfers',headers:{host:'localhost'},user:{id:'test-cancel-admin',role:'admin',fullName:'Test Admin'},body:{id,status:'cancelled'}},res);
  return result;
}
describe.sequential('controlled transfer cancellation preserves dispatched stock evidence',()=>{
  beforeAll(cleanup);
  afterAll(cleanup);
  it.each(['dispatched','in_transit','partially_received','delivered'])('rejects direct cancellation after %s without voiding movements',async status=>{
    const id=`${prefix}${status}`;
    await seed(id,status);
    const result=await cancel(id);
    expect(result.status).toBe(409);
    expect((await query('SELECT status FROM stock_transfers WHERE id=$1',[id])).rows[0].status).toBe(status);
    expect((await query('SELECT status FROM stock_movements WHERE reference_id=$1',[id])).rows[0].status).toBe('posted');
  });
  it('releases an approved reservation once under simultaneous cancellation retries',async()=>{
    const transferId=`${prefix}approved`;
    await seed(transferId,'approved');
    await query(`INSERT INTO stock_batches(id,description,location,batch_no,expiry_date,quantity,remaining_quantity,dispatched_quantity,status)
      VALUES($1,$2,$3,'CTRL-BATCH','2030-12-31',20,12,8,'available')`,[`${prefix}SB`,product,warehouse]);
    const results=await Promise.all([cancel(transferId),cancel(transferId)]);
    expect(results.every(result=>result.status===200),JSON.stringify(results)).toBe(true);
    expect(Number((await query('SELECT remaining_quantity FROM stock_batches WHERE id=$1',[`${prefix}SB`])).rows[0].remaining_quantity)).toBe(20);
    expect((await query("SELECT status FROM stock_movements WHERE reference_id=$1 AND movement_type='reserved'",[transferId])).rows[0].status).toBe('cancelled');
  });
});
