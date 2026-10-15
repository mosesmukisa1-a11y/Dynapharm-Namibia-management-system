import {fixture,capture} from './final-release-fixture-probe.mjs';
import {releaseEvidenceRoot as root} from './release-evidence-paths.mjs';
import {businessToday} from '../shared/price-list-import.js';
import {writeFile} from 'node:fs/promises';
const {db}=await fixture();
try{
  const p=(await db.query("SELECT * FROM product_prices WHERE product_code='TEST-ITEM'")).rows[0];
  if(!p||Number(p.dp)!==341)throw Error('Fresh synthetic pricebook expected; refusing existing/changed fixture');
  if((await db.query('SELECT id FROM product_price_history WHERE product_id=$1',[p.id])).rowCount)
    throw Error('Expected no earlier price schedule in fresh fixture');
  const h=(await db.query(`INSERT INTO product_price_history(product_id,description,old_dp,old_cp,old_cif,old_bv,
    new_dp,new_cp,new_cif,new_bv,changed_by,effective_from,status)
    VALUES($1,$2,341,443,23,0,351,453,23,0,'Synthetic fixture schedule',$3,'pending') RETURNING id`,
    [p.id,p.description,businessToday()])).rows[0];
  const evidence={method:'Fresh due schedule setup only, not human approval. Actual GM approval is required at activation.',
    productId:p.id,historyId:h.id,today:businessToday(),scope:'global',before:await capture(db)};
  await writeFile(root+'/scheduled-price-fixture.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({productId:p.id,historyId:h.id,today:businessToday()}));
}finally{await db.end();}
