import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {fixture,capture} from './final-release-fixture-probe.mjs';
import {releaseEvidenceRoot as root} from './release-evidence-paths.mjs';
const {m,db}=await fixture(),password=JSON.parse(await readFile(m.authFile,'utf8')).password;
const original=JSON.parse(await readFile(root+'/first-gui-sale.json','utf8'));
const sale=JSON.parse(original.postResponse.body).sale;
const report={status:'RUNNING',saleId:sale.id,immediateResponse:{endpoint:original.postResponse.endpoint,status:original.postResponse.status},
  limitation:'Named browser tester stalled after saving immediate201; its read-only follow-up also stalled and both were stopped. This later browser reload is distinct evidence; no sale resubmission.'};
const browser=await chromium.launch({headless:true,executablePath:'/repl/tools/bin/chromium',args:['--no-sandbox']});
try{
  report.before=await capture(db);
  assert.equal(original.postResponse.status,201);
  const rows=(await db.query('SELECT id,data FROM branch_walkin_sales WHERE id=$1',[sale.id])).rows;
  assert.equal(rows.length,1);report.persistedSale=rows[0];
  const quantity=(await db.query("SELECT SUM(quantity)::numeric n FROM branch_inventory_batches WHERE branch_id='townshop' AND product_name='TEST-ITEM'")).rows[0].n;
  assert.equal(Number(quantity),9);report.testItemAvailable=Number(quantity);
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Africa/Windhoek'});
  ctx.setDefaultTimeout(12000);
  const login=await ctx.request.post(m.frontend+'/api/auth/login',{data:{username:'ui_branch_a',password}});assert.equal(login.status(),200);
  const page=await ctx.newPage();
  await page.goto(m.frontend+'/branch',{waitUntil:'domcontentloaded',timeout:20000});
  await page.getByText('Windhoek CBD',{exact:false}).first().waitFor();
  report.renderedCanonicalBranch=true;
  const result=await ctx.request.get(m.frontend+'/api/branch/walkin-sales?branch_id=townshop');
  report.reloadEndpoint={path:'/api/branch/walkin-sales?branch_id=townshop',status:result.status()};
  assert.equal(result.status(),200);
  const body=await result.text();assert(body.includes(sale.id));
  await page.screenshot({path:root+'/first-sale-reloaded.jpg',fullPage:true});
  report.after=await capture(db);
  assert.deepEqual(report.after.fingerprint,report.before.fingerprint);
  report.status='PASS';report.renderedReceiptAfterReload='NOT VERIFIED: this bounded check verifies portal branch rendering and persisted authenticated sale response, not a reopened receipt dialog';
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;}
finally{await browser.close();await db.end();await writeFile(root+'/first-sale-reload.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({status:report.status,error:report.error,saleId:report.saleId}));
