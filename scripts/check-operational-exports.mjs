import {chromium} from 'playwright';
import {fixture,capture} from './final-release-fixture-probe.mjs';
import {releaseEvidenceRoot as root} from './release-evidence-paths.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {businessToday} from '../shared/price-list-import.js';
import assert from 'node:assert/strict';
const {m,db}=await fixture(),password=JSON.parse(await readFile(m.authFile,'utf8')).password;
const dir=root+'/export-evidence',day=businessToday();
await mkdir(dir,{recursive:true});
const report={status:'RUNNING',method:'Actual rendered staff pages and browser Blob downloads. Blob has no HTTP status; source API statuses are recorded separately.',downloads:[],api:[],stages:[]};
const save=()=>writeFile(dir+'/downloads.json',JSON.stringify(report,null,2));
const browser=await chromium.launch({headless:true,executablePath:'/repl/tools/bin/chromium',args:['--no-sandbox']});
async function pageFor(role){
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000},timezoneId:'Africa/Windhoek'});
  assert.equal((await context.request.post(m.frontend+'/api/auth/login',{data:{username:'ui_'+role,password}})).status(),200);
  await context.addInitScript(()=>{window.__blobTypes=[];const old=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{window.__blobTypes.push({type:b.type,size:b.size});return old(b);};});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('response',r=>{if(r.url().includes('/api/'))report.api.push({role,path:new URL(r.url()).pathname+new URL(r.url()).search,status:r.status(),mime:r.headers()['content-type']});});
  return page;
}
async function download(page,name,click){
  const row={name,status:'RUNNING'};report.downloads.push(row);await save();
  const waiting=page.waitForEvent('download');await click();const d=await waiting;
  row.filename=d.suggestedFilename();row.blob=(await page.evaluate(()=>window.__blobTypes)).at(-1);
  row.file=dir+'/'+name+'.csv';await d.saveAs(row.file);
  const bytes=await readFile(row.file);row.bytes=bytes.length;assert(bytes.length>20);
  row.sha256=(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
  row.status='DOWNLOADED_PENDING_BYTE_REVIEW';await page.screenshot({path:dir+'/'+name+'.png',fullPage:true});await save();
}
try{
  report.before=await capture(db);await save();
  const stock=await pageFor('stock');await stock.goto(m.frontend+'/stock?view=costReport');
  await stock.getByRole('button',{name:/^(Load|Refresh) report$/i}).click();
  await stock.getByRole('button',{name:/Download.*audit/i}).waitFor();
  const format=stock.locator('select').filter({has:stock.locator('option[value="stock_csv"]')});
  for(const [name,value] of [['stock','stock_csv'],['original-cost','csv'],['financial-original','financial_csv']]){
    await format.selectOption(value);
    await download(stock,name,()=>stock.getByRole('button',{name:/Download.*audit/i}).click());
  }
  const mis=await pageFor('mis');await mis.goto(m.frontend+'/mis');
  await mis.getByRole('button',{name:/Stock/}).filter({hasText:'Stock'}).first().click();
  await mis.getByRole('button',{name:/Product Breakdown/}).click();
  const dates=mis.locator('input[type=date]');await dates.nth(0).fill(day);await dates.nth(1).fill(day);
  await mis.getByRole('button',{name:'Go',exact:true}).click();
  await mis.getByText('TEST-ITEM',{exact:true}).first().waitFor();
  await download(mis,'mis-products',()=>mis.getByRole('button',{name:'Export CSV',exact:true}).click());
  assert(!(await mis.locator('body').innerText()).includes('NaN'));
  // Keep a genuine old response in flight while a newer invalid range fails.
  // The older success must not replace the current range/error.
  await mis.route('**/api/reports/branch-sales/product-range**',async route=>{
    if(new URL(route.request().url()).searchParams.get('date_from')===day){
      const response=await route.fetch();await new Promise(r=>setTimeout(r,800));await route.fulfill({response});
    }else await route.continue();
  });
  const oldRequest=mis.waitForRequest(r=>r.url().includes('/reports/branch-sales/product-range')&&new URL(r.url()).searchParams.get('date_from')===day);
  await mis.getByRole('button',{name:'Go',exact:true}).click();await oldRequest;
  const tomorrow=new Date(new Date(day+'T12:00:00Z').getTime()+86400000).toISOString().slice(0,10);
  await dates.nth(0).fill(tomorrow);
  await mis.getByText(/Reports are unavailable, not zero/).waitFor();
  await mis.waitForTimeout(1100);
  assert(await mis.getByText(/Reports are unavailable, not zero/).isVisible());
  report.stages.push({name:'MIS invalid range and stale-success suppression',status:'PASS',from:tomorrow,to:day,expectedHTTP:422});
  await mis.screenshot({path:dir+'/mis-invalid-range-stale-response.png',fullPage:true});
  await mis.unroute('**/api/reports/branch-sales/product-range**');await dates.nth(0).fill(day);
  await mis.getByText('TEST-ITEM',{exact:true}).first().waitFor();
  const branchSelect=mis.locator('select').filter({has:mis.locator('option[value="townshop"]')}).last();
  await branchSelect.selectOption('swakopmund');
  await mis.getByText('Sales Breakdown — Swakopmund').waitFor();
  assert.equal(await mis.getByText('TEST-ITEM',{exact:true}).count(),0);
  await mis.screenshot({path:dir+'/mis-empty-other-branch.png',fullPage:true});
  await mis.getByRole('button',{name:/Receipts/}).first().click();
  const receiptDates=mis.locator('input[type=date]');await receiptDates.nth(0).fill(day);await receiptDates.nth(1).fill(day);
  await mis.getByRole('button',{name:'Search',exact:true}).click();
  await mis.getByRole('button',{name:'Export CSV',exact:true}).waitFor();
  await download(mis,'mis-receipts',()=>mis.getByRole('button',{name:'Export CSV',exact:true}).click());
  const finance=await pageFor('finance');await finance.goto(m.frontend+'/finance');
  await finance.getByRole('button',{name:/Reports/}).first().click();
  await finance.getByRole('button',{name:'Export CSV',exact:true}).waitFor();
  await download(finance,'finance-sales',()=>finance.getByRole('button',{name:'Export CSV',exact:true}).click());
  report.after=await capture(db);
  assert.deepEqual(report.after.fingerprint,report.before.fingerprint,'Other writer or report-side mutation observed; not read-only proof');
  report.status='DOWNLOADED_PENDING_BYTE_REVIEW';await save();
}catch(e){report.status='FAIL';report.error=e.message;report.observed=await capture(db).catch(()=>null);await save();process.exitCode=1;}
finally{await browser.close();await db.end();}
console.log(JSON.stringify({status:report.status,error:report.error,downloads:report.downloads.map(r=>({name:r.name,status:r.status,bytes:r.bytes}))}));
