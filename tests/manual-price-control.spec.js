// @vitest-environment node
import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {readFile} from 'node:fs/promises';
import {query,withTransaction} from '../api/db.js';
import {activateManualPrice,compensateManualPrice,listManualPrices} from '../api/services/manualPriceControl.js';
import {businessToday} from '../shared/price-list-import.js';
const gm={id:'TEST-MANUAL-GM',username:'test-gm',role:'gm',fullName:'Synthetic GM'};
const input={scope:'global',confirmApproval:true,approvalReference:'QA-APPROVAL-001'};
let n=0;
async function seed({date=businessToday(),old=100}={}){
  const p=(await query(`INSERT INTO product_prices(description,product_code,dp,cp,cif,bv,updated_by)
    VALUES($1,$2,100,130,20,0,'synthetic') RETURNING *`,['TEST-MANUAL-PRICE-'+(++n),'TEST-MP-'+n])).rows[0];
  const h=(await query(`INSERT INTO product_price_history(product_id,description,old_dp,old_cp,old_cif,old_bv,
    new_dp,new_cp,new_cif,new_bv,changed_by,effective_from,status)
    VALUES($1,$2,$3,130,20,0,120,150,20,0,'Synthetic GM',$4,'pending') RETURNING *`,[p.id,p.description,old,date])).rows[0];
  return {p,h};
}
const state=async id=>(await query('SELECT dp,cp,cif,bv,updated_by FROM product_prices WHERE id=$1',[id])).rows[0];
describe('manual global scheduled price control',()=>{
  beforeAll(async()=>{
    // Same SQL twice proves idempotence against the isolated existing catalogue.
    const sql=await readFile('migrations/035_manual_price_control.sql','utf8');
    await query(sql);await query(sql);
  });
  afterAll(async()=>{
    await query('DELETE FROM manual_price_actions WHERE actor_id=$1',[gm.id]);
    await query("DELETE FROM product_price_history WHERE description LIKE 'TEST-MANUAL-PRICE-%'");
    await query("DELETE FROM product_prices WHERE description LIKE 'TEST-MANUAL-PRICE-%'");
  });
  it('denies anonymous read/write and branch operator activation',async()=>{
    const {h}=await seed();
    await expect(listManualPrices(null)).rejects.toMatchObject({status:401});
    await expect(activateManualPrice(h.id,input,null)).rejects.toMatchObject({status:401});
    await expect(activateManualPrice(h.id,input,{id:'other',role:'branch_manager'})).rejects.toMatchObject({status:403});
  });
  it('lists explicit global scope and Namibia as-of day without writes',async()=>{
    const {h}=await seed();
    const result=await listManualPrices(gm);
    expect(result.today).toBe(businessToday());expect(result.timezone).toBe('Africa/Windhoek');
    expect(result.pending.find(x=>x.id===h.id).scope).toBe('global');
  });
  it('installs the additive audit table twice on a fresh pricebook schema',async()=>{
    await withTransaction(async client=>{
      await client.query('CREATE SCHEMA manual_price_fresh');
      await client.query('SET LOCAL search_path TO manual_price_fresh');
      await client.query(await readFile('migrations/027_price_import_identity.sql','utf8'));
      const sql=await readFile('migrations/035_manual_price_control.sql','utf8');
      await client.query(sql);await client.query(sql);
      expect((await client.query('SELECT COUNT(*)::int n FROM manual_price_actions')).rows[0].n).toBe(0);
      await client.query('DROP SCHEMA manual_price_fresh CASCADE');
    });
  });
  it('rejects branch scope, no approval, invalid references and staged additions',async()=>{
    const {h}=await seed();
    for(const bad of [{...input,scope:'branch'},{...input,branch_id:'townshop'},{...input,confirmApproval:false},{...input,approvalReference:''}])
      await expect(activateManualPrice(h.id,bad,gm)).rejects.toMatchObject({status:422});
    await expect(activateManualPrice('staged:1',input,gm)).rejects.toMatchObject({status:422});
    await expect(activateManualPrice('9999999999',input,gm)).rejects.toMatchObject({status:422});
  });
  it('rejects early activation and stale scheduled prior prices',async()=>{
    for(const options of [{date:'2099-01-01'},{old:99}]){
      const {p,h}=await seed(options);
      await expect(activateManualPrice(h.id,input,gm)).rejects.toMatchObject({status:409});
      expect(Number((await state(p.id)).dp)).toBe(100);
    }
  });
  it('rejects overlapping due schedules without partial mutation',async()=>{
    const {p,h}=await seed();
    await query(`INSERT INTO product_price_history(product_id,description,old_dp,old_cp,old_cif,old_bv,
      new_dp,new_cp,new_cif,new_bv,changed_by,effective_from,status)
      SELECT product_id,description,old_dp,old_cp,old_cif,old_bv,new_dp+1,new_cp,new_cif,new_bv,changed_by,effective_from,'pending'
      FROM product_price_history WHERE id=$1`,[h.id]);
    await expect(activateManualPrice(h.id,input,gm)).rejects.toMatchObject({status:409});
    expect(Number((await state(p.id)).dp)).toBe(100);
  });
  it('does not convert missing scheduled CIF evidence to zero',async()=>{
    const {p,h}=await seed();
    await query('UPDATE product_price_history SET new_cif=NULL WHERE id=$1',[h.id]);
    await expect(activateManualPrice(h.id,input,gm)).rejects.toMatchObject({status:422});
    expect(Number((await state(p.id)).dp)).toBe(100);
    expect(Number((await state(p.id)).cif)).toBe(20);
  });
  it('serializes concurrent activation and returns the committed action on uncertain-response retry',async()=>{
    const {p,h}=await seed();
    const results=await Promise.all([activateManualPrice(h.id,input,gm),activateManualPrice(h.id,input,gm)]);
    expect(results.filter(r=>r.replayed)).toHaveLength(1);
    expect(results[0].audit.id).toBe(results[1].audit.id);
    expect((await state(p.id)).updated_by).toBe('Synthetic GM');
    expect(Number((await state(p.id)).dp)).toBe(120);
    expect((await query('SELECT status FROM product_price_history WHERE id=$1',[h.id])).rows[0].status).toBe('applied');
    expect((await activateManualPrice(h.id,input,gm)).replayed).toBe(true);
    await expect(activateManualPrice(h.id,{...input,approvalReference:'OTHER-REF'},gm)).rejects.toMatchObject({status:409});
  });
  it('compensates through a new applied history and never rewrites the original evidence',async()=>{
    const {p,h}=await seed();await activateManualPrice(h.id,input,gm);
    const original=(await query('SELECT * FROM product_price_history WHERE id=$1',[h.id])).rows[0];
    const compensate={...input,approvalReference:'QA-CORRECTION-001'};
    const result=await compensateManualPrice(h.id,compensate,gm);
    expect(result.audit.history_id).not.toBe(h.id);
    expect(result.audit.reverses_history_id).toBe(h.id);
    expect(Number((await state(p.id)).dp)).toBe(100);
    expect((await compensateManualPrice(h.id,compensate,gm)).replayed).toBe(true);
    expect((await query('SELECT * FROM product_price_history WHERE id=$1',[h.id])).rows[0]).toEqual(original);
  });
  it('refuses compensation after an intervening change even if the amounts happen to match',async()=>{
    const {p,h}=await seed();await activateManualPrice(h.id,input,gm);
    await query("UPDATE product_prices SET updated_at=updated_at+interval '1 second' WHERE id=$1",[p.id]);
    await expect(compensateManualPrice(h.id,{...input,approvalReference:'CORRECTION-002'},gm)).rejects.toMatchObject({status:409});
    expect(Number((await state(p.id)).dp)).toBe(120);
  });
  it('rolls back price and status if the durable audit insert fails',async()=>{
    const {p,h}=await seed();
    await query(`ALTER TABLE manual_price_actions ADD CONSTRAINT test_manual_audit_failure CHECK(approval_reference<>'QA-FAIL-INSERT')`);
    try{
      await expect(activateManualPrice(h.id,{...input,approvalReference:'QA-FAIL-INSERT'},gm)).rejects.toThrow();
      expect(Number((await state(p.id)).dp)).toBe(100);
      expect((await query('SELECT status FROM product_price_history WHERE id=$1',[h.id])).rows[0].status).toBe('pending');
    }finally{await query('ALTER TABLE manual_price_actions DROP CONSTRAINT test_manual_audit_failure');}
    expect((await activateManualPrice(h.id,input,gm)).replayed).toBe(false);
  });
});
