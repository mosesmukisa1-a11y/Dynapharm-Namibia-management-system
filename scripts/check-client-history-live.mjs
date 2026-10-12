import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import pg from 'pg';
const dir='generated-artifacts/client-history';
const manifest=JSON.parse(await fs.readFile(`${dir}/environment.json`,'utf8'));
if(!manifest.disposable||!/^stock_audit_[a-f0-9]{32}$/.test(manifest.isolatedDatabase)||manifest.backendPort!==3007)throw Error('Owned disposable fixture required');
const target=new URL(process.env.DATABASE_URL);
if(target.pathname==='/'+manifest.isolatedDatabase)throw Error('Must not target business database');
target.pathname='/'+manifest.isolatedDatabase;target.search='';target.hash='';
const db=new pg.Pool({connectionString:target.toString(),max:1});
if((await db.query('SELECT current_database() name')).rows[0].name!==manifest.isolatedDatabase)throw Error('Wrong database');
const browser=await chromium.launch({executablePath:'/repl/tools/bin/chromium',args:['--no-sandbox']});
const report={status:'IN PROGRESS',actions:[],method:'Actual Staff Login and live dispense forms; isolated synthetic stock fixture only'};
const save=()=>fs.writeFile(`${dir}/live-browser.json`,JSON.stringify(report,null,2));
const balance=async()=> (await db.query(`SELECT
 (SELECT COALESCE(SUM(quantity),0) FROM branch_inventory_batches) physical,
 (SELECT COUNT(*) FROM stock_movements) movements,
 (SELECT COUNT(*) FROM branch_activity_transactions) financial,
 (SELECT COUNT(*) FROM client_dispense_evidence WHERE mode='live') live_records`)).rows[0];
let page;
try{
 page=await browser.newPage({viewport:{width:1440,height:1050},timezoneId:'Africa/Windhoek'});
 page.on('response',async r=>{
  if(r.url().includes('/api/client-history')&&r.request().method()==='POST'){
   report.actions.push({endpoint:new URL(r.url()).pathname,status:r.status(),response:await r.json().catch(()=>null)});await save();
  }
 });
 await page.goto(manifest.frontend,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Staff Login',exact:true}).first().click();
 await page.getByPlaceholder('Enter your username').fill('ch_fd');
 await page.getByPlaceholder('Enter your password').fill('DisposableStockUi-2026!');
 await page.locator('form').filter({has:page.getByPlaceholder('Enter your username')}).getByRole('button',{name:'Sign In',exact:true}).click();
 await page.getByPlaceholder('Enter your username').waitFor({state:'hidden'});
 await page.getByRole('button',{name:/Client Lookup/}).click();
 const row=page.locator('.ch-contact').filter({has:page.getByText('Client History Verified',{exact:true})});
 await row.getByRole('button',{name:'Open history',exact:true}).click();
 await page.getByRole('button',{name:'Record / link dispensing',exact:true}).click();
 await page.getByLabel('Dispensing mode').selectOption('live');
 await page.getByLabel('Quantity dispensed (unit)',{exact:true}).fill('3');
 await page.getByRole('checkbox',{name:/I confirm payment/}).check();
 report.before=await balance();await save();
 await page.screenshot({path:`${dir}/live-before.jpg`,fullPage:true});
 let pending=page.waitForResponse(r=>r.url().includes('/api/client-history')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Confirm payment and dispense stock',exact:true}).click();
 let response=await pending;
 report.insufficient={status:response.status(),body:await response.json(),after:await balance()};await save();
 await page.screenshot({path:`${dir}/live-insufficient.jpg`,fullPage:true});
 if(response.status()!==409||JSON.stringify(report.before)!==JSON.stringify(report.insufficient.after))
  throw Error('Expected explicit insufficient stock 409 and unchanged balances');
 // Seed only owned synthetic base units. No live/business records are touched.
 await db.query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,status)
   VALUES('CH-BROWSER-LIVE','townshop','TEST-ITEM','CH-UI','2035-12-31',3,'in_stock')`);
 report.syntheticFixture={quantity:3,batch:'CH-UI',before:await balance()};await save();
 pending=page.waitForResponse(r=>r.url().includes('/api/client-history')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Retry exact request',exact:true}).click();
 response=await pending;
 report.retry={status:response.status(),body:await response.json(),after:await balance()};await save();
 if(response.status()!==200||Number(report.retry.after.physical)!==0||Number(report.retry.after.live_records)!==1)
  throw Error('Live retry did not post exactly once');
 await page.getByText('Saved to the client’s persistent history.').waitFor();
 await page.screenshot({path:`${dir}/live-after.jpg`,fullPage:true});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/Client Lookup/}).click();
 await page.locator('.ch-contact').filter({has:page.getByText('Client History Verified',{exact:true})}).getByRole('button',{name:'Open history',exact:true}).click();
 await page.getByRole('button',{name:'Record / link dispensing',exact:true}).waitFor();
 await page.screenshot({path:`${dir}/profile-reloaded.jpg`,fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:`${dir}/profile-mobile.jpg`,fullPage:true});
 report.afterReload=await balance();report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.message;await page?.screenshot({path:`${dir}/live-failure.jpg`}).catch(()=>{});}
finally{await save();await browser.close();await db.end();}
console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;
