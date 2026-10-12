import fs from 'node:fs/promises';
import {dir,manifest,db,b,report,save,balances,login} from './check-stock-lifecycle-stage1.mjs';
try{
 const stock=await login('ui_stock'),gm=await login('ui_gm'),branch=await login('ui_branch_b');
 await stock.context().addInitScript(()=>{window.print=()=>{};});
 await stock.goto(manifest.frontend+'/stock?view=stockReports',{waitUntil:'domcontentloaded'});
 const previewPromise=stock.waitForEvent('popup');
 await stock.getByRole('button',{name:/Print Report/}).click();
 const preview=await previewPromise;await preview.waitForLoadState('domcontentloaded');
 const text=await preview.locator('body').innerText();
 await fs.writeFile(`${dir}/stock-report-print.html`,await preview.content());
 await preview.pdf({path:`${dir}/stock-report-print.pdf`,printBackground:true});
 report.actions.push({action:'Stock report print preview',text});await save();
 await stock.goto(manifest.frontend+'/stock?view=costReport',{waitUntil:'domcontentloaded'});
 await stock.getByRole('button',{name:'Load report',exact:true}).click();
 await stock.getByRole('button',{name:'Refresh report',exact:true}).waitFor();
 await stock.getByLabel('Audit download format').selectOption('stock_csv');
 const [file]=await Promise.all([stock.waitForEvent('download'),stock.getByRole('button',{name:'Download sale audit',exact:true}).click()]);
 await file.saveAs(`${dir}/stock.csv`);
 const csv=await fs.readFile(`${dir}/stock.csv`,'utf8');
 if(!csv.includes('TEST-ITEM'))throw Error('Stock CSV omits synthetic stock');
 const exportedQty=csv.split('\r\n').slice(1).filter(Boolean).reduce((sum,row)=>sum+Number(row.split(',')[7].replaceAll('"','')),0);
 if(exportedQty!==Number((await balances()).physical_total))throw Error('Synthetic stock CSV quantity disagrees with persisted balances');
 report.actions.push({action:'Download stock CSV',bytes:csv.length,content:csv});await save();
 for(const path of ['/stock-requests','/stock-requests/AUDIT-HTTP-REQUEST']){
  await db.query("INSERT INTO stock_requests(id,requesting_branch,status,items) VALUES('AUDIT-HTTP-REQUEST','townshop','pending','[]') ON CONFLICT(id) DO UPDATE SET status='pending'");
  const forbidden=await branch.request.put(manifest.frontend+'/api'+path,{data:{id:'AUDIT-HTTP-REQUEST',notes:'forbidden'}});
  if(forbidden.status()!==403)throw Error('Cross-branch request update allowed');
  const result=await gm.request.put(manifest.frontend+'/api'+path,{data:{id:'AUDIT-HTTP-REQUEST',status:'rejected',rejection_reason:'Synthetic request rejection',updated_by:'spoof',rejected_by:'spoof'}});
  report.actions.push({action:`PUT ${path}`,status:result.status(),response:await result.json(),forbiddenStatus:forbidden.status()});await save();
  if(result.status()!==200)throw Error('Authorized rejection failed');
  const row=(await db.query("SELECT updated_by,rejected_by,last_status_change FROM stock_requests WHERE id='AUDIT-HTTP-REQUEST'")).rows[0];
  if(!row.updated_by || row.updated_by==='spoof' || row.rejected_by!==row.updated_by || !row.last_status_change)throw Error('Session actor attribution failed');
 }
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.message;}
finally{report.after=await balances();await save();await b.close();await db.end();}
console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;
