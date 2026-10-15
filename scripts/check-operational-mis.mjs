import {fixture,capture} from './final-release-fixture-probe.mjs';
import {releaseEvidenceRoot as root} from './release-evidence-paths.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {businessToday} from '../shared/price-list-import.js';
const {m,db}=await fixture(),password=JSON.parse(await readFile(m.authFile,'utf8')).password,day=businessToday();
const report={status:'RUNNING',method:'Native authenticated staff-session MIS HTTP reconciliation after current fixture transactions; rendered workflow/export evidence recorded separately',requests:[]};
const save=()=>writeFile(root+'/mis-evidence/api-reconciliation.json',JSON.stringify(report,null,2));
async function login(username){
 const r=await fetch(m.frontend+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});assert.equal(r.status,200);
 return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
}
async function get(cookie,path,expected=200){
 const r=await fetch(m.frontend+path,{headers:cookie?{Cookie:cookie}:{}}),body=await r.json();
 report.requests.push({path,status:r.status,mime:r.headers.get('content-type'),body});await save();
 assert.equal(r.status,expected,`${path} ${JSON.stringify(body)}`);return body;
}
try{
 const mis=await login('ui_mis'),branch=await login('ui_branch_b');
 report.before=await capture(db);
 const gm=await login('ui_gm');
 const retry=await fetch(m.frontend+'/api/prices/manual-schedules/1/compensate',{method:'POST',
   headers:{Cookie:gm,'Content-Type':'application/json'},body:JSON.stringify({scope:'global',
     approvalReference:'QA-GM-COMPENSATE-001',confirmApproval:true,actor_id:'FORGED-NOT-TRUSTED'})});
 const retryBody=await retry.json();
 report.compensationRetry={endpoint:'/api/prices/manual-schedules/1/compensate',status:retry.status,body:retryBody,method:'Actual same staff session HTTP replay after rendered compensation; NOT a second browser button click'};
 await save();assert.equal(retry.status,200);assert.equal(retryBody.replayed,true);
 assert.equal(retryBody.audit.actor_id,'UI-GM');
 await get(null,'/api/mis/receipts?date='+day,401);
 await get(branch,'/api/mis/stock-report?start='+day+'&end='+day,403);
 await get(mis,'/api/mis/receipts?start=2026-02-30&end=2026-03-01',422);
 const exact=await get(mis,`/api/mis/stock-report?start=${day}&end=${day}&branch=townshop`);
 const prior=new Date(new Date(day+'T00:00:00+02:00').getTime()).toISOString();
 const next=new Date(new Date(day+'T00:00:00+02:00').getTime()+86400000).toISOString();
 const zoned=await get(mis,`/api/mis/stock-report?start=${encodeURIComponent(prior)}&end=${encodeURIComponent(next)}&branch=townshop`);
 assert.equal(typeof exact.summary.sales,'number');
 assert.equal(zoned.summary.sales,exact.summary.sales);
 report.range={day,startInclusive:prior,endExclusive:next,timezone:'Africa/Windhoek',
   limitation:'Same existing sale set; actual just-before/after midnight fixtures are isolated DB test evidence, not new browser-created late-night sales.'};
 const receipts=await get(mis,`/api/mis/receipts?start=${day}&end=${day}&branch=townshop`);
 const expected=report.before.sales.reduce((sum,s)=>sum+Number(s.data.total||0),0);
 assert.equal(receipts.totals.customerChargedAmount,expected);
 assert.equal(receipts.totals.prescriptionDPAmount,0);
 const ids=new Set(receipts.receipts.map(r=>r.id));
 assert.equal(ids.size,report.before.sales.length);
 assert(receipts.receipts.every(r=>r.amountBasis==='original_customer_charge'&&r.businessDate===day));
 const original=receipts.receipts.find(r=>r.receiptNumber==='TW-2026-000001');
 assert.equal(original.total,443);assert.equal(original.customerName,'QA CSV, \"Quoted\"');
 const scoped=await get(mis,`/api/mis/receipts?start=${day}&end=${day}&branch=swakopmund`);
 assert.equal(scoped.receipts.length,0);
 const encoded=await get(mis,'/api/mis/encoded-sales');
 report.encodedScope={response:encoded,note:'Manually encoded records are a separate workflow; an empty result does not invalidate operational receipts.'};
 report.after=await capture(db);assert.deepEqual(report.after.fingerprint,report.before.fingerprint);
 report.status='PASS';report.customerCharges=expected;await save();
}catch(e){report.status='FAIL';report.error=e.message;report.observed=await capture(db).catch(()=>null);await save();process.exitCode=1;}
finally{await db.end();}
console.log(JSON.stringify({status:report.status,error:report.error,customerCharges:report.customerCharges}));
