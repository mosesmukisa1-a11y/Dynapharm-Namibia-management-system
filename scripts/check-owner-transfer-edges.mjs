import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fixture} from './final-release-fixture-probe.mjs';
import {releaseEvidenceRoot as root} from './release-evidence-paths.mjs';
const {m,db}=await fixture();
const password=JSON.parse(await readFile(m.authFile,'utf8')).password;
const product='QA-TRANSFER-ITEM',lot='QA-TRANSFER-LOT',expiry='2035-12-31';
const report={status:'RUNNING',method:'Fresh synthetic staff session HTTP; not rendered transfer workflow evidence',steps:[]};
const save=()=>writeFile(root+'/transfer-edges.json',JSON.stringify(report,null,2));
async function state(){
  const output={};
  for(const [key,sql] of Object.entries({
    central:"SELECT id,location,remaining_quantity,dispatched_quantity FROM stock_batches WHERE description=$1 ORDER BY id",
    branch:"SELECT id,branch_id,quantity FROM branch_inventory_batches WHERE product_name=$1 ORDER BY id",
    movements:"SELECT id,reference_id,movement_type,quantity,status FROM stock_movements WHERE product_name=$1 ORDER BY id",
    items:"SELECT transfer_id,quantity,quantity_approved,quantity_received FROM stock_transfer_items WHERE product_name=$1 ORDER BY transfer_id,id"
  }))output[key]=(await db.query(sql,[product])).rows;
  return output;
}
async function login(username){
  const r=await fetch(m.frontend+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  assert.equal(r.status,200);return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
}
async function action(cookie,body,expected=[200],method='PATCH'){
  const before=await state();
  const r=await fetch(m.frontend+'/api/stock/transfers',{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const response=await r.json();
  const result={body,status:r.status,response,before,after:await state()};
  report.steps.push(result);await save();
  assert(expected.includes(r.status),`Expected ${expected}, got ${r.status}: ${JSON.stringify(response)}`);
  return result;
}
try{
  const stock=await login('ui_stock'),gm=await login('ui_gm'),branch=await login('ui_branch_a');
  const made=await action(stock,{fromWarehouse:'windhoek_warehouse',toBranch:'townshop',status:'prepared',
    items:[{productName:product,batchNo:lot,expiryDate:expiry,quantity:15}]},[201],'POST');
  const id=made.response.transfer?.id;
  assert(id,'Transfer ID missing');
  report.transferId=id;
  await action(gm,{id,status:'approved',gmAction:'approve',
    items:[{productName:product,batchNo:lot,expiryDate:expiry,quantity:15,quantityApproved:10}]});
  const approved=await state();
  await action(stock,{id,status:'dispatched',
    items:[{productName:product,batchNo:lot,expiryDate:expiry,quantity:15,quantityApproved:11}]},[400,403,409,422]);
  assert.deepEqual(await state(),approved,'Rejected over-dispatch changed stock or allocation');
  await action(stock,{id,status:'dispatched'});
  const dispatched=await state();
  const excessive=await action(branch,{id,status:'received',items:[{productName:product,batchNo:lot,expiryDate:expiry,quantityReceived:11}]},[400,409,422]);
  assert.match(excessive.response.error,/exceed|dispatch|approved|sent/i,'Expected an actual quantity bound rejection');
  assert.deepEqual(await state(),dispatched,'Over-receipt changed balances');
  for(const total of [4,7,10]){
    await action(branch,{id,status:total===10?'received':'partially_received',
      items:[{productName:product,batchNo:lot,expiryDate:expiry,quantityReceived:total}]});
    const after=await state();
    const received=after.items.find(i=>i.transfer_id===id);
    assert.equal(Number(received.quantity_received),total);
    report.steps.at(-1).cumulativeReceived=total;await save();
  }
  const completed=await state();
  await action(branch,{id,status:'received',items:[{productName:product,batchNo:lot,expiryDate:expiry,quantityReceived:10}]},[400,409]);
  assert.deepEqual(await state(),completed,'Receipt retry deducted or received twice');
  report.status='PASS';
  report.limit='Approved 10 of requested 15, dispatched once, cumulative receipt 4→7→10. No claim of repeated physical dispatch tranches: endpoint has one dispatch transition.';
}catch(error){report.status='FAIL';report.error=error.message;report.observed=await state().catch(()=>null);process.exitCode=1;}
finally{await save();await db.end();}
console.log(JSON.stringify({status:report.status,error:report.error,transferId:report.transferId}));
