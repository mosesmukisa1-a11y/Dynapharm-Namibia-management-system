import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { assertIsolatedTestDatabase } from '../api/testDatabaseGuard.js';
const manifest = JSON.parse(await readFile('generated-artifacts/stock-navigation-audit/environment.json','utf8'));
if (!manifest.disposable || manifest.backendPort !== 3003) throw Error('Wrong disposable environment');
const url = new URL(process.env.DATABASE_URL);
url.pathname = `/${manifest.isolatedDatabase}`; url.search = ''; url.hash = '';
const env = {...process.env,DATABASE_URL:url.toString(),STOCK_AUDIT_ISOLATED:'1',STOCK_AUDIT_DATABASE:manifest.isolatedDatabase};
assertIsolatedTestDatabase(env);
const pool = new pg.Pool({connectionString:url.toString()});
try {
  if ((await pool.query('SELECT current_database() AS name')).rows[0].name !== manifest.isolatedDatabase) throw Error('Wrong target');
  await pool.query(`INSERT INTO product_prices(description,product_code,dp,cp,cif,bv,updated_by)
    SELECT 'TEST-ITEM','TEST-ITEM',7,9,2,0,'isolated-postpublish-fixture'
    WHERE NOT EXISTS(SELECT 1 FROM product_prices WHERE description='TEST-ITEM')`);
  console.log('Disposable TEST-ITEM price catalog seeded; no stock quantities changed.');
} finally { await pool.end(); }
