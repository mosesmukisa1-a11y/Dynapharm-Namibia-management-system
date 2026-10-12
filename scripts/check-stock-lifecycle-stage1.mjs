import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import pg from 'pg';
const dir=process.env.AUDIT_RELEASE==='1'?'generated-artifacts/stock-release-verification':process.env.AUDIT_CONTINUATION==='1'?'generated-artifacts/stock-continuation-stages':'generated-artifacts/stock-lifecycle-stages';
const manifest=JSON.parse(await fs.readFile(`${dir}/environment.json`,'utf8'));
if(!manifest.disposable || !['http://127.0.0.1:5175','http://127.0.0.1:5176','http://127.0.0.1:5177'].includes(manifest.frontend) || !/^stock_audit_[a-f0-9]{32}$/.test(manifest.isolatedDatabase))throw Error('Disposable environment required');
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+manifest.isolatedDatabase;url.search='';url.hash='';
const db=new pg.Pool({connectionString:url.toString(),max:1});
if((await db.query('SELECT current_database() AS name')).rows[0].name!==manifest.isolatedDatabase)throw Error('Wrong database');
const b=await chromium.launch({executablePath:'/repl/tools/bin/chromium',args:['--no-sandbox']});
const stage=Number(process.argv[2] || 1);
const report={stage,status:'BLOCKED',method:'Visible staff login, then authenticated browser-context HTTP transactions; not transaction-form verification',actions:[]};
let currentPage;
const save=()=>fs.writeFile(`${dir}/stage-${stage}-transactions.json`,JSON.stringify(report,null,2));
async function balances(){
 return (await db.query(`SELECT
 (SELECT COALESCE(SUM(remaining_quantity),0) FROM stock_batches WHERE location='windhoek_warehouse') AS warehouse,
 (SELECT COALESCE(SUM(quantity),0) FROM branch_inventory_batches WHERE branch_id='townshop') AS branch_a,
 (SELECT COALESCE(SUM(quantity),0) FROM branch_inventory_batches WHERE branch_id='swakopmund') AS branch_b,
 (SELECT COALESCE(SUM(remaining_quantity),0) FROM stock_batches)+(SELECT COALESCE(SUM(quantity),0) FROM branch_inventory_batches) AS physical_total`)).rows[0];
}
async function login(username){
 const p=await b.newPage({viewport:{width:1440,height:1000}});
 // Public fonts must not hold staff verification behind an external page load.
 // All application/session/API traffic remains real and unmodified.
 await p.route('**/*',route=>new URL(route.request().url()).origin===manifest.frontend
   ? route.continue():route.abort());
 currentPage=p;
 report.currentAction=`Sign in through public Staff Login as ${username}`;
 await save();
 await p.goto(manifest.frontend+'/',{waitUntil:'load'});
 await p.getByRole('button',{name:'Staff Login',exact:true}).first().click();
 await p.getByPlaceholder('Enter your username').fill(username);
 await p.getByPlaceholder('Enter your password').fill('DisposableStockUi-2026!');
 await p.locator('form').filter({has:p.getByPlaceholder('Enter your username')}).getByRole('button',{name:'Sign In',exact:true}).click();
 await p.getByPlaceholder('Enter your username').waitFor({state:'hidden'});
 return p;
}
async function call(p,method,path,data){
 const entry={action:`${method} ${path}`,before:await balances()};report.actions.push(entry);await save();
 const response=await p.request.fetch(manifest.frontend+'/api'+path,{method,data});
 entry.status=response.status();entry.response=await response.json();entry.after=await balances();await save();
 if(!response.ok())throw Error(`${entry.action} returned ${entry.status}: ${JSON.stringify(entry.response)}`);
 return entry.response;
}
let stock;
if(stage===1){
try{
 report.before=await balances();
 if(Number(report.before.physical_total)!==0)throw Error('Fresh empty fixture required; refusing to repeat completed transactions');
 stock=await login('ui_stock');
 const gm=await login('ui_gm'),a=await login('ui_branch_a'),branchB=await login('ui_branch_b');
 await call(stock,'PUT','/stock/product-packs',{productName:'TEST-ITEM',baseUnit:'unit',packs:[{unit:'unit',factor:1},{unit:'carton',factor:10}]});
 await call(stock,'POST','/stock/import/receive',{receiptKey:'UI-LIFECYCLE-100',supplierId:'TEST-SUPPLIER',items:[{productName:'TEST-ITEM',quantity:10,enteredUnit:'carton',batchNo:'UI-LIFECYCLE-LOT',expiryDate:'2035-12-31',unitCIF:20,unitDP:70}]});
 async function transfer(from,to,quantity,receiver){
  const created=await call(stock,'POST','/stock/transfers',{fromWarehouse:from,toBranch:to,status:'prepared',items:[{productName:'TEST-ITEM',batchNo:'UI-LIFECYCLE-LOT',expiryDate:'2035-12-31',quantity}]});
  const id=created.id || created.transfer?.id;
  if(!id)throw Error('Transfer response missing ID');
  await call(gm,'PATCH','/stock/transfers',{id,status:'approved',gmAction:'approve'});
  if(to==='windhoek_warehouse')await call(stock,'POST','/stock/warehouses/receive-stock',{transferId:id,action:'accept'});
  else{
   await call(stock,'PATCH','/stock/transfers',{id,status:'dispatched'});
   await call(receiver,'PATCH','/stock/transfers',{id,status:'received',items:[{productName:'TEST-ITEM',batchNo:'UI-LIFECYCLE-LOT',expiryDate:'2035-12-31',quantityReceived:quantity}]});
  }
 }
 await transfer('country_stock','windhoek_warehouse',100,stock);
 await transfer('windhoek_warehouse','townshop',30,a);
 await transfer('windhoek_warehouse','swakopmund',20,branchB);
 report.after=await balances();
 if(Number(report.after.warehouse)!==50 || Number(report.after.branch_a)!==30 || Number(report.after.branch_b)!==20 || Number(report.after.physical_total)!==100)throw Error('Stage 1 stock mismatch');
 report.status='PASS';
 await stock.goto(manifest.frontend+'/stock?view=overview',{waitUntil:'domcontentloaded'});
 await stock.locator('.stock-main').waitFor();
 await stock.screenshot({path:`${dir}/stage-1-complete.jpg`});
}catch(e){report.error=e.message;report.status=report.actions.some(x=>x.status>=400)?'FAIL':'BLOCKED';report.after=await balances();await currentPage?.screenshot({path:`${dir}/stage-1-failure.jpg`}).catch(()=>{});}
finally{await save();await b.close();await db.end();}
console.log(JSON.stringify(report,null,2));
if(report.status!=='PASS')process.exitCode=1;
}
export {dir,manifest,db,b,report,save,balances,login,call};
