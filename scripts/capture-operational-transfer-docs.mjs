import {fixture,capture} from './final-release-fixture-probe.mjs';
import {releaseEvidenceRoot as root} from './release-evidence-paths.mjs';
import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {m,db}=await fixture(),password=JSON.parse(await readFile(m.authFile,'utf8')).password;
const lifecycle=JSON.parse(await readFile(root+'/transfer-document-evidence/lifecycle.json','utf8'));
const report={status:'RUNNING',method:'Actual Stock transfers UI opens persisted supported-lifecycle dispatch notes; received state is the receiving evidence, not a fabricated separate goods-received document',documents:[]};
const save=()=>writeFile(root+'/transfer-document-evidence/documents.json',JSON.stringify(report,null,2));
const browser=await chromium.launch({headless:true,executablePath:execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const ctx=await browser.newContext({timezoneId:'Africa/Windhoek'});await ctx.addInitScript(()=>window.print=()=>{});
 const auth=await ctx.request.post(m.frontend+'/api/auth/login',{data:{username:'ui_stock',password}});assert.equal(auth.status(),200);
 report.before=await capture(db);
 const page=await ctx.newPage();await page.goto(m.frontend+'/stock?view=transfers');await page.waitForLoadState('networkidle');
 const buttons=page.getByRole('button',{name:/View dispatch note/i});
 const count=await buttons.count();assert.equal(count,2,'Exactly the two supported physical transfer documents expected');
 for(let i=0;i<count;i++){
   await buttons.nth(i).click();
   await page.getByRole('button',{name:/Print/i}).last().waitFor();
   const text=await page.locator('body').innerText();assert(text.includes('QA-TRANSFER-ITEM'));
   const [popup]=await Promise.all([ctx.waitForEvent('page'),page.getByRole('button',{name:/Print/i}).last().click()]);
   await popup.waitForTimeout(1000);
   const printable=await popup.locator('body').innerText();
   assert(printable.includes('QA-TRANSFER-ITEM'));assert(printable.includes('QA-TRANSFER-LOT'));
   assert(!/no (products|items)/i.test(printable));
   const file=`${root}/transfer-document-evidence/dispatch-note-${i+1}`;
   await writeFile(file+'.html',await popup.content());await popup.pdf({path:file+'.pdf',format:'A4',printBackground:true});
   await popup.screenshot({path:file+'.jpg',fullPage:true});await popup.close();
   report.documents.push({index:i+1,file:file+'.pdf',text:printable,expectedRefs:lifecycle.refs,
     note:'Original dispatched quantities must remain100/30, not remaining balances70/28'});
   await save();
   await page.goto(m.frontend+'/stock?view=transfers');await page.waitForLoadState('networkidle');
 }
 report.after=await capture(db);assert.deepEqual(report.after.fingerprint,report.before.fingerprint);
 report.status='PASS';await save();
}catch(e){report.status='FAIL';report.error=e.message;report.observed=await capture(db).catch(()=>null);await save();process.exitCode=1;}
finally{await browser.close();await db.end();}
console.log(JSON.stringify({status:report.status,error:report.error,count:report.documents.length}));
