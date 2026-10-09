// @vitest-environment node
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {query} from '../api/db.js';
import handler from '../api/stock/refund-requests.js';
import branchRefund from '../api/branch/refund-requests.js';
import {saleAllocationSchema} from '../api/services/stockSaleAllocations.js';
import {reversalSchema} from '../api/services/linkedReversals.js';

const prefix=`TEST-HREF-${randomUUID().slice(0,8)}`,branch=`${prefix.toLowerCase()}_branch`;
const stock={id:`${prefix}-stock`,role:'stock_manager'},gm={id:`${prefix}-gm`,role:'gm'};
let serial=0;
async function call(body,user=stock,method='PATCH',url='/api/stock/refund-requests',fn=handler){
  const result={};const res={setHeader(){},getHeader(){},status(n){result.status=n;return this;},
    json(data){result.body=data;return this;},end(){return this;}};
  await fn({method,body,user,url,headers:{host:'localhost'}},res);
  return {...result,status:result.status || 200};
}
async function fixture({quantity=2,reference=true,layers,expiry='2035-12-31',charged=12.5}={}){
  const id=`${prefix}-${++serial}`,movement=`${id}-move`,sale=`${id}-sale`,batch=`${id}-bib`,lot=`LOT-${serial}`;
  const source={id:`${id}-old-source`,description:prefix,batch_no:lot,expiry_date:expiry,
    cif_unit_cost:2.345678,dpc_unit_value:7.25,supplier_import_id:null,supplier_name:null};
  const snapshot={id:batch,batch_type:'branch',location:branch,product_name:prefix,batch_no:lot,expiry_date:expiry,
    revenue_unit:charged,unit_cost:2.345678,unit_dp:7.25,source_batch_id:source.id,
    original_source:source,cost_layers:layers || [{quantity:4,source}]};
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,status)
    VALUES($1,$2,$3,$4,$5,2,7.25,'in_stock')`,[batch,branch,prefix,lot,expiry]);
  await query(`INSERT INTO stock_movements(id,product_name,batch_no,expiry_date,quantity,movement_type,source_location,
    source_location_type,destination_location,reference_id,status,unit_cif,unit_dp)
    VALUES($1,$2,$3,$4,4,'walk_in_member_sale',$5,'branch','customer',$6,'posted',2.345678,7.25)`,
    [movement,prefix,lot,expiry,branch,sale]);
  await query(`INSERT INTO stock_sale_allocations(movement_id,sale_reference,branch_batch_id,branch_id,product_name,
    batch_no,expiry_date,quantity,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,4,$8)`,
    [movement,sale,batch,branch,prefix,lot,expiry,JSON.stringify(snapshot)]);
  await query(`INSERT INTO branch_refund_requests(id,branch_id,product_name,batch_no,quantity,unit_price,refund_amount,
    reason,status,requested_by,sale_reference) VALUES($1,$2,$3,$4,$5,999,999,'Historical sealed goods','pending','Old request',$6)`,
    [id,branch,prefix,lot,quantity,reference?sale:null]);
  return {id,movement,sale,batch,lot,snapshot};
}
const proposal=(f,extra={})=>call({id:f.id,action:'propose_evidence',sale_reference:f.sale,allocation_id:f.movement,
  evidence_reference:'Archived original customer receipt',proposal_reason:'Compared the original receipt line and branch issue',...extra});
const review=(f,p,action='approve_evidence',user=gm)=>call({id:f.id,action,proposal_id:p.id,review_reason:'Verified archived receipt against frozen allocation'},user);
const refund=f=>query('SELECT * FROM branch_refund_requests WHERE id=$1',[f.id]).then(r=>r.rows[0]);

beforeAll(async()=>{
  await query(saleAllocationSchema);await query(reversalSchema);
  await query(await readFile('migrations/029_historical_refund_evidence.sql','utf8'));
});
afterAll(async()=>{
  // Immutable synthetic evidence intentionally survives; UI scopes it through
  // existing requests. All physical/financial fixtures are removed.
  await query('DELETE FROM stock_linked_reversals WHERE original_reference LIKE $1',[`${prefix}%`]);
  await query("DELETE FROM stock_segregated_batches WHERE snapshot->>'product_name'=$1",[prefix]);
  await query('DELETE FROM branch_activity_transactions WHERE branch_id=$1',[branch]);
  await query('DELETE FROM branch_refund_requests WHERE product_name=$1',[prefix]);
  await query('DELETE FROM stock_movements WHERE product_name=$1',[prefix]);
  await query('DELETE FROM branch_inventory_batches WHERE product_name=$1',[prefix]);
  await query('DELETE FROM branch_inventory_movements WHERE product_name=$1',[prefix]);
  await query('DELETE FROM inventory_balances WHERE product_name=$1',[prefix]);
});
describe('separately approved historical refund evidence',()=>{
  it('uses the actual login JWT sub claim for immutable proposer and GM reviewer identities',async()=>{
    const f=await fixture();
    const proposed=await call({id:f.id,action:'propose_evidence',sale_reference:f.sale,allocation_id:f.movement,
      evidence_reference:'JWT-format archived receipt',proposal_reason:'Original receipt verified'},
      {sub:`${prefix}-jwt-stock`,role:'stock_manager'});
    expect(proposed.status).toBe(200);
    expect(proposed.body.proposal.proposed_by).toBe(`${prefix}-jwt-stock`);
    expect((await review(f,proposed.body.proposal,'approve_evidence',{sub:`${prefix}-jwt-gm`,role:'gm'})).status).toBe(200);
    expect((await refund(f)).historical_evidence_link_id).toBe(proposed.body.proposal.id);
  });
  it('requires login and stock management scope, and forbids stock from GM approval',async()=>{
    expect((await call({},null,'GET')).status).toBe(401);
    expect((await call({}, {id:'branch',role:'dispenser',branch},'GET')).status).toBe(403);
    const f=await fixture(),p=(await proposal(f)).body.proposal;
    expect((await review(f,p,'approve_evidence',stock)).status).toBe(403);
    expect((await review(f,p,'approve_evidence',{id:stock.id,role:'gm'})).status).toBe(403);
    expect((await refund(f)).allocation_id).toBeNull();
  });
  it('captures immutable unknown source fields and links only evidence, without rewriting quantities/prices/custody/status',async()=>{
    const f=await fixture({reference:false}),before=await refund(f);
    const p=(await proposal(f)).body.proposal;
    expect(p.allocation_snapshot.snapshot.cost_layers[0].source.supplier_import_id).toBeNull();
    expect((await review(f,p)).status).toBe(200);
    const after=await refund(f);
    expect(after.allocation_id).toBe(f.movement);
    expect(after.historical_evidence_link_id).toBe(p.id);
    expect(after.sale_reference).toBe(f.sale);
    for(const key of ['quantity','unit_price','refund_amount','status','physical_return_confirmed'])
      expect(after[key]).toEqual(before[key]);
    expect(Number((await query('SELECT quantity FROM branch_inventory_batches WHERE id=$1',[f.batch])).rows[0].quantity)).toBe(2);
    await expect(query('UPDATE stock_historical_refund_evidence SET proposal_reason=$1 WHERE id=$2',['tampered',p.id])).rejects.toThrow(/immutable/);
    await expect(query('DELETE FROM stock_historical_refund_evidence WHERE id=$1',[p.id])).rejects.toThrow(/immutable/);
    expect((await review(f,p)).status).toBe(409);
  });
  it('rejects an evidence proposal separately from rejecting or physically approving the refund',async()=>{
    const f=await fixture(),p=(await proposal(f)).body.proposal;
    expect((await review(f,p,'reject_evidence')).status).toBe(200);
    expect((await refund(f)).status).toBe('pending');
    expect((await refund(f)).allocation_id).toBeNull();
    expect((await proposal(f)).status).toBe(200);
  });
  it('keeps a duplicate proposal idempotent and blocks a different simultaneous proposal',async()=>{
    const f=await fixture(),first=await proposal(f),second=await proposal(f);
    expect(second.body.proposal.id).toBe(first.body.proposal.id);
    expect((await proposal(f,{evidence_reference:'Different unreviewed document'})).status).toBe(409);
  });
  it('rejects ambiguous original allocations even when a caller picks one',async()=>{
    const f=await fixture();
    await query(`INSERT INTO stock_movements(id,product_name,quantity,movement_type,source_location,destination_location,status)
      VALUES($1,$2,4,'walk_in_member_sale',$3,'customer','posted')`,[`${f.movement}-2`,prefix,branch]);
    await query(`INSERT INTO stock_sale_allocations SELECT $1,sale_reference,branch_batch_id,branch_id,product_name,batch_no,
      expiry_date,quantity,snapshot,NOW() FROM stock_sale_allocations WHERE movement_id=$2`,[`${f.movement}-2`,f.movement]);
    const lookup=await call({},stock,'GET',`/api/stock/refund-requests?evidence_for=${f.id}&sale_reference=${f.sale}`);
    expect(lookup.body.ambiguous).toBe(true);
    expect((await proposal(f)).status).toBe(409);
  });
  it('rejects mixed supplier/cost layers, incomplete quantity layers and missing charged price instead of guessing',async()=>{
    for(const options of [
      {layers:[{quantity:2,source:{id:'source-a',cif_unit_cost:2}},{quantity:2,source:{id:'source-b',cif_unit_cost:3}}]},
      {layers:[{quantity:1,source:null}]},{charged:null},
    ])expect((await proposal(await fixture(options))).status).toBe(409);
  });
  it('rejects supplier, lot and DP conflicts even when source ID/import/CF/expiry match',async()=>{
    for(const conflict of [{supplier_name:'Different supplier'},{supplier_id:'different-vendor'},
      {batch_no:'CONFLICTING-LOT'},{dpc_unit_value:99}]){
      const f=await fixture(),original=f.snapshot.original_source;
      const snapshot={...f.snapshot,cost_layers:[{quantity:2,source:original},{quantity:2,source:{...original,...conflict}}]};
      await query('UPDATE stock_sale_allocations SET snapshot=$1 WHERE movement_id=$2',[JSON.stringify(snapshot),f.movement]);
      expect((await proposal(f)).status).toBe(409);
      expect((await refund(f)).allocation_id).toBeNull();
    }
  });
  it('rejects source-layer contradictions with aggregate source, supplier and cost evidence',async()=>{
    for(const conflict of [{source_batch_id:'another-source'},{original_source:null},
      {supplier_import_id:'another-import'},{supplier_name:'Invented supplier'},
      {supplier_id:'conflicting-supplier'},{unit_cost:99},{unit_dp:99},{batch_no:'another-lot'},
      {expiry_date:'2036-12-31'},{location:'different_branch'}]){
      const f=await fixture();
      await query('UPDATE stock_sale_allocations SET snapshot=$1 WHERE movement_id=$2',
        [JSON.stringify({...f.snapshot,...conflict}),f.movement]);
      expect((await proposal(f)).status).toBe(409);
      expect((await refund(f)).allocation_id).toBeNull();
    }
  });
  it('rejects the wrong saved reference and invalid historical quantities without correcting them',async()=>{
    const f=await fixture();
    expect((await proposal(f,{sale_reference:'another-invoice'})).status).toBe(409);
    for(const quantity of [0,1.5,5])expect((await proposal(await fixture({quantity}))).status).toBe(409);
  });
  it('rechecks changed request and original financial evidence at GM approval',async()=>{
    const f=await fixture(),p=(await proposal(f)).body.proposal;
    await query('UPDATE branch_refund_requests SET quantity=1 WHERE id=$1',[f.id]);
    expect((await review(f,p)).status).toBe(409);
    const g=await fixture(),q=(await proposal(g)).body.proposal;
    await query(`UPDATE stock_sale_allocations SET snapshot=jsonb_set(snapshot,'{revenue_unit}','99') WHERE movement_id=$1`,[g.movement]);
    expect((await review(g,q)).status).toBe(409);
  });
  it('shares pending/approved allocation caps with new returns and serializes competing historical links',async()=>{
    const f=await fixture({quantity:3,reference:false}),p=(await proposal(f)).body.proposal;
    const secondId=`${f.id}-second`;
    await query(`INSERT INTO branch_refund_requests(id,branch_id,product_name,batch_no,quantity,unit_price,refund_amount,reason,status,requested_by)
      SELECT $1,branch_id,product_name,batch_no,3,unit_price,refund_amount,reason,status,requested_by
      FROM branch_refund_requests WHERE id=$2`,[secondId,f.id]);
    const g={...f,id:secondId},q=(await proposal(g)).body.proposal;
    const results=await Promise.all([review(f,p),review(g,q)]);
    expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    const fresh=await call({allocation_id:f.movement,quantity:2,reason:'Another physical return',physical_return_confirmed:true,
      operation_key:`${f.id}-fresh`},{id:`${prefix}-dispenser`,role:'dispenser',branch},'POST','/api/branch/refund-requests',branchRefund);
    expect(fresh.status).toBe(409);
  });
  it('conservatively counts already-approved unlinked lot refunds with a missing sale reference',async()=>{
    const f=await fixture({quantity:2});
    await query(`INSERT INTO branch_refund_requests(id,branch_id,product_name,batch_no,quantity,unit_price,refund_amount,reason,status,requested_by)
      SELECT $1,branch_id,product_name,batch_no,3,unit_price,refund_amount,reason,'approved',requested_by
      FROM branch_refund_requests WHERE id=$2`,[`${f.id}-old-approved`,f.id]);
    expect((await proposal(f)).status).toBe(409);
    expect((await refund(f)).allocation_id).toBeNull();
  });
  it('requires separate physical inspection after GM linking and uses frozen charged price instead of legacy requested price',async()=>{
    const f=await fixture({quantity:1}),p=(await proposal(f)).body.proposal;
    await review(f,p);
    const body={id:f.id,action:'approve',return_condition:'quarantine',inspection_reason:'Actually inspected received goods'};
    expect((await call(body)).status).toBe(400);
    const approved=await call({...body,physical_return_confirmed:true});
    expect(approved.body.error).toBeUndefined();
    expect(approved.status).toBe(200);
    const result=await refund(f);
    expect(result.status).toBe('approved');
    expect(result.physical_return_confirmed).toBe(true);
    expect(Number(result.refund_amount)).toBe(12.5);
    expect((await call({...body,physical_return_confirmed:true})).status).toBe(409);
  });
});
