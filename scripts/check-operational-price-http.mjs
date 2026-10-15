import {fixture,capture} from './final-release-fixture-probe.mjs';
import {releaseEvidenceRoot as root} from './release-evidence-paths.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {m,db}=await fixture(),password=JSON.parse(await readFile(m.authFile,'utf8')).password;
const report={status:'RUNNING',method:'Native staff-session HTTP tests after actual rendered GM activation; not a second browser sale acknowledgement claim',actions:[]};
const save=()=>writeFile(root+'/scheduled-price-http.json',JSON.stringify(report,null,2));
async function login(username){
 const r=await fetch(m.frontend+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});assert.equal(r.status,200);
 return r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
}
async function request(cookie,path,method='GET',body){
 const r=await fetch(m.frontend+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json();report.actions.push({path,method,status:r.status,data});await save();return {status:r.status,data};
}
try{
 const gm=await login('ui_gm'),branch=await login('ui_branch_a');
 report.before=await capture(db);await save();
 assert.equal((await request(null,'/api/prices/manual-schedules')).status,401);
 assert.equal((await request(branch,'/api/prices/manual-schedules')).status,403);
 const input={scope:'global',confirmApproval:true,approvalReference:'QA-GM-BROWSER-001',changed_by:'FORGED-CLIENT-ACTOR'};
 assert.equal((await request(branch,'/api/prices/manual-schedules/1/activate','POST',input)).status,403);
 const replay=await request(gm,'/api/prices/manual-schedules/1/activate','POST',input);
 assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);assert.equal(replay.data.audit.actor_id,'UI-GM');
 assert.equal((await db.query("SELECT dp FROM product_prices WHERE product_code='TEST-ITEM'")).rows[0].dp,'351.00');
 const candidates=(await db.query("SELECT id,data FROM branch_walkin_sales WHERE id<>'OPERATIONAL-NEW-PRICE'")).rows
   .filter(s=>(s.data.items||s.data.products||[]).some(i=>(i.product_name||i.name)==='TEST-ITEM'));
 assert.equal(candidates.length,1,'Exactly one earlier TEST-ITEM browser sale required in fresh fixture');
 report.originalSale=candidates[0];
 assert(report.originalSale,'Expected earlier real browser sale identity');
 assert.equal(Number(report.originalSale.data.items[0].dpPrice),341);
 const sale={id:'OPERATIONAL-NEW-PRICE',offline_id:'OPERATIONAL-NEW-PRICE',branch:'townshop',customerType:'non_member',
  customerName:'QA new price',paymentMethod:'cash',products:[{name:'TEST-ITEM',quantity:1,unitPrice:453,dpPrice:999}],subtotal:453,total:453};
 const posted=await request(branch,'/api/branch/walkin-sales','POST',sale);assert([200,201].includes(posted.status));
 report.createdInThisRun=posted.status===201;
 const movements=(await db.query("SELECT * FROM stock_movements WHERE reference_id='OPERATIONAL-NEW-PRICE'")).rows;
 assert.equal(movements.length,1);
 assert.equal(Number(movements[0].metadata.sale_evidence.dp_unit_price),351);
 assert.equal(Number(movements[0].metadata.sale_evidence.original_received_dpc),341);
 assert.equal(Number(movements[0].unit_dp),341);
 report.basis={chargedSaleDP:351,originalReceivedDPC:341,chargedCP:453,originalReceivedCIF:23,
   note:'Inventory unit_dp remains original received DPC, not today’s transaction DP. Never force these to match.'};
 const committed=await capture(db);
 assert.equal((await request(branch,'/api/branch/walkin-sales','POST',sale)).status,200);
 assert.deepEqual((await capture(db)).fingerprint,committed.fingerprint);
 report.originalAfter=(await db.query('SELECT id,data FROM branch_walkin_sales WHERE id=$1',[report.originalSale.id])).rows[0];
 assert.deepEqual(report.originalAfter,report.originalSale);
 report.after=await capture(db);report.status='PASS';report.compensation='Pending rendered GM compensation; do not claim accepted operating procedure';await save();
}catch(e){report.status='FAIL';report.error=e.message;report.observed=await capture(db).catch(()=>null);await save();process.exitCode=1;}
finally{await db.end();}
console.log(JSON.stringify({status:report.status,error:report.error}));
