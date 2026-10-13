// Synthetic-only fixture, bound to the owned disposable browser environment.
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { assertIsolatedTestDatabase } from '../api/testDatabaseGuard.js';

const base='generated-artifacts/branch-stock-clearance/ui';
const manifest=JSON.parse(await readFile(`${base}/environment.json`,'utf8'));
if (!manifest.disposable || !/^stock_audit_[a-f0-9]{32}$/.test(manifest.isolatedDatabase))
  throw Error('Owned disposable environment manifest required');
const url=new URL(process.env.DATABASE_URL);
if (url.pathname.slice(1)===manifest.isolatedDatabase) throw Error('Source and disposable databases must differ');
url.pathname='/'+manifest.isolatedDatabase;
url.search='';url.hash='';
const env={...process.env,DATABASE_URL:url.toString(),STOCK_AUDIT_ISOLATED:'1',STOCK_AUDIT_DATABASE:manifest.isolatedDatabase};
assertIsolatedTestDatabase(env);
const db=new pg.Pool({connectionString:url.toString(),max:1,
  ssl:new pg.Client({connectionString:process.env.DATABASE_URL}).connectionParameters.ssl});
try {
  const hasRows=(await db.query("SELECT COUNT(*)::int AS n FROM branch_inventory_batches WHERE id LIKE 'BC-UI-%'")).rows[0].n;
  if(hasRows) throw Error('This fixture has already been seeded; use a fresh disposable environment');
  await db.query('BEGIN');
  await db.query(`INSERT INTO branches(id,name,code,status) VALUES
    ('townshop','Synthetic Branch A','BC-A','active'),('swakopmund','Synthetic Branch B','BC-B','active')
    ON CONFLICT(id) DO NOTHING`);
  await db.query(`INSERT INTO stock_batches(id,description,batch_no,quantity,remaining_quantity,cif_unit_cost,location,status)
    VALUES('BC-UI-WH','TEST-ITEM','BC-LOT',9,9,2,'windhoek_warehouse','available')`);
  await db.query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,status,unit_price,metadata)
    VALUES('BC-UI-MAIN','townshop','TEST-ITEM','BC-LOT','2035-01-01',10,'in_stock',900,$1)`,
  [JSON.stringify({cost_layers:[{quantity:10,source:{id:'BC-UI-WH',cif_unit_cost:2,received_unit_cif_exact:'2'}}],original_note:'synthetic retained history'})]);
  await db.query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,quantity,status,unit_price,metadata)
    VALUES('BC-UI-UNKNOWN','townshop','TEST-ITEM UNKNOWN','BC-UNKNOWN',2,'in_stock',900,'{}'),
    ('BC-UI-BLOCKED','swakopmund','TEST-ITEM BLOCKED','BC-BAD',7,'out_of_stock',900,'{}'),
    ('BC-UI-SHADOW','windhoek_warehouse','TEST-ITEM','BC-SHADOW',8,'in_stock',900,'{}'),
    ('BC-UI-DIGROW','townshop','D.I GROW BIO-8 1 LTR','KEEP',20,'in_stock',900,'{}'),
    ('BC-UI-HERBA','townshop','HERBA WARISAN MAHARANI','KEEP',3,'in_stock',900,'{}'),
    ('BC-UI-SERENOA','townshop','DYNA SERENOA TABLET','KEEP',5,'in_stock',900,'{}')`);
  await db.query(`INSERT INTO stock_segregated_batches(id,source_type,source_id,location,condition,quantity,snapshot,operation_id,line_id,purpose)
    VALUES('BC-UI-HELD','branch','BC-UI-MAIN','townshop','damaged',2,$1,'synthetic-prior-inspection','line','inspection')`,
  [JSON.stringify({product_name:'TEST-ITEM HELD',batch_no:'BC-HELD',expiry_date:'2035-01-01',unit_cost:'2'})]);
  await db.query('COMMIT');
  const expected={candidateUnits:14,protectedUnits:28,knownOriginalCost:'24',missingOriginalCostUnits:2,
    blockedOtherBranchUnits:7,warehouseUnits:9,excludedWarehouseShadowUnits:8};
  await writeFile(`${base}/fixture.json`,JSON.stringify({synthetic:true,branchA:'townshop',branchB:'swakopmund',expected},null,2));
  console.log('Fresh isolated clearance fixture seeded; candidate 14, protected 28, warehouse 9; no business database writes.');
} catch(error) {await db.query('ROLLBACK').catch(()=>{});throw error;}
finally {await db.end();}
