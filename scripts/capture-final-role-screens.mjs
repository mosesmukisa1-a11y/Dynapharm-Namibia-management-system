import {chromium} from 'playwright';
import {fixture,capture} from './final-release-fixture-probe.mjs';
import {releaseBrowserEvidence as dir} from './release-evidence-paths.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {m,db}=await fixture(),password=JSON.parse(await readFile(m.authFile,'utf8')).password;
const before=await capture(db),report={method:'Read-only authenticated rendered pages; API-login through actual staff middleware, not login-form or transaction workflow proof',roles:[]};
const browser=await chromium.launch({headless:true,executablePath:'/repl/tools/bin/chromium',args:['--no-sandbox']});
try{
 for(const role of ['gm','mis','director','stock']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const login=await context.request.post(m.frontend+'/api/auth/login',{data:{username:'ui_'+role,password}});
  assert.equal(login.status(),200);
  const page=await context.newPage(),entry={role,actions:[],errors:[]};report.roles.push(entry);
  page.on('response',async response=>{
   if(!response.url().includes('/api/')||response.url().includes('/auth/'))return;
   const action={endpoint:new URL(response.url()).pathname+new URL(response.url()).search,status:response.status()};
   if(/summary|sales-report|daily-sales/.test(action.endpoint))action.body=await response.json().catch(()=>null);
   entry.actions.push(action);
  });
  page.on('pageerror',error=>entry.errors.push(error.message));
  await page.goto(m.frontend+'/'+role,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(3500);
  if(role==='gm'){
   await page.getByText('94.8%',{exact:true}).waitFor({timeout:10000});
   entry.equalBasisMargin='94.8% = original profit 2940 / original net charged revenue 3101';
  }
  if(role==='stock'){
   await page.getByRole('button',{name:'Stock Reports',exact:true}).click();
   await page.getByText('Per-Branch Stock Formula',{exact:true}).waitFor();
   await page.route('**/api/branch/stock-summary?**',async route=>{
    const response=await route.fetch(),body=await response.json();
    const row=body.branches.find(b=>(b.branch_id||b.id)==='townshop');
    assert(row,'Synthetic townshop summary not found');row.opening_qty=0;
    await route.fulfill({response,json:body});
   });
   await page.reload();await page.getByRole('button',{name:'Stock Reports',exact:true}).click();
   await page.getByText(/Movement formula requires review:/).first().waitFor({timeout:10000});
   entry.injectedOpeningWarningVisible=true;
   await page.screenshot({path:dir+'/rendered-stock-warning.png',fullPage:true});
   await page.unroute('**/api/branch/stock-summary?**');
   await page.reload();await page.getByRole('button',{name:'Stock Reports',exact:true}).click();
   await page.getByText('Per-Branch Stock Formula',{exact:true}).waitFor();
   entry.warningInterceptorRemoved=true;
  }
  await page.screenshot({path:`${dir}/rendered-${role}.png`,fullPage:true});
  await writeFile(`${dir}/rendered-${role}.txt`,await page.locator('body').innerText());
  await writeFile(dir+'/rendered-role-pages.json',JSON.stringify(report,null,2));
  await context.close();
 }
 const context=await browser.newContext();
 await context.request.post(m.frontend+'/api/auth/login',{data:{username:'ui_branch_a',password}});
 const page=await context.newPage();await page.goto(m.frontend+'/branch');
 report.browserBranchDenial=await page.evaluate(async()=>{
  const r=await fetch('/api/branch/inventory?branch=swakopmund',{credentials:'include'});return {endpoint:'/api/branch/inventory?branch=swakopmund',status:r.status,body:await r.json()};
 });
 assert.equal(report.browserBranchDenial.status,403);
 const anonymous=await browser.newContext(),denied=await anonymous.request.get(m.frontend+'/api/branch/inventory?branch=townshop');
 report.anonymousStatus=denied.status();assert.equal(denied.status(),401);
 await context.close();await anonymous.close();
 report.before=before;report.after=await capture(db);assert.deepEqual(report.after.fingerprint,before.fingerprint);
 report.businessFingerprintUnchanged=true;
}catch(error){report.error=error.message;process.exitCode=1;}
finally{
 await writeFile(dir+'/rendered-role-pages.json',JSON.stringify(report,null,2));
 await browser.close();await db.end();
}
console.log(JSON.stringify({roles:report.roles.map(r=>({role:r.role,errors:r.errors})),error:report.error,branchDenial:report.browserBranchDenial?.status,unchanged:report.businessFingerprintUnchanged}));
