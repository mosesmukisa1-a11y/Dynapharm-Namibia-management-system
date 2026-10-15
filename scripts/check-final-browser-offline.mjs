import {chromium} from 'playwright';
import {fixture,capture} from './final-release-fixture-probe.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const {m,db}=await fixture(),dir='generated-artifacts/final-release-gate/browser-evidence';
const report={status:'RUNNING',method:'Actual browser offline mode, real client queue and real authenticated sync; not an offline form-entry UI assertion',stages:[]};
const save=()=>writeFile(dir+'/genuine-offline-replay.json',JSON.stringify(report,null,2));
await mkdir(dir,{recursive:true});await save();
const browser=await chromium.launch({headless:true,executablePath:'/repl/tools/bin/chromium',args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const password=JSON.parse(await readFile(m.authFile,'utf8')).password;
 const login=await context.request.post(m.frontend+'/api/auth/login',{data:{username:'ui_branch_a',password}});
 assert.equal(login.status(),200);
 const page=await context.newPage();await page.goto(m.frontend+'/branch',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{window.auditQueue=await import('/src/lib/offlineQueue.js');});
 report.before=await capture(db);
 const id='FINAL-OFFLINE-'+randomUUID();report.id=id;
 const payload={id,offline_id:id,saleNumber:id,branch:'townshop',customerType:'non_member',
 customerName:'Synthetic offline',products:[{name:'TEST-ITEM',quantity:1,unit_price:443,dpPrice:999}],subtotal:443,total:443};
 await context.setOffline(true);assert.equal(await page.evaluate(()=>navigator.onLine),false);
 const failed=await page.evaluate(async()=>{try{await fetch('/api/health');return false;}catch{return true;}});
 assert(failed,'real browser fetch must fail while offline');
 await page.evaluate(async({id,payload})=>{await window.auditQueue.enqueue({type:'walkin_sale',url:'/api/branch/walkin-sales',method:'POST',body:payload,offlineId:id});},{id,payload});
 report.queued=await capture(db);assert.deepEqual(report.queued.fingerprint,report.before.fingerprint);
 await page.screenshot({path:dir+'/genuine-offline-queued.jpg',fullPage:true});await save();
 let intercepted=false;
 await context.route('**/api/sync/batch',async route=>{
  if(intercepted)return route.continue();intercepted=true;
  const response=await route.fetch();report.lostAcknowledgment={endpoint:'/api/sync/batch',status:response.status(),body:await response.json()};
  report.afterCommitBeforeAcknowledgment=await capture(db);await save();
  await context.setOffline(true);await route.abort('connectionreset');
 });
 await context.setOffline(false);
 await page.waitForFunction(()=>navigator.onLine===false,{},{timeout:30000});
 await page.waitForFunction(async()=> (await window.auditQueue.getPendingOnly()).length>0,{},{timeout:15000});
 const retry=page.waitForResponse(r=>r.url().includes('/api/sync/batch')&&r.request().method()==='POST',{timeout:30000});
 await context.setOffline(false);const response=await retry;
 report.replay={endpoint:'/api/sync/batch',status:response.status(),body:await response.json()};
 await page.waitForFunction(async()=> (await window.auditQueue.getPendingOnly()).length===0,{},{timeout:30000});
 report.after=await capture(db);
 assert.deepEqual(report.after.fingerprint,report.afterCommitBeforeAcknowledgment.fingerprint);
 const rows=await db.query('SELECT COUNT(*)::int AS count FROM branch_walkin_sales WHERE id=$1 OR offline_id=$1',[id]);
 assert.equal(rows.rows[0].count,1);
 const stock=s=>Number(s.stock.find(r=>r.branch_id==='townshop'&&r.product_name==='TEST-ITEM')?.quantity||0);
 assert.equal(stock(report.after),stock(report.before)-1);
 await page.screenshot({path:dir+'/genuine-offline-reconnected.jpg',fullPage:true});
 report.status='PASS';await save();
}catch(error){report.status='FAIL';report.error=error.message;report.observed=await capture(db).catch(()=>null);await save();process.exitCode=1;}
finally{await browser.close();await db.end();}
console.log(JSON.stringify({status:report.status,error:report.error}));
