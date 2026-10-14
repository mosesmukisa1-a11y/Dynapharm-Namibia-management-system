import {readFile,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {assertIsolatedTestDatabase} from '../api/testDatabaseGuard.js';
const base='generated-artifacts/hochland-sale-demo';
const manifest=JSON.parse(await readFile(`${base}/environment.json`,'utf8'));
if(!manifest.disposable || !/^stock_audit_[a-f0-9]{32}$/.test(manifest.isolatedDatabase))throw Error('Owned manifest required');
const url=new URL(process.env.DATABASE_URL);
if(url.pathname.slice(1)===manifest.isolatedDatabase)throw Error('Source cannot be target');
url.pathname='/'+manifest.isolatedDatabase;url.search='';url.hash='';
assertIsolatedTestDatabase({...process.env,DATABASE_URL:url.toString(),STOCK_AUDIT_ISOLATED:'1',STOCK_AUDIT_DATABASE:manifest.isolatedDatabase});
const label=process.argv[2] || 'snapshot';
if(!/^[a-z-]+$/.test(label))throw Error('Invalid snapshot label');
const db=new pg.Pool({connectionString:url.toString(),max:1,ssl:new pg.Client({connectionString:process.env.DATABASE_URL}).connectionParameters.ssl});
try{
  const identity=(await db.query('SELECT current_database() AS name,NOW() AS timestamp')).rows[0];
  if(identity.name!==manifest.isolatedDatabase)throw Error('Wrong database');
  const result={synthetic:true,capturedAt:identity.timestamp,tables:{}};
  // Fixed table allowlist, no staff-password/session table and no business rows.
  for(const table of ['stock_batches','branch_inventory_batches','inventory_balances','branch_walkin_sales',
    'branch_inventory_movements','stock_movements','stock_sale_allocations','branch_activity_transactions',
    'branch_distributor_profit','stock_control_financial_entries','branch_payments','branch_expenses','stock_transfers',
    'branch_refund_requests','stock_linked_reversals','stock_control_operations','stock_segregated_batches']){
    if(!(await db.query('SELECT to_regclass($1) AS name',[`public.${table}`])).rows[0].name)continue;
    result.tables[table]=(await db.query(`SELECT row_to_json(t) AS row FROM ${table} t LIMIT 100`)).rows.map(row=>row.row);
  }
  result.balances=(await db.query(`SELECT
    (SELECT COALESCE(SUM(remaining_quantity),0) FROM stock_batches) AS warehouse,
    (SELECT COALESCE(SUM(quantity),0) FROM branch_inventory_batches WHERE branch_id='hochland-park') AS branch,
    (SELECT COUNT(*) FROM branch_walkin_sales WHERE status='completed') AS completed_sales`)).rows[0];
  result.priceSources={
    raw:(await db.query(`SELECT description,dp,cp FROM product_prices WHERE description=$1`,["SPIRULINA TABLET (100's)"])).rows,
    live:(await db.query(`SELECT description,dp,cp FROM live_product_prices WHERE description=$1`,["SPIRULINA TABLET (100's)"])).rows,
  };
  await writeFile(`${base}/${label}-database.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify({snapshot:label,balances:result.balances,
    counts:Object.fromEntries(Object.entries(result.tables).map(([table,rows])=>[table,rows.length]))}));
}finally{await db.end();}
