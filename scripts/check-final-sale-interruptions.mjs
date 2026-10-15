import {fixture,capture} from './final-release-fixture-probe.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import assert from 'node:assert/strict';
const dir='generated-artifacts/final-release-gate';
const {m,db}=await fixture(),origin=`http://127.0.0.1:${m.backendPort}`;
const password=JSON.parse(await readFile(m.authFile,'utf8')).password;
const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({username:'ui_branch_a',password})});
assert.equal(login.status,200);
const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
const results=[];
const units=s=>Number(s.stock.find(r=>r.branch_id==='townshop'&&r.product_name==='TEST-ITEM')?.quantity||0);
const body=id=>({id,saleNumber:id,branch:'townshop',customerType:'non_member',subtotal:443,total:443,
 products:[{product_name:'TEST-ITEM',quantity:1,dp:999,unit_price:443}]});
async function post(id,target=origin){
 try{const response=await fetch(target+'/api/branch/walkin-sales',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body(id)),signal:AbortSignal.timeout(20000)});
 return {status:response.status,body:await response.json()};}
 catch(e){return {status:null,error:e.name+': '+e.message};}
}
async function persist(){await mkdir(dir,{recursive:true});await writeFile(dir+'/interruption-results.json',JSON.stringify({isolated:true,actualApplication:'server.js',results},null,2));}
async function verify(id,before,after){
 assert.equal(units(after),units(before)-1,'exactly one stock deduction');
 assert.equal(after.sales.filter(r=>r.id===id).length,1,'exactly one sale');
 const movements=after.movements.filter(r=>r.reference_id===id);
 assert.equal(movements.length,1,'exactly one movement');
 assert.equal(Number(movements[0].metadata.sale_evidence.dp_unit_price),341);
 assert.equal(Number(movements[0].metadata.sale_evidence.charged_unit_price),443);
 assert.equal(Number(movements[0].metadata.sale_evidence.original_received_cost),23);
 assert.equal(after.fingerprint.stock_requests.count,before.fingerprint.stock_requests.count);
 assert.equal(after.fingerprint.stock_sale_allocations.count,before.fingerprint.stock_sale_allocations.count+1,'exactly one financial allocation');
}
async function ownPid(pid,expected){
 if(!Number.isSafeInteger(pid)||pid<2)throw Error('Invalid owned process');
 const cmd=await readFile(`/proc/${pid}/cmdline`,'utf8');
 if(!cmd.includes(expected))throw Error('Owned process command mismatch');
}
async function waitFor(fn,label){
 for(let i=0;i<100;i++){const result=await fn();if(result)return result;await new Promise(r=>setTimeout(r,100));}
 throw Error('Timed out: '+label);
}
async function blockedSale(kind){
 const id='FINAL-'+randomUUID().slice(0,8)+'-'+kind,before=await capture(db);
 const stage={kind,id,action:'POST /api/branch/walkin-sales',before,status:'RUNNING'};results.push(stage);await persist();
 const blocker=await db.connect();let pending;
 try{
 await blocker.query('SELECT pg_advisory_lock(77220155)');
 await db.query(`CREATE OR REPLACE FUNCTION public.final_release_wait() RETURNS trigger LANGUAGE plpgsql AS
 $$BEGIN PERFORM pg_advisory_xact_lock(77220155); RETURN NEW; END$$`);
 await db.query(`CREATE TRIGGER final_release_wait BEFORE INSERT ON branch_walkin_sales FOR EACH ROW
 WHEN(NEW.id='${id}') EXECUTE FUNCTION public.final_release_wait()`);
 pending=post(id);
 const pid=await waitFor(async()=>{const r=await db.query(`SELECT pid FROM pg_stat_activity
 WHERE datname=current_database() AND wait_event='advisory' AND query ILIKE '%branch_walkin_sales%'`);return r.rows[0]?.pid;},'owned transaction waiting before COMMIT');
 stage.databasePid=pid;
 if(kind==='connection-before-commit'){
   stage.termination=(await db.query('SELECT pg_terminate_backend(pid,5000) stopped FROM pg_stat_activity WHERE pid=$1 AND datname=current_database()',[pid])).rows;
 }else{
   const manifest=JSON.parse(await readFile(dir+'/browser-evidence/environment.json','utf8'));
   await ownPid(manifest.backendPid,'server.js');await ownPid(manifest.harnessPid,'run-isolated-stock-ui.mjs');
   process.kill(manifest.backendPid,'SIGKILL');stage.terminatedApplicationPid=manifest.backendPid;
 }
 await blocker.query('SELECT pg_advisory_unlock(77220155)');
 stage.firstResponse=await pending;
 await waitFor(async()=>!(await db.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND datname=current_database()',[pid])).rowCount,'terminated session cleanup');
 stage.afterFailure=await capture(db);
 assert.deepEqual(stage.afterFailure.fingerprint,before.fingerprint,'pre-COMMIT failure must roll back all business records');
 if(kind==='process-termination'){
   process.kill(m.harnessPid,'SIGUSR2');
   await waitFor(async()=>{try{return (await fetch(origin+'/api/health')).ok;}catch{return false;}},'owned application restart');
 }
 await db.query('DROP TRIGGER final_release_wait ON branch_walkin_sales');
 await db.query('DROP FUNCTION public.final_release_wait()');
 stage.retry=await post(id);assert.equal(stage.retry.status,201);stage.after=await capture(db);await verify(id,before,stage.after);stage.status='PASS';
 }catch(e){stage.status='FAIL';stage.error=e.message;stage.observed=await capture(db);throw e;}
 finally{
  await blocker.query('SELECT pg_advisory_unlock(77220155)');blocker.release();
  await db.query('DROP TRIGGER IF EXISTS final_release_wait ON branch_walkin_sales');
  await db.query('DROP FUNCTION IF EXISTS public.final_release_wait()');await persist();
 }
}
try{
 await blockedSale('connection-before-commit');
 await blockedSale('process-termination');
 const id='FINAL-'+randomUUID().slice(0,8)+'-ACK',before=await capture(db);
 const stage={kind:'connection-after-commit-before-response',id,before,status:'RUNNING'};results.push(stage);await persist();
 const proxy=http.createServer((request,response)=>{
  const upstream=http.request(origin+request.url,{method:request.method,headers:request.headers},r=>{
   stage.upstreamStatus=r.statusCode;r.resume();r.on('end',()=>response.destroy());});
  upstream.on('error',()=>response.destroy());request.pipe(upstream);
 });
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 try{
 stage.firstResponse=await post(id,`http://127.0.0.1:${proxy.address().port}`);
 assert.equal(stage.upstreamStatus,201);assert.equal(stage.firstResponse.status,null);
 stage.afterUncertainResponse=await capture(db);await verify(id,before,stage.afterUncertainResponse);
 stage.retry=await post(id);assert.equal(stage.retry.status,200);stage.after=await capture(db);
 assert.deepEqual(stage.after.fingerprint,stage.afterUncertainResponse.fingerprint,'retry cannot create any second business record');stage.status='PASS';
 }catch(e){stage.status='FAIL';stage.error=e.message;throw e;}
 finally{proxy.closeAllConnections();await new Promise(r=>proxy.close(r));await persist();}
 const duplicate='FINAL-'+randomUUID().slice(0,8)+'-DOUBLE',initial=await capture(db);
 const twice={kind:'concurrent-duplicate-submission',id:duplicate,before:initial,status:'RUNNING'};results.push(twice);await persist();
 twice.responses=await Promise.all([post(duplicate),post(duplicate)]);twice.after=await capture(db);
 assert.deepEqual(twice.responses.map(r=>r.status).sort(),[200,201]);await verify(duplicate,initial,twice.after);twice.status='PASS';await persist();
 console.log(JSON.stringify({status:'PASS',stages:results.map(r=>({kind:r.kind,status:r.status,id:r.id}))}));
}catch(e){console.error('Isolated interruption verification failed:',e.message);process.exitCode=1;await persist();}
finally{await db.end();}
