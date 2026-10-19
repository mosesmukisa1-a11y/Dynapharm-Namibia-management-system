import {syntheticCredential, syntheticCredentialUrl} from '../../scripts/lib/synthetic-credential-fixture.mjs';
import bcrypt from 'bcryptjs';
import {query} from '../../api/db.js';
import {ensurePriceImportSchema} from '../../api/services/priceImport.js';

const prefix='TEST_PRICE_UI';
export async function cleanupPriceUi(){
  await query('DELETE FROM price_reconciliation_backups WHERE canonical_id IN(SELECT id FROM product_prices WHERE description LIKE $1)',[`${prefix}%`]);
  await query('DELETE FROM product_price_history WHERE description LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM price_import_additions WHERE description LIKE $1',[`${prefix}%`]);
  await query('UPDATE product_prices SET merged_into_id=NULL WHERE description LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM product_prices WHERE description LIKE $1',[`${prefix}%`]);
  await query("DELETE FROM hr_records WHERE employee_name='Test price review GM'");
  await query("DELETE FROM users WHERE id='test-pricelist-ui-gm'");
}
export async function seedPriceUi(){
  await ensurePriceImportSchema();await cleanupPriceUi();
  await query(`INSERT INTO users(id,username,password_hash,role,full_name,is_active,metadata)
    VALUES('test-pricelist-ui-gm','test_price_ui',$1,'gm','Test price review GM',TRUE,'{}')`,
    [await bcrypt.hash(syntheticCredential('legacy-ui'),10)]);
  const rows=(await query(`INSERT INTO product_prices(description,product_code,dp,cp,cif,bv,updated_by)
    VALUES ('TEST_PRICE_UI TEA (30''S)','TST993001',100,130,70,10,'test-price-ui'),
      ('TEST_PRICE_UI DUP (30''S)','TST993002',100,130,70,10,'test-price-ui'),
      ('TEST_PRICE_UI DUP 30''S',NULL,105,135,75,15,'test-price-ui') RETURNING id,description`)).rows;
  const duplicate=rows.find(r=>r.description==="TEST_PRICE_UI DUP 30'S");
  await query(`INSERT INTO product_price_history(product_id,description,new_dp,new_cp,new_cif,new_bv,status,effective_from,changed_by)
    VALUES($1,$2,201,261,143,32,'pending','2099-10-12','test-price-ui')`,[duplicate.id,duplicate.description]);
  console.log(JSON.stringify({fixtures:rows}));
}
if(process.argv[2]==='seed')await seedPriceUi();
if(process.argv[2]==='cleanup')await cleanupPriceUi();
if(['seed','cleanup'].includes(process.argv[2]))process.exit(0);
