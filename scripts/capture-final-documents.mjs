import {chromium} from 'playwright';
import {fixture} from './final-release-fixture-probe.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const {m,db}=await fixture();await db.end();
const dir='generated-artifacts/final-release-gate/documents';
await mkdir(dir,{recursive:true});
const password=JSON.parse(await readFile(m.authFile,'utf8')).password;
const browser=await chromium.launch({headless:true,executablePath:'/repl/tools/bin/chromium',args:['--no-sandbox']});
const results=[];
async function save(){await writeFile(dir+'/document-actions.json',JSON.stringify({isolated:true,results},null,2));}
async function login(username){
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{window.print=()=>{};});
 const r=await context.request.post(m.frontend+'/api/auth/login',{data:{username,password}});
 if(r.status()!==200)throw Error('Synthetic login failed: '+r.status());
 return context;
}
async function output(page,name,open){
 const row={name,status:'RUNNING',at:new Date().toISOString()};results.push(row);await save();
 try{
 const promise=page.waitForEvent('popup',{timeout:10000});
 await open();const popup=await promise;
 await popup.waitForLoadState('domcontentloaded');await popup.emulateMedia({media:'print'});
 row.text=await popup.locator('body').innerText();
 await writeFile(`${dir}/${name}.html`,await popup.content());
 const thermal=name==='thermal-receipt';
 const paper=thermal?{width:'80mm',height:'200mm'}:{};
 await popup.pdf({path:`${dir}/${name}.pdf`,printBackground:true,preferCSSPageSize:!thermal,...paper});
 await popup.screenshot({path:`${dir}/${name}.jpg`,fullPage:true});
 row.status='GENERATED_PENDING_VISUAL_REVIEW';await popup.close();
 }catch(e){row.status='BLOCKED';row.error=e.message;await page.screenshot({path:`${dir}/${name}-blocked.jpg`,fullPage:true});}
 await save();
}
try{
 const branch=await login('ui_branch_a'),page=await branch.newPage();
 page.setDefaultTimeout(12000);await page.goto(m.frontend+'/branch',{waitUntil:'domcontentloaded'});
 const receipt=page.getByText('TW-2026-000001',{exact:true}).first();await receipt.waitFor();await receipt.click();
 const card=receipt.locator('xpath=ancestor::div[.//button[@title="Print 80mm thermal receipt"]][1]');
 await output(page,'thermal-receipt',()=>card.getByTitle('Print 80mm thermal receipt').click());
 await output(page,'customer-receipt',()=>card.getByTitle('Open A4 PDF invoice').click());
 const stock=await login('ui_stock'),sp=await stock.newPage();sp.setDefaultTimeout(12000);
 await sp.goto(m.frontend+'/stock?view=stockReports',{waitUntil:'domcontentloaded'});
 await sp.getByText('Current Company Stock — All Locations',{exact:true}).waitFor();
 const buttons=await sp.getByRole('button').allTextContents();results.push({name:'stock-report-available-controls',buttons});await save();
 for(const [name,label] of [['central-valuation','Print Valuation Report'],['branch-stock-report','Print Report'],['stock-movement-log','Print Movement Log']]){
  const button=sp.getByRole('button',{name:label,exact:true}).first();
  if(await button.count())await output(sp,name,()=>button.click());
  else{results.push({name,status:'BLOCKED',error:'Exact rendered print control absent: '+label});await save();}
 }
 await sp.goto(m.frontend+'/stock?view=valuation',{waitUntil:'domcontentloaded'});
 await sp.screenshot({path:dir+'/company-inventory-valuation.jpg',fullPage:true});
 results.push({name:'company-inventory-valuation-screen',status:'CAPTURED',text:await sp.locator('body').innerText()});await save();
 const finance=await login('ui_finance'),fp=await finance.newPage();fp.setDefaultTimeout(12000);
 await fp.goto(m.frontend+'/finance',{waitUntil:'domcontentloaded'});
 results.push({name:'finance-controls',buttons:await fp.getByRole('button').allTextContents()});await save();
 await fp.screenshot({path:dir+'/finance-sales-report-screen.jpg',fullPage:true});
 results.push({name:'finance-sales-report-screen',status:'CAPTURED',text:await fp.locator('body').innerText()});await save();
}catch(e){results.push({name:'capture-run',status:'BLOCKED',error:e.message});await save();process.exitCode=1;}
finally{await browser.close();}
console.log(JSON.stringify({results:results.map(r=>({name:r.name,status:r.status,error:r.error}))}));
