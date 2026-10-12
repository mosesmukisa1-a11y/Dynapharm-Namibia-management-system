import fs from 'node:fs/promises';
import {dir,manifest,db,b,report,save,balances,login,call} from './check-stock-lifecycle-stage1.mjs';
let stock;
try{
 stock=await login('ui_stock');report.before=await balances();
 const data=await call(stock,'GET','/stock/cost-report?productName=TEST-ITEM');
 report.summary=data.summary;
 await stock.goto(manifest.frontend+'/stock?view=costReport',{waitUntil:'domcontentloaded'});
 await stock.getByRole('button',{name:'Load report',exact:true}).click();
 await stock.getByRole('button',{name:'Refresh report',exact:true}).waitFor();
 report.screen=await stock.locator('.stock-main').innerText();
 await save();
 await stock.screenshot({path:`${dir}/stage-6-cost-report.jpg`,fullPage:true});
 const selector=stock.locator('select').filter({has:stock.locator('option[value="financial_csv"]')});
 for(const format of ['financial_csv','csv']){
  await selector.selectOption(format);
  const [file]=await Promise.all([stock.waitForEvent('download'),
   stock.getByRole('button',{name:'Download sale audit',exact:true}).click()]);
  const path=`${dir}/${format}.csv`;await file.saveAs(path);
  const text=await fs.readFile(path,'utf8');
  report[format]={path,bytes:text.length,content:text};await save();
 }
 const expected={netSoldQuantity:6,netSalesRevenue:54,netCostOfGoodsSold:12,grossProfitAfterReturns:42,writeOffExpense:2};
 for(const [key,value] of Object.entries(expected)){
  if(Number(report.summary[key])!==value)throw Error(`${key}: expected ${value}, got ${report.summary[key]}`);
  const row=report.financial_csv.content.split(/\r?\n/).map(line=>line.split(',').map(v=>v.replace(/^"|"$/g,''))).find(cells=>cells[0]===key);
  if(!row || Number(row[1])!==value)throw Error(`${key} missing or incorrect in downloaded financial CSV`);
 }
 report.status='PASS';
}catch(e){report.error=e.message;report.status=report.actions.some(x=>x.status>=400)?'FAIL':'BLOCKED';if(report.summary)report.status='FAIL';await stock?.screenshot({path:`${dir}/stage-6-failure.jpg`}).catch(()=>{});}
finally{report.after=await balances();await save();await b.close();await db.end();}
console.log(JSON.stringify({stage:report.stage,status:report.status,error:report.error,summary:report.summary}));
if(report.status!=='PASS')process.exitCode=1;
