// @vitest-environment node
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterEach,describe,it,expect,vi} from 'vitest';
import * as db from '../api/db.js';
import handler from '../api/stock/transfers.js';
import {lifecycleSchema,allocateTransferTx,postAllocatedTransferMovementTx} from '../api/services/stockCostLayers.js';
import {getStockCostProjection} from '../api/services/stockCostReporting.js';

const prefix=`TEST-DISPATCH-CANCEL-${randomUUID().slice(0,8)}`;
const actions=new AsyncLocalStorage();
const actor={sub:`${prefix}-manager`,role:'stock_manager',fullName:'Isolated stock manager'};
const fixtures=[];
function signal(){
  let resolve;const promise=new Promise(r=>{resolve=r;});
  return {promise,resolve};
}
async function timed(promise){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('Concurrency gate did not reach the real transfer row lock')),4000);
  })]);}finally{clearTimeout(timer);}
}
async function seed(label,sourceType){
  const id=`${prefix}-${label}`,product=`${id}-product`,lot=`${id}-lot`;
  const warehouse=`${id.toLowerCase()}_warehouse`,branch=`${id.toLowerCase()}_branch`;
  const f={id,product,lot,warehouse,branch,source:`${id}-source`,mirror:`${id}-mirror`,sourceType};
  f.from=sourceType==='branch' ? `${id.toLowerCase()}_source_branch` : warehouse;
  fixtures.push(f);
  if(sourceType==='branch'){
    // Two complete FIFO layers are reserved from a single merged physical lot.
    // A legacy price deliberately conflicts with both frozen costs; the remaining
    // unknown-cost layer must stay unknown rather than inherit that price.
    f.layers=[
      {quantity:3,source:{id:`${id}-original-a`,cif_unit_cost:3.123456789,
        dpc_unit_value:9.25,received_unit_cif_exact:'3.123456789',
        receipt_key:`${id}-receipt-a`,supplier_id:`${id}-supplier-a`}},
      {quantity:5,source:{id:`${id}-original-b`,cif_unit_cost:7.987654321,
        dpc_unit_value:15.75,received_unit_cif_exact:'7.987654321',
        receipt_key:`${id}-receipt-b`,supplier_id:`${id}-supplier-b`}},
      {quantity:12,source:null},
    ];
    await db.query(`INSERT INTO branch_inventory_batches
      (id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,status,metadata)
      VALUES($1,$2,$3,$4,'2035-12-31',20,999,'in_stock',$5)`,
      [f.source,f.from,product,lot,JSON.stringify({cost_layers:f.layers,fixture:id})]);
  }else{
    await db.query('INSERT INTO warehouse_locations(id,name,type) VALUES($1,$2,\'warehouse\')',
      [warehouse,`Isolated concurrency warehouse ${id}`]);
    await db.query(`INSERT INTO stock_batches(id,description,batch_no,expiry_date,location,
      quantity,remaining_quantity,dispatched_quantity,status,cif_unit_cost,dpc_unit_value)
      VALUES($1,$2,$3,'2035-12-31',$4,20,20,0,'available',3.123456,9)`,
      [f.source,product,lot,warehouse]);
    await db.query(`INSERT INTO warehouse_inventory(id,warehouse_id,product_id,product_name,
      batch_no,expiry_date,quantity) VALUES($1,$2,$3,$3,$4,'2035-12-31',12)`,
      [f.mirror,warehouse,product,lot]);
  }
  await db.query(`INSERT INTO stock_transfers(id,from_warehouse,to_branch,status,gm_approved_by)
    VALUES($1,$2,$3,'approved','Isolated GM')`,[id,f.from,branch]);
  const transfer=(await db.query('SELECT * FROM stock_transfers WHERE id=$1',[id])).rows[0];
  const line=(await db.query(`INSERT INTO stock_transfer_items(transfer_id,product_id,product_name,
    batch_no,expiry_date,quantity,quantity_approved) VALUES($1,$2,$2,$3,'2035-12-31',8,8)
    RETURNING *`,[id,product,lot])).rows[0];
  // Reserve the original physical layer through the real allocation service.
  // For warehouse cases the legacy mirror records the same reservation.
  await db.withTransaction(async client=>{
    await allocateTransferTx(client,transfer,line,8);
    await postAllocatedTransferMovementTx(client,transfer,line,'reserved',actor.fullName);
  });
  return f;
}
async function patch(f,status){
  const result={status:200};
  const res={setHeader(){},getHeader(){},status(n){result.status=n;return this;},
    json(body){result.body=body;return this;},end(){return this;}};
  await handler({method:'PATCH',url:`/api/stock/transfers?id=${f.id}`,headers:{host:'localhost'},
    user:actor,body:{id:f.id,status}},res);
  return result;
}
async function snapshot(f){
  const [transfer,batches,mirrors,movements,notes,allocations,branches,projection]=await Promise.all([
    db.query('SELECT id,status FROM stock_transfers WHERE id=$1',[f.id]),
    db.query('SELECT id,quantity,remaining_quantity,dispatched_quantity FROM stock_batches WHERE description=$1 ORDER BY id',[f.product]),
    db.query('SELECT id,quantity FROM warehouse_inventory WHERE product_name=$1 ORDER BY id',[f.product]),
    db.query(`SELECT id,movement_type,status,quantity,source_location,destination_location,
      destination_location_type,source_location_type,unit_cif,unit_dp,original_unit_cif,
      original_unit_dp FROM stock_movements WHERE reference_id=$1 ORDER BY id`,[f.id]),
    db.query('SELECT id,status,transfer_id,from_warehouse,to_branch FROM dispatch_notes WHERE transfer_id=$1 ORDER BY id',[f.id]),
    db.query('SELECT id,source_type,source_id,quantity,snapshot FROM stock_transfer_allocations WHERE transfer_id=$1 ORDER BY allocation_order',[f.id]),
    db.query('SELECT id,branch_id,quantity,unit_price,metadata FROM branch_inventory_batches WHERE product_name=$1 ORDER BY id',[f.product]),
    getStockCostProjection({productName:f.product}),
  ]);
  return {transfer:transfer.rows[0],batches:batches.rows,mirrors:mirrors.rows,
    movements:movements.rows,notes:notes.rows,allocations:allocations.rows,
    branches:branches.rows,projection:projection.sort((a,b)=>a.id.localeCompare(b.id))};
}
async function cleanup(){
  vi.restoreAllMocks();
  for(const f of fixtures){
    await db.query('DELETE FROM dispatch_notes WHERE transfer_id=$1',[f.id]);
    await db.query('DELETE FROM stock_transfers WHERE id=$1',[f.id]); // items and allocations cascade
    await db.query('DELETE FROM stock_movements WHERE reference_id=$1',[f.id]);
    await db.query('DELETE FROM inventory_balances WHERE product_name=$1',[f.product]);
    await db.query('DELETE FROM warehouse_inventory WHERE product_name=$1',[f.product]);
    await db.query('DELETE FROM stock_batches WHERE description=$1',[f.product]);
    await db.query('DELETE FROM branch_inventory_batches WHERE product_name=$1',[f.product]);
    await db.query('DELETE FROM warehouse_locations WHERE id=$1',[f.warehouse]);
    expect(Number((await db.query(`SELECT
      (SELECT COUNT(*) FROM stock_movements WHERE reference_id=$1)+
      (SELECT COUNT(*) FROM dispatch_notes WHERE transfer_id=$1)+
      (SELECT COUNT(*) FROM stock_transfers WHERE id=$1)+
      (SELECT COUNT(*) FROM stock_transfer_items WHERE transfer_id=$1)+
      (SELECT COUNT(*) FROM stock_transfer_allocations WHERE transfer_id=$1)+
      (SELECT COUNT(*) FROM stock_batches WHERE description=$2)+
      (SELECT COUNT(*) FROM warehouse_inventory WHERE product_name=$2)+
       (SELECT COUNT(*) FROM branch_inventory_batches WHERE product_name=$2)+
      (SELECT COUNT(*) FROM inventory_balances WHERE product_name=$2)+
      (SELECT COUNT(*) FROM warehouse_locations WHERE id=$3) AS remaining`,[f.id,f.product,f.warehouse])).rows[0].remaining)).toBe(0);
  }
  fixtures.length=0;
}
describe.sequential('real PATCH dispatch versus cancellation/rejection row-lock race',()=>{
  beforeAll(()=>db.query(lifecycleSchema));afterEach(cleanup);
  const races=['stock','branch'].flatMap(sourceType=>['cancelled','rejected'].flatMap(action=>[
    {sourceType,winner:'dispatched',loser:action},
    {sourceType,winner:action,loser:'dispatched'},
  ]));
  it.each(races)('$sourceType: $winner wins while $loser waits on the same approved transfer',async({sourceType,winner,loser})=>{
    // Keep location IDs within the legacy warehouse_locations varchar(60).
    const f=await seed(`${sourceType[0]}-${winner}-${loser[0]}`,sourceType);
    const initial=await snapshot(f);
    expect(initial.transfer.status).toBe('approved');
    if(sourceType==='branch'){
      expect(initial.batches).toHaveLength(0);
      expect(initial.mirrors).toHaveLength(0);
      expect(initial.branches).toHaveLength(1);
      expect(Number(initial.branches[0].quantity)).toBe(12);
      expect(initial.branches[0].metadata.cost_layers).toEqual(f.layers.slice(2));
      expect(initial.allocations.map(a=>({quantity:Number(a.quantity),source:a.snapshot.source}))).toEqual(f.layers.slice(0,2));
      expect(initial.allocations.every(a=>a.source_type==='branch' && a.source_id===f.source)).toBe(true);
      expect(initial.projection.reduce((sum,r)=>sum+r.qty,0)).toBe(20);
      expect(initial.projection.reduce((sum,r)=>sum+r.reservedQty,0)).toBe(8);
      expect(initial.projection.reduce((sum,r)=>sum+r.inTransitQty,0)).toBe(0);
      expect(initial.movements).toHaveLength(2);
      expect(initial.movements.every(m=>m.movement_type==='reserved' && m.status==='posted')).toBe(true);
    }else{
      expect(Number(initial.batches[0].remaining_quantity)).toBe(12);
      expect(Number(initial.batches[0].dispatched_quantity)).toBe(8);
      expect(Number(initial.mirrors[0].quantity)).toBe(12);
      expect(initial.allocations).toHaveLength(1);
      expect(initial.movements).toHaveLength(1);
      expect(initial.movements[0].movement_type).toBe('reserved');
    }
    expect(initial.notes).toHaveLength(0);

    const locked=signal(),attempted=signal(),release=signal();
    const getOne=db.getOne;
    // Delay only scheduling, not SQL results or handler behavior. The winner
    // owns the real FOR UPDATE lock while the other transaction attempts it.
    vi.spyOn(db,'getOne').mockImplementation(async(sql,params)=>{
      if(sql==='SELECT * FROM stock_transfers WHERE id = $1 FOR UPDATE' && params[0]===f.id){
        const {pid}=await getOne('SELECT pg_backend_pid() AS pid');
        if(actions.getStore()===winner){
          const row=await getOne(sql,params);locked.resolve(pid);
          await release.promise;return row;
        }
        attempted.resolve(pid);
      }
      return getOne(sql,params);
    });
    let winning,losing;
    try{
      winning=actions.run(winner,()=>patch(f,winner));
      const winnerPid=await timed(locked.promise);
      losing=actions.run(loser,()=>patch(f,loser));
      const loserPid=await timed(attempted.promise);
      // Prove actual database contention, not merely Promise.all of requests
      // that might happen to execute sequentially.
      const deadline=Date.now()+3000;
      let blocked=false;
      while(Date.now()<deadline){
        const row=(await db.query(`SELECT wait_event_type,pg_blocking_pids(pid) AS blockers
          FROM pg_stat_activity WHERE pid=$1`,[loserPid])).rows[0];
        if(row?.wait_event_type==='Lock' && row.blockers.includes(winnerPid)){blocked=true;break;}
        await new Promise(r=>setTimeout(r,10));
      }
      expect(blocked,'The losing real transaction must wait on the winning transfer row lock').toBe(true);
    }finally{
      release.resolve();
      // Never clean fixtures while either competing request is still running.
      await Promise.allSettled([winning,losing].filter(Boolean));
      vi.restoreAllMocks();
    }
    const [won,lost]=await Promise.all([winning,losing]);
    expect(won.status,won.body?.error).toBe(200);
    expect(won.body?.success).toBe(true);
    expect(lost.status,lost.body?.error).toBe(409);
    expect(lost.body?.success).toBe(false);
    expect(lost.body?.error).toMatch(winner==='dispatched'
      ? /linked physical return|controlled return\/reversal/i
      : /approve the transfer before dispatching/i);
    const final=await snapshot(f);
    expect(final.transfer.status).toBe(winner);
    if(sourceType==='branch'){
      expect(final.batches).toHaveLength(0);
      expect(final.mirrors).toHaveLength(0);
      expect(final.branches).toHaveLength(1);
      expect(final.branches[0].id).toBe(f.source);
      expect(Number(final.branches[0].quantity)).toBe(winner==='dispatched'?12:20);
      expect(final.branches[0].metadata).toEqual({
        fixture:f.id,cost_layers:winner==='dispatched'?f.layers.slice(2):f.layers,
      });
      expect(Number(final.branches[0].unit_price)).toBe(999);
      expect(final.allocations).toEqual(initial.allocations);
      const transit=final.projection.filter(r=>r.location===`in_transit:${f.id}`);
      expect(transit).toHaveLength(winner==='dispatched'?2:0);
      for(const layer of f.layers.slice(0,2)){
        const projected=final.projection.filter(r=>r.sourceBatchId===layer.source.id);
        expect(projected).toHaveLength(1);
        expect(projected[0]).toMatchObject({location:winner==='dispatched'?`in_transit:${f.id}`:f.from,
          qty:layer.quantity,unitCIF:layer.source.cif_unit_cost,unitDPC:layer.source.dpc_unit_value,
          inTransitQty:winner==='dispatched'?layer.quantity:0,reservedQty:0});
      }
      expect(final.projection.reduce((sum,r)=>sum+r.qty,0)).toBe(20);
      expect(final.projection.filter(r=>r.sourceBatchId===null)).toHaveLength(1);
      expect(final.projection.find(r=>r.sourceBatchId===null)).toMatchObject({
        location:f.from,qty:12,unitCIF:null,unitDPC:null,missingCostQuantity:12,missingDPCQuantity:12});
      expect(final.projection.every(r=>r.location!==f.branch && r.reservedQty===0)).toBe(true);
    }else{
      expect(Number(final.batches[0].quantity)).toBe(20);
      expect(Number(final.batches[0].remaining_quantity)).toBe(winner==='dispatched'?12:20);
      expect(Number(final.batches[0].dispatched_quantity)).toBe(winner==='dispatched'?8:0);
      expect(Number(final.mirrors[0].quantity)).toBe(winner==='dispatched'?12:20);
    }
    const postedDispatch=final.movements.filter(row=>
      ['transfer_out','transit_dispatch'].includes(row.movement_type) && row.status==='posted');
    if(winner==='dispatched'){
      expect(postedDispatch).toHaveLength(sourceType==='branch'?2:1);
      expect(postedDispatch.reduce((sum,r)=>sum+Number(r.quantity),0)).toBe(8);
      expect(postedDispatch.every(r=>r.source_location===f.from)).toBe(true);
      expect(postedDispatch[0].destination_location).toBe(`in_transit:${f.id}`);
      expect(postedDispatch[0].destination_location_type).toBe('in_transit');
      expect(final.notes).toHaveLength(1);
      expect(final.notes[0]).toMatchObject({status:'in_transit',from_warehouse:f.from,to_branch:f.branch});
      expect(final.allocations).toHaveLength(sourceType==='branch'?2:1);
      if(sourceType==='branch'){
        for(const layer of f.layers.slice(0,2)){
          const movement=postedDispatch.find(m=>Number(m.original_unit_cif)===layer.source.cif_unit_cost);
          expect(movement).toBeDefined();
          expect(movement).toMatchObject({source_location_type:'branch',
            destination_location:`in_transit:${f.id}`,destination_location_type:'in_transit'});
          expect(Number(movement.quantity)).toBe(layer.quantity);
          expect(Number(movement.original_unit_cif)).toBe(layer.source.cif_unit_cost);
          // The legacy display column is NUMERIC(14,4); the original column
          // and allocation snapshot must retain the full received precision.
          expect(Number(movement.unit_cif)).toBe(Number(layer.source.cif_unit_cost.toFixed(4)));
          expect(Number(movement.original_unit_dp)).toBe(layer.source.dpc_unit_value);
          expect(Number(movement.unit_dp)).toBe(layer.source.dpc_unit_value);
        }
      }
    }else{
      expect(postedDispatch).toHaveLength(0);
      expect(final.movements).toHaveLength(sourceType==='branch'?2:1);
      expect(final.movements.every(m=>m.movement_type==='reserved' && m.status==='cancelled')).toBe(true);
      expect(final.notes).toHaveLength(0);
      // Frozen allocations remain as original evidence; the cancelled/rejected transfer
      // and voided reservation, not deletion of history, release their custody.
      expect(final.allocations).toEqual(initial.allocations);
    }
    // Successful retries must not release twice or duplicate dispatch evidence.
    // Losing retries must still respect the persisted winner's custody status.
    for(let attempt=0;attempt<2;attempt++){
      const retryWinner=await patch(f,winner);
      expect(retryWinner.status,retryWinner.body?.error).toBe(200);
      expect(retryWinner.body?.success).toBe(true);
      expect(await snapshot(f)).toEqual(final);
      const retryLoser=await patch(f,loser);
      expect(retryLoser.status,retryLoser.body?.error).toBe(409);
      expect(retryLoser.body?.success).toBe(false);
      expect(await snapshot(f)).toEqual(final);
    }
  },15000);
});
