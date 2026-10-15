import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {fixture} from './final-release-fixture-probe.mjs';
import {releaseEvidenceRoot as root} from './release-evidence-paths.mjs';
import {businessToday} from '../shared/price-list-import.js';
const {m,db}=await fixture(),password=JSON.parse(await readFile(m.authFile,'utf8')).password;
const report={status:'RUNNING',method:'Actual browser GM control with session login; two pages concurrently activate same history, then real server commit with browser response aborted and same-reference UI retry',stages:[]};
const save=()=>writeFile(root+'/price-browser-edges.json',JSON.stringify(report,null,2));
const browser=await chromium.launch({headless:true,executablePath:'/repl/tools/bin/chromium',args:['--no-sandbox']});
async function seed(label){
  const p=(await db.query(`INSERT INTO product_prices(description,product_code,dp,cp,cif,bv,updated_by)
    VALUES($1,$2,100,130,20,0,'isolated fixture') RETURNING id`,[label,label])).rows[0];
  const h=(await db.query(`INSERT INTO product_price_history(product_id,description,old_dp,old_cp,old_cif,old_bv,
    new_dp,new_cp,new_cif,new_bv,changed_by,effective_from,status)
    VALUES($1,$2,100,130,20,0,120,150,20,0,'isolated fixture',$3,'pending') RETURNING id`,[p.id,label,businessToday()])).rows[0];
  return {productId:p.id,historyId:h.id,label};
}
async function state(f){
  return {product:(await db.query('SELECT dp,cp,cif,bv,updated_by FROM product_prices WHERE id=$1',[f.productId])).rows[0],
    history:(await db.query('SELECT id,status FROM product_price_history WHERE id=$1',[f.historyId])).rows[0],
    actions:(await db.query('SELECT id,history_id,actor_id,approval_reference,action FROM manual_price_actions WHERE history_id=$1',[f.historyId])).rows};
}
async function pageFor(reference){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Africa/Windhoek'});
  const login=await ctx.request.post(m.frontend+'/api/auth/login',{data:{username:'ui_gm',password}});assert.equal(login.status(),200);
  const page=await ctx.newPage();await page.goto(m.frontend+'/gm');await page.waitForLoadState('networkidle');
  await page.getByRole('button',{name:'Price List',exact:false}).first().click();
  const section=page.getByRole('region',{name:'Manual scheduled price control'});
  await section.getByLabel('Price approval reference').fill(reference);
  await section.getByRole('checkbox').check();
  return {ctx,page,section};
}
try{
  const concurrent=await seed('OWNER-CONCURRENT-PRICE'),lost=await seed('OWNER-LOST-ACK-PRICE');
  report.fixtures={concurrent,lost};await save();
  const ref='OWNER-CONCURRENT-001';
  const a=await pageFor(ref),b=await pageFor(ref);
  const endpoint=`/api/prices/manual-schedules/${concurrent.historyId}/activate`;
  const waits=[a.page,b.page].map(page=>page.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().method()==='POST'));
  await Promise.all([a,b].map(({section})=>section.getByRole('button',{name:`Activate schedule ${concurrent.historyId}`,exact:true}).click()));
  const responses=await Promise.all(waits);
  const replies=await Promise.all(responses.map(async r=>({status:r.status(),body:await r.json()})));
  assert(replies.every(r=>r.status===200));assert.equal(replies.filter(r=>r.body.replayed===true).length,1);
  const after=await state(concurrent);assert.equal(after.actions.length,1);assert.equal(Number(after.product.dp),120);
  report.stages.push({name:'simultaneous rendered control clicks',endpoint,replies,after,status:'PASS'});
  await a.page.screenshot({path:root+'/price-concurrent.jpg',fullPage:true});await save();
  await a.ctx.close();await b.ctx.close();
  const c=await pageFor('OWNER-LOST-ACK-001');
  const lostEndpoint=`/api/prices/manual-schedules/${lost.historyId}/activate`;
  let committed;
  await c.page.route('**'+lostEndpoint,async route=>{
    const response=await route.fetch();
    committed={endpoint:lostEndpoint,serverStatus:response.status(),serverBody:await response.json(),observed:await state(lost)};
    report.stages.push({name:'server committed, browser acknowledgement deliberately lost',...committed});
    await save();await route.abort('failed');
  },{times:1});
  await c.section.getByRole('button',{name:`Activate schedule ${lost.historyId}`,exact:true}).click();
  await c.section.getByRole('alert').waitFor();
  assert(committed);assert.equal(committed.serverStatus,200);assert.equal(committed.observed.actions.length,1);
  await c.page.screenshot({path:root+'/price-lost-ack.jpg',fullPage:true});
  const error=await c.section.getByRole('alert').innerText();
  const wait=c.page.waitForResponse(r=>r.url().endsWith(lostEndpoint)&&r.request().method()==='POST');
  await c.section.getByRole('button',{name:`Activate schedule ${lost.historyId}`,exact:true}).click();
  const retry=await wait,body=await retry.json();
  assert.equal(retry.status(),200);assert.equal(body.replayed,true);
  const replayed=await state(lost);assert.equal(replayed.actions.length,1);
  assert.deepEqual(replayed,committed.observed);
  report.stages.push({name:'same-history same-reference UI retry',status:'PASS',browserError:error,retryStatus:retry.status(),body,after:replayed});
  await c.page.screenshot({path:root+'/price-retry-success.jpg',fullPage:true});await save();
  await c.ctx.close();report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;}
finally{await save();await browser.close();await db.end();}
console.log(JSON.stringify({status:report.status,error:report.error}));
