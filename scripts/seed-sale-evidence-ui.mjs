import {syntheticCredential, syntheticCredentialUrl} from './lib/synthetic-credential-fixture.mjs';
// Synthetic fixtures ONLY in an already running disposable stock UI harness.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import {assertIsolatedTestDatabase} from '../api/testDatabaseGuard.js';
const dir='generated-artifacts/stock-ui-verification';
const fixture=JSON.parse(await readFile(`${dir}/environment.json`,'utf8'));
if(!fixture.disposable || !fixture.isolatedDatabase.startsWith('stock_audit_'))throw Error('Disposable UI database required');
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+fixture.isolatedDatabase;url.search='';
assertIsolatedTestDatabase({...process.env,DATABASE_URL:url.toString(),STOCK_AUDIT_ISOLATED:'1',STOCK_AUDIT_DATABASE:fixture.isolatedDatabase,REPLIT_DEPLOYMENT:''});
const db=new pg.Pool({connectionString:url.toString(),max:1});
try{
  if(Number((await db.query('SELECT COUNT(*) n FROM stock_movements')).rows[0].n))throw Error('Fresh empty UI database required');
  await db.query('BEGIN');
  const hash=await bcrypt.hash(syntheticCredential('legacy-ui'),10);
  for(const role of ['mis','finance','director'])await db.query(`INSERT INTO users(id,username,password_hash,role,full_name,is_active,must_change_password)
    VALUES($1,$2,$3,$4,$2,true,false)`,['UI-'+role,'ui_'+role,hash,role]);
  await db.query(`UPDATE product_prices SET dp=341,cp=443,cif=70 WHERE description='TEST-ITEM'`);
  await db.query(`UPDATE products SET dp=341,cp=443 WHERE name='TEST-ITEM'`);
  await db.query(`INSERT INTO stock_batches(id,description,batch_no,quantity,remaining_quantity,cif_unit_cost,dpc_unit_value,location,status,expiry_date)
    VALUES('UI-SALE-SOURCE','TEST-ITEM','UI-SALE-LOT',10,0,70,23,'windhoek_warehouse','available','2035-01-01')`);
  await db.query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,quantity,status,unit_price,source_batch_id,expiry_date,metadata)
    VALUES('UI-SALE-BRANCH','townshop','TEST-ITEM','UI-SALE-LOT',10,'in_stock',23,'UI-SALE-SOURCE','2035-01-01',$1)`,
    [JSON.stringify({cost_layers:[{quantity:10,source:{id:'UI-SALE-SOURCE',cif_unit_cost:70,received_unit_cif_exact:'70',dpc_unit_value:23}}]})]);
  for(const status of ['pending','reviewed','approved','partially_dispatched','dispatched','in_transit','received','rejected','cancelled'])
    await db.query(`INSERT INTO stock_requests(id,requesting_branch,status,items) VALUES($1,'townshop',$2,'[]')`,['UI-REQ-'+status,status]);
  await db.query(`INSERT INTO stock_requests(id,requesting_branch,status,items) VALUES('UI-REQ-OTHER','swakopmund','pending','[]')`);
  await db.query('COMMIT');
  const api=`http://127.0.0.1:${fixture.backendPort}/api`;
  const response=await fetch(api+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:'ui_branch_a',password:syntheticCredential('legacy-ui')})});
  if(!response.ok)throw Error('Fixture login failed');
  const cookie=response.headers.get('set-cookie').split(';')[0];
  const sale=await fetch(api+'/branch/walkin-sales',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},
    body:JSON.stringify({id:'UI-SAVED-DP-SALE',branch:'townshop',customerType:'non_member',saleNumber:'UI-SAVED-DP-RECEIPT',
      total:443,subtotal:443,products:[{name:'TEST-ITEM',quantity:1,unit_price:443}]})});
  if(sale.status!==201)throw Error('Fixture sale failed: '+await sale.text());
  await db.query(`UPDATE product_prices SET dp=999,cp=1234 WHERE description='TEST-ITEM'`);
  await mkdir(dir,{recursive:true});
  await writeFile(`${dir}/sale-evidence.json`,JSON.stringify({synthetic:true,reference:'UI-SAVED-DP-SALE',
    receipt:'UI-SAVED-DP-RECEIPT',dp:341,charged:443,commercialMargin:102,originalCif:70,originalReceivedDPC:23,
    currentCatalogueDP:999,openRequests:6,branchStock:9,createdAt:(await db.query('SELECT sale_date FROM branch_walkin_sales WHERE id=$1',['UI-SAVED-DP-SALE'])).rows[0].sale_date},null,2));
  console.log('Isolated sale evidence ready: saved DP 341 / charged 443 / margin 102; current catalogue DP 999; six open requests. No live data used.');
}finally{await db.end();}
