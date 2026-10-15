import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fixture,capture} from './final-release-fixture-probe.mjs';
import {releaseEvidenceRoot as root} from './release-evidence-paths.mjs';
import {businessToday} from '../shared/price-list-import.js';
const {m,db}=await fixture(),password=JSON.parse(await readFile(m.authFile,'utf8')).password;
const report={status:'RUNNING',method:'Supported application HTTP actions with actual synthetic staff sessions; not rendered workflow proof',product:'QA-TRANSFER-ITEM',steps:[]};
const product=report.product,lot='QA-TRANSFER-LOT',expiry='2035-12-31',save=()=>writeFile(root+'/transfer-document-evidence/lifecycle.json',JSON.stringify(report,null,2));
async function login(username){
  const r=await fetch(m.frontend+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  assert.equal(r.status,200);
  return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
}
async function action(cookie,path,method,body,expected=[200]){
  const before=await capture(db);
  const r=await fetch(m.frontend+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const text=await r.text();let response;try{response=JSON.parse(text);}catch{response={error:text.slice(0,500)};}
  report.steps.push({path,method,body,status:r.status,response,before,after:await capture(db)});await save();
  assert(expected.includes(r.status),`${method} ${path}: ${r.status} ${JSON.stringify(response)}`);
  return response;
}
async function balance(){
  return {
    central:(await db.query('SELECT location,description,remaining_quantity,dispatched_quantity FROM stock_batches WHERE description=$1 ORDER BY id',[product])).rows,
    branch:(await db.query('SELECT branch_id,product_name,quantity FROM branch_inventory_batches WHERE product_name=$1 ORDER BY id',[product])).rows,
    movements:(await db.query('SELECT reference_id,movement_type,quantity,status FROM stock_movements WHERE product_name=$1 ORDER BY created_at,id',[product])).rows
  };
}
try{
  const stock=await login('ui_stock'),gm=await login('ui_gm'),branch=await login('ui_branch_a');
  report.before=await balance();assert.equal(report.before.central.length,0);assert.equal(report.before.branch.length,0);await save();
  await action(gm,'/api/prices/bulk-import','POST',{products:[{description:product,product_code:'QATRANSFER',dp:7,cp:9,cif:2,bv:0}],effective_from:businessToday()});
  await action(stock,'/api/stock/product-packs','PUT',{productName:product,baseUnit:'unit',packs:[{unit:'unit',factor:1}]});
  const receipt={receiptKey:'OPERATIONAL-100-RECEIPT',supplierId:'SYNTHETIC-SUPPLIER',
    items:[{productName:product,quantity:100,enteredUnit:'unit',batchNo:lot,expiryDate:expiry,unitCIF:2,unitDP:7}]};
  await action(stock,'/api/stock/import/receive','POST',receipt,[201]);
  const receiptBalance=await balance();
  await action(stock,'/api/stock/import/receive','POST',receipt,[200,201]);
  assert.deepEqual(await balance(),receiptBalance);
  async function transfer(from,to,qty){
    const result=await action(stock,'/api/stock/transfers','POST',{fromWarehouse:from,toBranch:to,status:'prepared',
      items:[{productName:product,batchNo:lot,expiryDate:expiry,quantity:qty}]},[201]);
    const row=(await db.query(`SELECT id FROM stock_transfers WHERE from_warehouse=$1 AND to_branch=$2 ORDER BY created_at DESC LIMIT 1`,[from,to])).rows[0];
    assert(row);await action(gm,'/api/stock/transfers','PATCH',{id:row.id,status:'approved',gmAction:'approve'});
    return row.id;
  }
  const warehouseTransfer=await transfer('country_stock','windhoek_warehouse',100);
  await action(stock,'/api/stock/warehouses/receive-stock','POST',{transferId:warehouseTransfer,action:'accept'});
  const branchTransfer=await transfer('windhoek_warehouse','townshop',30);
  await action(stock,'/api/stock/transfers','PATCH',{id:branchTransfer,status:'dispatched'});
  const dispatched=await balance();
  await action(stock,'/api/stock/transfers','PATCH',{id:branchTransfer,status:'dispatched'});
  assert.deepEqual(await balance(),dispatched);
  await action(branch,'/api/stock/transfers','PATCH',{id:branchTransfer,status:'received',
    items:[{productName:product,batchNo:lot,expiryDate:expiry,quantityReceived:31}]},[422,409,400]);
  assert.deepEqual(await balance(),dispatched);
  const receive={id:branchTransfer,status:'received',items:[{productName:product,batchNo:lot,expiryDate:expiry,quantityReceived:30}]};
  await action(branch,'/api/stock/transfers','PATCH',receive);
  const received=await balance();
  await action(branch,'/api/stock/transfers','PATCH',receive,[200,409,400]);
  assert.deepEqual(await balance(),received);
  await action(branch,'/api/branch/walkin-sales','POST',{id:'OPERATIONAL-TRANSFER-SALE',branch:'townshop',
    customerType:'non_member',customerName:'QA transfer customer',paymentMethod:'cash',
    products:[{name:product,quantity:2,unitPrice:9,dpPrice:7}],subtotal:18,total:18,offline_id:'OPERATIONAL-TRANSFER-SALE'},[201]);
  report.after=await balance();report.references={warehouseTransfer,branchTransfer,sale:'OPERATIONAL-TRANSFER-SALE'};
  assert.equal(report.after.branch.reduce((n,r)=>n+Number(r.quantity),0),28);
  assert.equal(report.after.central.filter(r=>r.location==='windhoek_warehouse').reduce((n,r)=>n+Number(r.remaining_quantity),0),70);
  report.status='PASS';report.limits='Full30-unit dispatch/receipt of100-unit import; partial-dispatch/partial-receipt path and rendered transfer documents still require separate evidence.';
  await save();
}catch(error){report.status='FAIL';report.error=error.message;report.observed=await balance().catch(()=>null);await save();process.exitCode=1;}
finally{await db.end();}
console.log(JSON.stringify({status:report.status,error:report.error,references:report.references}));
