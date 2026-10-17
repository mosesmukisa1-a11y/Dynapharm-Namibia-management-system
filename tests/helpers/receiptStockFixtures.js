import {randomUUID} from 'node:crypto';
import {vi} from 'vitest';
import {withTransaction} from '../../api/db.js';
import {query} from './owned-raw-database.js';
import * as stockEngine from '../../api/services/stockEngine.js';
import {lifecycleSchema,allocateTransferTx,postAllocatedTransferMovementTx} from '../../api/services/stockCostLayers.js';
export const expiry='2035-12-31';
const pendingProjections=[];
let projectionSpy;
async function drainProjections(){
  while(pendingProjections.length){
    const results=await Promise.allSettled(pendingProjections.splice(0));
    const failure=results.find(result=>result.status==='rejected');
    if(failure)throw failure.reason;
  }
}
export function receiptFixtures(tag){
  const prefix=`TEST-${tag}-${randomUUID().slice(0,8)}`;
  const stockUser={sub:`${prefix}-staff`,role:'admin',fullName:'Isolated receipt tester'};
  const fixtures=[];
  async function seedTransfer(label,qty=12){
    const id=`${prefix}-${label}`,product=`${id}-product`,lot=`${id}-lot`,src=`${id.toLowerCase()}_src`,dest=`${id.toLowerCase()}_dst`,sourceId=`${id}-source`;
    const source={id:`${id}-original`,description:product,batch_no:lot,expiry_date:expiry,cif_unit_cost:3.123456,dpc_unit_value:8};
    const f={id,product,lot,src,dest,sourceId,qty};fixtures.push(f);
    await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,status,metadata)
      VALUES($1,$2,$3,$4,$5,30,8,'in_stock',$6)`,
      [sourceId,src,product,lot,expiry,JSON.stringify({cost_layers:[{quantity:30,source}]})]);
    await query(`INSERT INTO stock_transfers(id,from_warehouse,to_branch,status,gm_approved_by)
      VALUES($1,$2,$3,'dispatched','Isolated GM')`,[id,src,dest]);
    const transfer=(await query('SELECT * FROM stock_transfers WHERE id=$1',[id])).rows[0];
    const line=(await query(`INSERT INTO stock_transfer_items(transfer_id,product_id,product_name,batch_no,expiry_date,quantity,quantity_approved)
      VALUES($1,$2,$2,$3,$4,$5,$5) RETURNING *`,[id,product,lot,expiry,qty])).rows[0];
    await withTransaction(async client=>{
      await allocateTransferTx(client,transfer,line,qty);
      await postAllocatedTransferMovementTx(client,transfer,line,'transfer_out','Isolated dispatch');
    });
    return f;
  }
  async function seedRequest(label,qty=20){
    const id=`${prefix}-${label}`,product=`${id}-product`,lot=`${id}-lot`,dest=`${id.toLowerCase()}_dst`;
    const src=`${id.toLowerCase()}_warehouse`,sourceId=`${id}-source`;
    const f={id,product,lot,src,dest,sourceId,qty};fixtures.push(f);
    await query(`INSERT INTO stock_requests(id,requesting_branch,items,status)
      VALUES($1,$2,$3,'approved')`,[id,dest,JSON.stringify([{productName:product,batchNo:lot,expiryDate:expiry,quantity:qty}])]);
    await query(`INSERT INTO stock_batches(id,description,batch_no,expiry_date,location,quantity,remaining_quantity,dispatched_quantity,status)
      VALUES($1,$2,$3,$4,$5,30,30,0,'available')`,[sourceId,product,lot,expiry,src]);
    await query(`INSERT INTO stock_transfers(id,request_id,from_warehouse,to_branch,status,gm_approved_by)
      VALUES($1,$1,$2,$3,'dispatched','Isolated GM')`,[id,src,dest]);
    const transfer=(await query('SELECT * FROM stock_transfers WHERE id=$1',[id])).rows[0];
    const line=(await query(`INSERT INTO stock_transfer_items(transfer_id,product_id,product_name,batch_no,expiry_date,quantity,quantity_approved)
      VALUES($1,$2,$2,$3,$4,$5,$5) RETURNING *`,[id,product,lot,expiry,qty])).rows[0];
    await withTransaction(async client=>{
      await allocateTransferTx(client,transfer,line,qty);
      await postAllocatedTransferMovementTx(client,transfer,line,'transfer_out','Isolated dispatch');
    });
    return f;
  }
  async function clean(){
    // An HTTP response does not await the handlers' background recomputes.
    // Await the actual tracked promises before deleting any fixture rows.
    let projectionError;
    try{await drainProjections();}catch(error){projectionError=error;}
    for(const f of fixtures){
      await query('DELETE FROM dispatch_notes WHERE transfer_id=$1',[f.id]);
      await query('DELETE FROM stock_transfers WHERE id=$1',[f.id]); // allocation/item FK cascade
      await query('DELETE FROM stock_request_items WHERE request_id=$1',[f.id]);
      await query('DELETE FROM stock_requests WHERE id=$1',[f.id]);
      for(const table of ['inventory_balances','branch_inventory_movements','stock_movements','branch_inventory_batches'])
        await query(`DELETE FROM ${table} WHERE product_name=$1`,[f.product]);
      await query('DELETE FROM stock_batches WHERE id=$1',[f.sourceId]);
    }
    projectionSpy?.mockRestore();projectionSpy=null;
    if(projectionError)throw projectionError;
  }
  async function initialize(){
    await query(lifecycleSchema);
    const recompute=stockEngine.recomputeLocationBalances;
    projectionSpy=vi.spyOn(stockEngine,'recomputeLocationBalances').mockImplementation((...args)=>{
      const promise=recompute(...args);
      pendingProjections.push(promise);
      promise.catch(()=>{}); // retain rejection for drain, even when the handler logs it
      return promise;
    });
  }
  return {stockUser,seedTransfer,seedRequest,clean,initialize};
}
export async function invokeReceipt(handler,method,url,body,user){
  const captured={status:200,body:null};
  const res={setHeader(){},getHeader(){},status(n){captured.status=n;return this;},
    json(body){captured.body=body;return this;},end(){return this;}};
  try{
    await handler({method,url,body,user,headers:{host:'localhost'}},res);
  }finally{
    // Assert convergence only after every recompute actually scheduled by the
    // handler settles, not a guessed delay or a second test-induced recompute.
    await drainProjections();
  }
  return captured;
}
export async function destinationTotals(f){
  const params=[f.dest,f.product,f.lot,expiry];
  const physical=(await query(`SELECT COALESCE(SUM(quantity),0) AS qty FROM branch_inventory_batches
    WHERE branch_id=$1 AND product_name=$2 AND batch_no=$3 AND expiry_date=$4`,params)).rows[0];
  const projected=(await query(`SELECT COALESCE(SUM(closing_qty),0) AS qty FROM inventory_balances
    WHERE location_type='branch' AND location_id=$1 AND product_name=$2 AND batch_no=$3 AND expiry_date=$4`,params)).rows[0];
  return {physical:Number(physical.qty),projected:Number(projected.qty)};
}
