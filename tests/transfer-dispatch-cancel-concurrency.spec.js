// @vitest-environment node
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterEach,describe,it,expect,vi} from 'vitest';
import * as db from '../api/db.js';
import handler from '../api/stock/transfers.js';
import {lifecycleSchema,allocateTransferTx,postAllocatedTransferMovementTx} from '../api/services/stockCostLayers.js';

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
async function seed(label){
  const id=`${prefix}-${label}`,product=`${id}-product`,lot=`${id}-lot`;
  const warehouse=`${id.toLowerCase()}_warehouse`,branch=`${id.toLowerCase()}_branch`;
  const f={id,product,lot,warehouse,branch,source:`${id}-source`,mirror:`${id}-mirror`};
  fixtures.push(f);
  await db.query('INSERT INTO warehouse_locations(id,name,type) VALUES($1,$2,\'warehouse\')',
    [warehouse,`Isolated concurrency warehouse ${id}`]);
  await db.query(`INSERT INTO stock_batches(id,description,batch_no,expiry_date,location,
    quantity,remaining_quantity,dispatched_quantity,status,cif_unit_cost,dpc_unit_value)
    VALUES($1,$2,$3,'2035-12-31',$4,20,20,0,'available',3.123456,9)`,
    [f.source,product,lot,warehouse]);
  await db.query(`INSERT INTO warehouse_inventory(id,warehouse_id,product_id,product_name,
    batch_no,expiry_date,quantity) VALUES($1,$2,$3,$3,$4,'2035-12-31',12)`,
    [f.mirror,warehouse,product,lot]);
  await db.query(`INSERT INTO stock_transfers(id,from_warehouse,to_branch,status,gm_approved_by)
    VALUES($1,$2,$3,'approved','Isolated GM')`,[id,warehouse,branch]);
  const transfer=(await db.query('SELECT * FROM stock_transfers WHERE id=$1',[id])).rows[0];
  const line=(await db.query(`INSERT INTO stock_transfer_items(transfer_id,product_id,product_name,
    batch_no,expiry_date,quantity,quantity_approved) VALUES($1,$2,$2,$3,'2035-12-31',8,8)
    RETURNING *`,[id,product,lot])).rows[0];
  // Reserve the original physical layer through the real allocation service.
  // The legacy warehouse mirror records the same already-deducted reservation.
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
  const [transfer,batches,mirrors,movements,notes,allocations]=await Promise.all([
    db.query('SELECT id,status FROM stock_transfers WHERE id=$1',[f.id]),
    db.query('SELECT id,quantity,remaining_quantity,dispatched_quantity FROM stock_batches WHERE description=$1 ORDER BY id',[f.product]),
    db.query('SELECT id,quantity FROM warehouse_inventory WHERE product_name=$1 ORDER BY id',[f.product]),
    db.query(`SELECT id,movement_type,status,quantity,source_location,destination_location,
      destination_location_type FROM stock_movements WHERE reference_id=$1 ORDER BY id`,[f.id]),
    db.query('SELECT id,status,transfer_id,from_warehouse,to_branch FROM dispatch_notes WHERE transfer_id=$1 ORDER BY id',[f.id]),
    db.query('SELECT id,source_id,quantity FROM stock_transfer_allocations WHERE transfer_id=$1 ORDER BY id',[f.id]),
  ]);
  return {transfer:transfer.rows[0],batches:batches.rows,mirrors:mirrors.rows,
    movements:movements.rows,notes:notes.rows,allocations:allocations.rows};
}
async function cleanup(){
  vi.restoreAllMocks();
  for(const f of fixtures){
    await db.query('DELETE FROM dispatch_notes WHERE transfer_id=$1',[f.id]);
    await db.query('DELETE FROM stock_transfers WHERE id=$1',[f.id]); // items and allocations cascade
    await db.query('DELETE FROM stock_movements WHERE reference_id=$1',[f.id]);
    await db.query('DELETE FROM inventory_balances WHERE product_name=$1',[f.product]);
    await db.query('DELETE FROM warehouse_inventory WHERE id=$1',[f.mirror]);
    await db.query('DELETE FROM stock_batches WHERE id=$1',[f.source]);
    await db.query('DELETE FROM warehouse_locations WHERE id=$1',[f.warehouse]);
    expect(Number((await db.query(`SELECT
      (SELECT COUNT(*) FROM stock_movements WHERE reference_id=$1)+
      (SELECT COUNT(*) FROM dispatch_notes WHERE transfer_id=$1)+
      (SELECT COUNT(*) FROM stock_transfers WHERE id=$1)+
      (SELECT COUNT(*) FROM stock_transfer_items WHERE transfer_id=$1)+
      (SELECT COUNT(*) FROM stock_transfer_allocations WHERE transfer_id=$1)+
      (SELECT COUNT(*) FROM stock_batches WHERE description=$2)+
      (SELECT COUNT(*) FROM warehouse_inventory WHERE product_name=$2)+
      (SELECT COUNT(*) FROM inventory_balances WHERE product_name=$2)+
      (SELECT COUNT(*) FROM warehouse_locations WHERE id=$3) AS remaining`,[f.id,f.product,f.warehouse])).rows[0].remaining)).toBe(0);
  }
  fixtures.length=0;
}
describe.sequential('real PATCH dispatch versus cancellation row-lock race',()=>{
  beforeAll(()=>db.query(lifecycleSchema));afterEach(cleanup);
  it.each(['dispatched','cancelled'])('%s wins while the competing action waits on the same approved transfer',async winner=>{
    const loser=winner==='dispatched'?'cancelled':'dispatched';
    const f=await seed(winner);
    const initial=await snapshot(f);
    expect(initial.transfer.status).toBe('approved');
    expect(Number(initial.batches[0].remaining_quantity)).toBe(12);
    expect(Number(initial.batches[0].dispatched_quantity)).toBe(8);
    expect(Number(initial.mirrors[0].quantity)).toBe(12);
    expect(initial.allocations).toHaveLength(1);
    expect(initial.movements).toHaveLength(1);
    expect(initial.movements[0].movement_type).toBe('reserved');
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
    expect(lost.status,lost.body?.error).toBe(409);
    const final=await snapshot(f);
    expect(final.transfer.status).toBe(winner);
    expect(Number(final.batches[0].quantity)).toBe(20);
    expect(Number(final.batches[0].remaining_quantity)).toBe(winner==='dispatched'?12:20);
    expect(Number(final.batches[0].dispatched_quantity)).toBe(winner==='dispatched'?8:0);
    expect(Number(final.mirrors[0].quantity)).toBe(winner==='dispatched'?12:20);
    const postedDispatch=final.movements.filter(row=>
      ['transfer_out','transit_dispatch'].includes(row.movement_type) && row.status==='posted');
    if(winner==='dispatched'){
      expect(postedDispatch).toHaveLength(1);
      expect(Number(postedDispatch[0].quantity)).toBe(8);
      expect(postedDispatch[0].source_location).toBe(f.warehouse);
      expect(postedDispatch[0].destination_location).toBe(`in_transit:${f.id}`);
      expect(postedDispatch[0].destination_location_type).toBe('in_transit');
      expect(final.notes).toHaveLength(1);
      expect(final.notes[0]).toMatchObject({status:'in_transit',from_warehouse:f.warehouse,to_branch:f.branch});
      expect(final.allocations).toHaveLength(1);
    }else{
      expect(postedDispatch).toHaveLength(0);
      expect(final.movements).toHaveLength(1);
      expect(final.movements[0]).toMatchObject({movement_type:'reserved',status:'cancelled'});
      expect(final.notes).toHaveLength(0);
      // Frozen allocations remain as original evidence; the cancelled transfer
      // and voided reservation, not deletion of history, release their custody.
      expect(final.allocations).toEqual(initial.allocations);
      // Repeated successful cancellation must not release the reservation twice.
      expect((await patch(f,'cancelled')).status).toBe(200);
      expect(await snapshot(f)).toEqual(final);
    }
    expect((await patch(f,loser)).status).toBe(409);
    expect(await snapshot(f)).toEqual(final);
  },15000);
});
