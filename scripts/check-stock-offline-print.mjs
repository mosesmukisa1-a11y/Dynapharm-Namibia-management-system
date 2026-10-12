import fs from 'node:fs/promises';
import {dir,manifest,db,b,report,save,balances,login} from './check-stock-lifecycle-stage1.mjs';
let page;
try{
 page=await login('ui_branch_a');
 await page.context().addInitScript(()=>{window.print=()=>{};});
 await page.goto(manifest.frontend+'/branch',{waitUntil:'domcontentloaded'});
 const receipt=page.getByText('UI-LIFE-0001',{exact:true}).first();await receipt.waitFor();
 await receipt.click();
 const saleCard=receipt.locator('xpath=ancestor::div[.//button[@title="Print 80mm thermal receipt"]][1]');
 for(const [title,name] of [['Print 80mm thermal receipt','thermal-receipt'],['Open A4 PDF invoice','receipt-pdf']]){
  const popupPromise=page.waitForEvent('popup');
  await saleCard.getByTitle(title).click();
  const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');
  const text=await popup.locator('body').innerText();
  if(!text.includes('TEST-ITEM') || !text.includes('72'))throw Error(`${name} missing sale evidence`);
  await fs.writeFile(`${dir}/${name}.html`,await popup.content());
  await popup.emulateMedia({media:'print'});
  await popup.pdf({path:`${dir}/${name}.pdf`,printBackground:true,preferCSSPageSize:true});
  await popup.screenshot({path:`${dir}/${name}.jpg`,fullPage:true});
  report.actions.push({action:title,status:'PASS',text});await save();await popup.close();
 }
 await page.evaluate(async()=>{window.auditQueue=await import('/src/lib/offlineQueue.js');});
 const payload={id:'UI-GENUINE-OFFLINE',receipt_number:'UI-OFFLINE-0001',branch:'townshop',customerType:'non_member',customerName:'Synthetic offline',
 products:[{name:'TEST-ITEM',quantity:1,unitPrice:9,dpPrice:7}],subtotal:9,total:9};
 const before=await balances();report.offlineBefore=before;
 const already=Number((await db.query("SELECT COUNT(*) FROM branch_walkin_sales WHERE offline_id='UI-GENUINE-OFFLINE'")).rows[0].count);
 report.existingOfflineSales=already;
 for(let attempt=0;attempt<2;attempt++){
  await page.evaluate(async()=>{window.auditQueue=await import('/src/lib/offlineQueue.js');});
  await page.context().setOffline(true);
  if(await page.evaluate(()=>navigator.onLine))throw Error('Browser did not enter genuine offline mode');
  await page.evaluate(async body=>{await window.auditQueue.enqueue({type:'walkin_sale',url:'/api/branch/walkin-sales',method:'POST',body,offlineId:'UI-GENUINE-OFFLINE'});},payload);
  report.actions.push({action:'Genuine browser offline enqueue',attempt,balances:await balances()});await save();
  await page.screenshot({path:`${dir}/offline-${attempt}.jpg`});
  const synced=page.waitForResponse(r=>r.url().endsWith('/api/sync/batch') && r.request().method()==='POST');
  await page.context().setOffline(false);
  const response=await synced;
  report.actions.push({action:'POST /api/sync/batch',status:response.status(),response:await response.json()});await save();
  await page.waitForFunction(async()=> (await (await import('/src/lib/offlineQueue.js')).getPendingOnly()).length===0,{},{timeout:30000});
  const count=Number((await db.query("SELECT COUNT(*) FROM branch_walkin_sales WHERE offline_id='UI-GENUINE-OFFLINE'")).rows[0].count);
  if(count!==1)throw Error(`Offline replay sale count ${count}`);
  const stock=await balances();
  if(Number(stock.branch_a)!==Number(before.branch_a)-(already?0:1))throw Error('Duplicate or missing offline stock deduction');
  report.actions.push({action:'Reconnect replay',attempt,count,balances:stock});await save();
 }
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.message;await page?.screenshot({path:`${dir}/offline-print-failure.jpg`}).catch(()=>{});}
finally{report.after=await balances();await save();await b.close();await db.end();}
console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;
