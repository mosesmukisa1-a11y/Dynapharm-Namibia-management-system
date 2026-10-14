// Synthetic catalogue/stock only, guarded against every non-owned database.
import {readFile,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {assertIsolatedTestDatabase} from '../api/testDatabaseGuard.js';
const base='generated-artifacts/hochland-sale-demo';
const manifest=JSON.parse(await readFile(`${base}/environment.json`,'utf8'));
if(!manifest.disposable || !/^stock_audit_[a-f0-9]{32}$/.test(manifest.isolatedDatabase))
  throw Error('Owned disposable manifest required');
const url=new URL(process.env.DATABASE_URL);
if(url.pathname.slice(1)===manifest.isolatedDatabase)throw Error('Business database cannot be the fixture');
url.pathname='/'+manifest.isolatedDatabase;url.search='';url.hash='';
assertIsolatedTestDatabase({...process.env,DATABASE_URL:url.toString(),STOCK_AUDIT_ISOLATED:'1',STOCK_AUDIT_DATABASE:manifest.isolatedDatabase});
const db=new pg.Pool({connectionString:url.toString(),max:1,
  ssl:new pg.Client({connectionString:process.env.DATABASE_URL}).connectionParameters.ssl});
const product="SPIRULINA TABLET (100's)";
try{
  if((await db.query('SELECT current_database() AS name')).rows[0].name!==manifest.isolatedDatabase)throw Error('Wrong database');
  if((await db.query("SELECT id FROM stock_batches WHERE id='DEMO-WH'")).rowCount)throw Error('Already seeded; use a fresh database');
  await db.query('BEGIN');
  await db.query(`INSERT INTO branches(id,name,code,status) VALUES('hochland-park','Hochland Park — isolated test','DEMO-HP','active') ON CONFLICT(id) DO NOTHING`);
  await db.query(`UPDATE users SET branch='hochland-park' WHERE id='UI-BRANCH-A'`);
  await db.query(`INSERT INTO products(id,sku,name,unit,dp,cp,is_active) VALUES('DEMO-SPIRULINA','DEMO-SPIRULINA',$1,'bottle',7,9,true)`,[product]);
  await db.query(`INSERT INTO product_prices(description,product_code,dp,cp,cif,bv,updated_by)
    VALUES($1,'DEMO-SPIRULINA',7,9,2,0,'isolated-sale-demo')`,[product]);
  await db.query(`INSERT INTO stock_batches(id,description,batch_no,quantity,remaining_quantity,cif_unit_cost,location,status,expiry_date)
    VALUES('DEMO-WH',$1,'DEMO-LOT',30,20,2,'windhoek_warehouse','available','2035-01-01')`,[product]);
  await db.query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,status,unit_price,source_batch_id,metadata)
    VALUES('DEMO-HP','hochland-park',$1,'DEMO-LOT','2035-01-01',10,'in_stock',7,'DEMO-WH',$2)`,
    [product,JSON.stringify({stock_unit:'bottle',cost_layers:[{quantity:10,source:{id:'DEMO-WH',cif_unit_cost:2,received_unit_cif_exact:'2'}}],synthetic:true})]);
  await db.query('COMMIT');
  await writeFile(`${base}/fixture.json`,JSON.stringify({synthetic:true,product,branch:'hochland-park',unit:'bottle',
    originalCostPerBottle:2,dpPerBottle:7,cpPerBottle:9,before:{warehouse:20,branch:10,company:30},
    expectedAfterTwo:{warehouse:20,branch:8,company:28,chargedRevenue:18,dpRevenue:14,originalCOGS:4,grossProfit:14,cpMinusDP:4}},null,2));
  console.log('Owned Hochland test seeded: 10 bottles at branch, 20 warehouse; synthetic CP 9, DP 7, original cost 2. No live stock changed.');
}catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
finally{await db.end();}
