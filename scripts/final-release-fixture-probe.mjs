import pg from 'pg';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {assertIsolatedTestDatabase} from '../api/testDatabaseGuard.js';
const directory='generated-artifacts/final-release-gate/browser-evidence';
export async function fixture(){
 const m=JSON.parse(await readFile(`${directory}/environment.json`,'utf8'));
 if(!m.disposable||!/^stock_audit_[a-f0-9]{32}$/.test(m.isolatedDatabase))throw Error('Unknown owned fixture');
 const url=new URL(process.env.DATABASE_URL);
 if(!['helium','localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Local source only');
 url.pathname='/'+m.isolatedDatabase;url.search='';url.hash='';
 const env={...process.env,NODE_ENV:'test',REPLIT_DEPLOYMENT:'0',STOCK_AUDIT_ISOLATED:'1',STOCK_AUDIT_DATABASE:m.isolatedDatabase,DATABASE_URL:url.toString()};
 assertIsolatedTestDatabase(env);
 const db=new pg.Pool({connectionString:url.toString(),max:2});
 if((await db.query('SELECT current_database() n')).rows[0].n!==m.isolatedDatabase)throw Error('Wrong database');
 return {m,db};
}
export async function capture(db){
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
 const fingerprint={};
 for(const t of ['branch_inventory_batches','inventory_balances','stock_movements','branch_inventory_movements',
  'branch_walkin_sales','stock_sale_allocations','branch_distributor_profit','branch_activity_transactions',
  'mis_sales_audit','stock_requests','product_price_history']){
  fingerprint[t]=(await db.query(`SELECT COUNT(*)::int count,md5(COALESCE(string_agg(row_to_json(x)::text,'' ORDER BY row_to_json(x)::text),'')) hash FROM ${t} x`)).rows[0];
 }
 const stock=(await db.query("SELECT branch_id,product_name,SUM(quantity)::numeric quantity FROM branch_inventory_batches GROUP BY branch_id,product_name ORDER BY 1,2")).rows;
 const sales=(await db.query("SELECT id,branch_id,data,created_at FROM branch_walkin_sales ORDER BY created_at")).rows;
 const movements=(await db.query("SELECT id,reference_id,quantity,unit_dp,created_at,metadata FROM stock_movements ORDER BY created_at")).rows;
 await db.query('COMMIT');
 return {recordedAt:new Date().toISOString(),fingerprint,stock,sales,movements};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
if(process.argv[1]?.endsWith('/final-release-fixture-probe.mjs')){
 const {db}=await fixture();try{
 const value=await capture(db),label=process.argv[2]||'snapshot';
 if(!/^[a-z0-9_-]{1,50}$/.test(label))throw Error('Unsafe stage');
 await mkdir(directory,{recursive:true});await writeFile(`${directory}/${label}.json`,JSON.stringify(value,null,2));
 console.log(JSON.stringify({stage:label,stock:value.stock,counts:Object.fromEntries(Object.entries(value.fingerprint).map(([k,v])=>[k,v.count]))}));
 }finally{await db.end();}
}
