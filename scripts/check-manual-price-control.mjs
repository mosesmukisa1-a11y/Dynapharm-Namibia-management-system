import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fixture,capture} from './final-release-fixture-probe.mjs';
import {releaseEvidenceRoot as dir} from './release-evidence-paths.mjs';
import {businessToday} from '../shared/price-list-import.js';
const {m,db}=await fixture(),password=JSON.parse(await readFile(m.authFile,'utf8')).password;
const report={status:'RUNNING',method:'Actual staff-session HTTP control probe; due schedule is fresh synthetic fixture setup, not proof of a rendered approval workflow',actions:[]};
const save=()=>writeFile(dir+'/manual-price-control.json',JSON.stringify(report,null,2));
const base=m.frontend,product={description:'RELEASE MANUAL PRICE CONTROL',product_code:'REL-PRICE-CONTROL',dp:101,cp:151,cif:23,bv:0};
async function login(username){
 const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
 assert.equal(response.status,200);
 return response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
}
async function post(cookie,body){
 const response=await fetch(base+'/api/prices/bulk-import',{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 const json=await response.json();
 report.actions.push({action:body.products?.[0]?.dp===101?'base catalogue setup':'scoped immediate re-import',endpoint:'/api/prices/bulk-import',status:response.status,body:json});await save();
 return response;
}
try{
 const gm=await login('ui_gm'),branch=await login('ui_branch_b'),day=businessToday();
 const actor=(await db.query("SELECT full_name FROM users WHERE username='ui_gm'")).rows[0].full_name || 'ui_gm';
 assert.equal((await db.query('SELECT id FROM product_prices WHERE product_code=$1',[product.product_code])).rowCount,0,'Fresh synthetic price control already exists; refusing to overwrite it');
 const initial={products:[product],effective_from:day,changed_by:'CLIENT_FORGED_ACTOR'};
 assert.equal((await post(null,initial)).status,401);
 assert.equal((await post(branch,initial)).status,403);
 assert.equal((await post(gm,initial)).status,200);
 const row=(await db.query('SELECT * FROM product_prices WHERE product_code=$1',[product.product_code])).rows[0];
 assert(row);assert.equal(row.updated_by,actor);
 // A seeded due schedule lets the existing import API be tested without changing server time
 // or altering any real or previously recorded schedule.
 const due=(await db.query(`INSERT INTO product_price_history(product_id,description,
 old_dp,old_cp,old_cif,old_bv,new_dp,new_cp,new_cif,new_bv,changed_by,effective_from,status)
 VALUES($1,$2,101,151,23,0,211,251,23,0,'ui_gm',$3,'pending') RETURNING id`,
 [row.id,product.description,day])).rows[0];
 report.seededDue={id:due.id,productId:row.id,effectiveDate:day,scope:'Synthetic company pricebook entry only',approvalEvidence:'Fixture-seeded; not a real human acceptance'};
 report.before=await capture(db);await save();
 const changed={products:[{...product,dp:211,cp:251}],effective_from:day,changed_by:'CLIENT_FORGED_ACTOR'};
 assert.equal((await post(gm,changed)).status,200);
 const state=async()=>({
  live:(await db.query('SELECT id,product_code,dp,cp,updated_by FROM product_prices WHERE id=$1',[row.id])).rows[0],
  history:(await db.query('SELECT id,status,effective_from,changed_by,new_dp,new_cp FROM product_price_history WHERE product_id=$1 ORDER BY id',[row.id])).rows
 });
 report.afterImport=await state();
 assert.equal(Number(report.afterImport.live.dp),211);assert.equal(report.afterImport.live.updated_by,actor);
 assert.equal((await post(gm,changed)).status,200);
 report.afterRetry=await state();assert.deepEqual(report.afterRetry,report.afterImport);
 report.after=await capture(db);
 for(const [table,fp] of Object.entries(report.before.fingerprint)){
  if(table!=='product_price_history')assert.deepEqual(report.after.fingerprint[table],fp,table+' changed outside price scope');
 }
 assert.deepEqual(report.after.stock,report.before.stock);
 const remaining=report.afterRetry.history.find(x=>x.id===due.id);
 report.status=remaining?.status==='pending'?'BLOCKED':'NOT VERIFIED';
 report.conclusion=remaining?.status==='pending'
  ? 'Immediate re-import is idempotent but leaves the original due schedule pending; it is not an exactly-once activation control. Broad later activation may replay the old schedule. Do not substitute this procedure or enable the quarantined job.'
  : 'This probe alone does not establish complete future/due activation, durable approval and rendered staff operating acceptance.';
 await save();
}catch(error){report.status='FAIL';report.error=error.message;report.observed=await capture(db).catch(()=>null);await save();process.exitCode=1;}
finally{await db.end();}
console.log(JSON.stringify({status:report.status,conclusion:report.conclusion,error:report.error}));
