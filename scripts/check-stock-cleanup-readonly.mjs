// A deliberately fixed disposable target. No configurable production URL, business writes or database access.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base='http://127.0.0.1:3003/api', checks=[];
const digest=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
async function login(username){
  const response=await fetch(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username,password:'DisposableStockUi-2026!'})});
  if(!response.ok)throw Error(`Synthetic login failed (${response.status})`);
  const cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const me=await fetch(`${base}/auth/me`,{headers:{cookie}}), actor=await me.json();
  if(!(actor.user || actor).username?.startsWith('ui_'))throw Error('Not the disposable synthetic staff environment');
  return cookie;
}
async function read(cookie,path,expected=200){
  const response=await fetch(`${base}${path}`,{headers:{cookie}});
  const data=await response.json();
  checks.push({method:'GET',endpoint:`/api${path}`,status:response.status,expected,
    result:response.status===expected?'PASS':'FAIL',
    error:response.ok ? null : data.error || data.message || 'Unspecified error'});
  return data;
}
const stock=await login('ui_stock');
const watched=['/stock-movements?limit=1000','/stock-batches','/branch/inventory?branch=townshop'];
const before=await Promise.all(watched.map(path=>read(stock,path)));
for(const path of ['/stock/current-overview','/stock/valuation','/stock/cost-report','/stock/ai-reorder',
  '/stock-movements?date_from=2026-10-14&date_to=2026-10-14&product_name=TEST&batch_no=QA&type=sale',
  '/stock-movements?location=windhoek_warehouse&date_from=2026-10-14&date_to=2026-10-14']){
  await read(stock,path);
}
for(const term of ['TU-2026-000122','WALK-1791966024927-UDFO','QA-20261014-001','TRF-1791971012005-B2ZFQ4']){
  await read(stock,`/stock-movements?search=${encodeURIComponent(term)}`);
  const data=await read(stock,`/stock/trace?search=${encodeURIComponent(term)}`);
  if(data.success)checks.push({endpoint:`/api/stock/trace?search=${term}`,result:Array.isArray(data.events)&&data.events.length===0?'PASS':'FAIL',
    assertion:'Empty disposable fixture has no matching documents; says nothing about live references'});
}
const branch=await login('ui_branch_a');
await read(branch,'/stock/trace?search=QA-TEST&branch=townshop');
await read(branch,'/stock/trace?search=QA-TEST&branch=swakopmund',403);
await read(branch,'/stock-movements?branch=swakopmund',403);
const after=await Promise.all(watched.map(path=>read(stock,path)));
const baseline=watched.map((path,index)=>({endpoint:`/api${path}`,before:digest(before[index]),after:digest(after[index]),
  result:digest(before[index])===digest(after[index])?'PASS':'FAIL'}));
await mkdir('generated-artifacts/stock-cleanup',{recursive:true});
await writeFile('generated-artifacts/stock-cleanup/http-checks.json',JSON.stringify({
  recordedAt:new Date().toISOString(),target:'Disposable localhost:3003 only',checks,baseline,
  limitation:'Empty synthetic fixture, GET-only stock evidence. Staff auth login is the only POST. No sales, imports, transfers, write-offs or counts.',
},null,2));
console.log(JSON.stringify({checks:checks.length,failed:checks.filter(row=>row.result==='FAIL'),baseline},null,2));
if(checks.some(row=>row.result==='FAIL') || baseline.some(row=>row.result==='FAIL'))process.exitCode=1;
