// @vitest-environment node
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../api/db.js';
import handler from '../api/stock/branch-clearance.js';
import controlled from '../api/stock/controlled-operations.js';
import { ensureControlledStockSchema } from '../api/services/controlledStock.js';
import { lifecycleSchema } from '../api/services/stockCostLayers.js';
import { CLEARANCE_CONFIRMATION, protectedClearanceProduct } from '../api/services/branchStockClearance.js';

const p='TEST-BC-'+randomUUID(), a=p+'-A', b=p+'-B', stock=p+'-STOCK';
const gm={id:p+'-GM',sub:p+'-GM',role:'gm'}, other={id:p+'-OTHER',role:'gm'};
const expiry='2035-01-01', product=p+'-ITEM';
const confirm={confirmation:CLEARANCE_CONFIRMATION,backup_verified:true,accept_missing_cost:true};
async function call(body={},user=gm,method='POST',api=handler,queryParams={}) {
  const result={status:200};
  const res={setHeader(){},getHeader(){},status(s){result.status=s;return this;},json(v){result.body=v;return this;},end(){}};
  await api({method,headers:{},user,body,query:queryParams},res);return result;
}
async function preview(branch=a) {
  const result=await call({action:'preview',branch_ids:[branch]});
  expect(result.status,JSON.stringify(result.body)).toBe(200);return result.body;
}
async function execute(id,extra={}) {return call({action:'execute',id,...confirm,...extra});}
async function baseline() {
  return {
    physical:(await query('SELECT * FROM branch_inventory_batches WHERE branch_id=ANY($1) ORDER BY id',[[a,b,stock]])).rows,
    warehouse:(await query('SELECT * FROM stock_batches WHERE id=$1',[stock])).rows,
    held:(await query('SELECT * FROM stock_segregated_batches WHERE location=$1',[a])).rows,
    movements:(await query('SELECT * FROM stock_movements WHERE product_name LIKE $1 ORDER BY id',[p+'%'])).rows,
    bim:(await query('SELECT * FROM branch_inventory_movements WHERE branch_id=ANY($1) ORDER BY id',[[a,b]])).rows,
    financial:(await query(`SELECT f.* FROM stock_control_financial_entries f JOIN stock_control_operations o
      ON o.id=f.operation_id WHERE o.created_by=$1 ORDER BY f.id`,[gm.id])).rows,
  };
}
async function clean() {
  await query(`DELETE FROM stock_control_financial_entries WHERE operation_id IN
    (SELECT id FROM stock_control_operations WHERE created_by=$1)`,[gm.id]);
  await query('DELETE FROM stock_control_operations WHERE created_by=$1',[gm.id]);
  await query('DELETE FROM stock_adjustments WHERE id LIKE $1',[p+'%']);
  await query('DELETE FROM stock_transfer_allocations WHERE transfer_id LIKE $1',[p+'%']);
  await query('DELETE FROM stock_transfer_items WHERE transfer_id LIKE $1',[p+'%']);
  await query('DELETE FROM stock_transfers WHERE id LIKE $1',[p+'%']);
  await query('DELETE FROM branch_inventory_movements WHERE branch_id=ANY($1)',[[a,b]]);
  await query('DELETE FROM stock_movements WHERE product_name LIKE $1 OR reference_id LIKE $1',[p+'%']);
  await query('DELETE FROM inventory_balances WHERE location_id=ANY($1) OR product_name LIKE $2',[[a,b,stock,'quarantine:'+a],p+'%']);
  await query('DELETE FROM stock_segregated_batches WHERE location=$1',[a]);
  await query('DELETE FROM branch_inventory_batches WHERE branch_id=ANY($1)',[[a,b,stock]]);
  await query('DELETE FROM stock_batches WHERE id=$1',[stock]);
  await query('DELETE FROM branches WHERE id=ANY($1)',[[a,b]]);
  await query('DELETE FROM users WHERE id=ANY($1)',[[gm.id,other.id]]);
}
beforeAll(async()=>{await ensureControlledStockSchema();await query(lifecycleSchema);});
beforeEach(async()=>{
  await clean();
  await query(`INSERT INTO users(id,username,password_hash,full_name,role,is_active,must_change_password)
    VALUES($1,$1,'unit-test-only-not-a-login','Synthetic GM','gm',true,false),
      ($2,$2,'unit-test-only-not-a-login','Synthetic other GM','gm',true,false)`,[gm.id,other.id]);
  await query("INSERT INTO branches(id,name,code,status) VALUES($1,'Shared name','A','active'),($2,'Shared name','B','active')",[a,b]);
  await query(`INSERT INTO stock_batches(id,description,batch_no,quantity,remaining_quantity,location,status)
    VALUES($1,$2,'LOT',9,9,$1,'available')`,[stock,product]);
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,status,unit_price,metadata)
    VALUES($1,$2,$3,'LOT',$4,10,'in_stock',900,$5)`,
  [p+'-ROW',a,product,expiry,JSON.stringify({cost_layers:[{quantity:10,source:{
    id:stock,cif_unit_cost:2,received_unit_cif_exact:'2.000000000000000001'}}],original_note:'retain me'})]);
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,quantity,status,unit_price,metadata)
    VALUES($1,$2,$3,'UNK',2,'in_stock',900,'{}'),($4,$5,$3,'BAD',7,'out_of_stock',900,'{}'),
      ($6,$7,$3,'SHADOW',8,'in_stock',900,'{}')`,
  [p+'-UNKNOWN',a,product+'-UNKNOWN',p+'-BAD',b,p+'-SHADOW',stock]);
  for(const [i,name,qty] of [[0,'D.I GROW BIO-8 1 LTR',20],[1,'HERBA WARISAN MAHARANI 6 x 10g',3],[2,"DYNA SERENOA TABLET 30's",5]])
    await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,quantity,status,metadata)
      VALUES($1,$2,$3,'KEEP',$4,'in_stock','{}')`,[p+'-KEEP-'+i,a,name,qty]);
  await query(`INSERT INTO stock_segregated_batches(id,source_type,source_id,location,condition,quantity,snapshot,operation_id,line_id,purpose)
    VALUES($1,'branch',$2,$3,'damaged',2,$4,'historical','line','inspection')`,
  [p+'-HELD',p+'-ROW',a,JSON.stringify({product_name:product+'-HELD',batch_no:'HELD',expiry_date:expiry,unit_cost:'2.000000000000000001'})]);
});
afterAll(clean);
it('protects every approved family/pack/case and does not exempt unrelated DI products',()=>{
  for(const name of ['D.I GROW GREEN 4L','D.I.GROW K 1 LTR','1001 D.I GROW BIO-8',"dyna serenoa 100's",'HERBAL WARISAN MAHARANI'])
    expect(protectedClearanceProduct(name)).toBe(true);
  expect(protectedClearanceProduct('DI NONI JUICE')).toBe(false);
});
it('authenticates, denies other roles and rejects invalid branch scope/another GM preview',async()=>{
  expect((await call({action:'preview'},null)).status).toBe(401);
  for(const role of ['branch_manager','stock','finance','director','consultant'])
    expect((await call({action:'preview'},{...gm,role})).status).toBe(403);
  expect((await call({action:'preview',branch_ids:[stock]})).status).toBe(400);
  expect((await call({action:'preview',branch_ids:'all'})).status).toBe(400);
  const saved=await preview();
  expect((await call({action:'execute',id:saved.id,...confirm},other)).status).toBe(403);
  expect((await call({},other,'GET',handler,{id:saved.id})).status).toBe(403);
});
it('preview posts no stock/money; exact IDs preserve duplicate display-name locations and warehouse shadows',async()=>{
  const before=await baseline(), saved=await preview();
  expect(saved.rows).toHaveLength(3);expect(saved.total_units).toBe(14);
  expect(saved.protected_units).toBe(28);expect(saved.missing_cost_units).toBe(2);
  expect(saved.rows.every(r=>r.branch_id===a)).toBe(true);
  expect(saved.rows.every(r=>!('raw_before_json' in r))).toBe(true);
  expect(await baseline()).toEqual(before);
  expect((await preview(b)).blocked_rows).toBe(1);
});
it('denies stale GM claims, inactive staff and initial-password accounts using current staff records',async()=>{
  await query("UPDATE users SET role='branch_manager' WHERE id=$1",[gm.id]);
  expect((await call({action:'preview',branch_ids:[a]})).status).toBe(403);
  await query("UPDATE users SET role='gm',is_active=false WHERE id=$1",[gm.id]);
  expect((await call({action:'preview',branch_ids:[a]})).status).toBe(403);
  await query('UPDATE users SET is_active=true,must_change_password=true WHERE id=$1',[gm.id]);
  expect((await call({action:'preview',branch_ids:[a]})).status).toBe(403);
});
it('keeps a same-ID warehouse and its open warehouse count outside branch ownership',async()=>{
  await query('UPDATE stock_batches SET location=$1 WHERE id=$2',[a,stock]);
  await query(`INSERT INTO stock_control_operations(id,kind,status,reason,created_by,lines)
    VALUES($1,'count','draft','Synthetic warehouse namespace check',$2,$3)`,
  [p+'-WH-COUNT',gm.id,JSON.stringify([{snapshot:{batch_type:'warehouse',location:a,product_name:product}}])]);
  const saved=await preview(),before=await baseline();
  expect(saved.blocked_rows).toBe(0);
  expect((await execute(saved.id)).status).toBe(200);
  expect((await baseline()).warehouse).toEqual(before.warehouse);
});
it('requires confirmation/backup and acknowledges unknown original cost without DP fallback',async()=>{
  const saved=await preview(), before=await baseline();
  expect((await execute(saved.id,{confirmation:'yes'})).status).toBe(400);
  expect((await execute(saved.id,{backup_verified:false})).status).toBe(400);
  expect((await execute(saved.id,{accept_missing_cost:false})).status).toBe(400);
  expect(await baseline()).toEqual(before);
  expect(saved.rows.find(r=>r.id===p+'-UNKNOWN').cost.known_cost).toBe('0');
});
it('rejects an all-branch preview after a newly registered branch changes the exact scope',async()=>{
  const saved=(await call({action:'preview',branch_ids:[]})).body;
  expect(saved.all_branches).toBe(true);
  const added=p+'-NEW-BRANCH';
  await query("INSERT INTO branches(id,name,code,status) VALUES($1,'Synthetic newly registered branch','NEW','active')",[added]);
  try {
    const before=await baseline(),result=await execute(saved.id);
    expect(result.status).toBe(409);expect(result.body.error).toContain('branch register changed');
    expect(await baseline()).toEqual(before);
  } finally {await query('DELETE FROM branches WHERE id=$1',[added]);}
});
it('writes off exact available/held IDs once, preserves history/warehouse/exemptions and precise original cost',async()=>{
  const before=await baseline(), saved=await preview();
  const result=await execute(saved.id);expect(result.status,JSON.stringify(result.body)).toBe(200);
  const after=await baseline();
  expect(after.physical.find(r=>r.id===p+'-ROW').quantity).toBe('0.00');
  expect(Number(after.held[0].quantity)).toBe(0);
  expect(after.warehouse).toEqual(before.warehouse);
  expect(after.physical.filter(r=>r.id.includes('-KEEP-'))).toEqual(before.physical.filter(r=>r.id.includes('-KEEP-')));
  expect(after.physical.find(r=>r.id===p+'-BAD')).toEqual(before.physical.find(r=>r.id===p+'-BAD'));
  expect(after.physical.find(r=>r.id===p+'-SHADOW')).toEqual(before.physical.find(r=>r.id===p+'-SHADOW'));
  expect(after.movements).toHaveLength(3);
  expect(after.movements.every(r=>r.created_by===gm.id&&r.approved_by===gm.id&&r.disposal_status==='pending_disposal')).toBe(true);
  const financial=(await query('SELECT sum(amount)::text AS total FROM stock_control_financial_entries WHERE operation_id=$1',[saved.id])).rows[0].total;
  expect(Number(financial)).toBe(24);
  expect(financial).toContain('000000000000000012');
  const audit=(await query('SELECT lines FROM stock_control_operations WHERE id=$1',[saved.id])).rows[0].lines[0];
  expect(JSON.parse(audit.rows.find(r=>r.id===p+'-ROW').raw_before_json).metadata.original_note).toBe('retain me');
  expect(after.physical.find(r=>r.id===p+'-ROW').metadata.cost_layers).toEqual([]);
  expect((await execute(saved.id)).body.unchanged).toBe(true);
  expect(await baseline()).toEqual(after);
});
it('rejects stale stock or newly inserted physical rows after preview, without repairs',async()=>{
  const saved=await preview();
  await query('UPDATE branch_inventory_batches SET quantity=quantity-1 WHERE id=$1',[p+'-UNKNOWN']);
  const changed=await baseline();
  expect((await execute(saved.id)).status).toBe(409);expect(await baseline()).toEqual(changed);
  const fresh=await preview();
  await query("INSERT INTO branch_inventory_batches(id,branch_id,product_name,quantity,status) VALUES($1,$2,$3,1,'in_stock')",[p+'-NEW',a,product+'-NEW']);
  const newer=await baseline();
  expect((await execute(fresh.id)).status).toBe(409);expect(await baseline()).toEqual(newer);
});
it('blocks contradictory status and overlapping pending write-off while leaving records untouched',async()=>{
  const bad=await preview(b), before=await baseline();
  expect((await execute(bad.id)).status).toBe(409);expect(await baseline()).toEqual(before);
  await query(`INSERT INTO stock_movements(id,product_name,quantity,movement_type,source_location,source_location_type,status)
    VALUES($1,$2,1,'write_off',$3,'branch','pending_approval')`,[p+'-PENDING',product,a]);
  const saved=await preview(), pending=await baseline();
  expect(saved.blocked_rows).toBeGreaterThan(0);
  expect((await execute(saved.id)).status).toBe(409);expect(await baseline()).toEqual(pending);
});
it('prevents access or approval through the generic controlled-stock handler',async()=>{
  const saved=await preview();
  expect((await call({id:saved.id,action:'review'},gm,'PATCH',controlled)).status).toBe(403);
  expect((await call({},gm,'GET',controlled,{operation_id:saved.id})).status).toBe(404);
});
it('treats an ambiguous legacy branch label as a blocker, not permission to merge location records',async()=>{
  await query(`INSERT INTO stock_movements(id,product_name,quantity,movement_type,source_location,source_location_type,status)
    VALUES($1,$2,1,'write_off','Shared name','branch','pending_approval')`,[p+'-LEGACY',product+'-OLD',]);
  const saved=await preview(),before=await baseline();
  expect(saved.blocked_rows).toBe(3);
  expect(saved.branch_ids).toEqual([a]);
  expect((await execute(saved.id)).status).toBe(409);expect(await baseline()).toEqual(before);
});
it('blocks pending branch edits instead of allowing an old adjustment to recreate cleared stock',async()=>{
  await query(`INSERT INTO stock_adjustments(id,target_type,target_id,product_name,location,field_to_adjust,old_value,new_value,reason,requested_by,status)
    VALUES($1,'branch_inventory',$2,$3,$4,'quantity','10','12','Synthetic pending edit',$5,'pending')`,
  [p+'-EDIT',p+'-ROW',product,a,gm.id]);
  const saved=await preview(),before=await baseline();
  expect(saved.rows.find(r=>r.id===p+'-ROW').flags.some(f=>f.includes('Pending stock edit'))).toBe(true);
  expect((await execute(saved.id)).status).toBe(409);expect(await baseline()).toEqual(before);
});
it('guards approved allocations using physical source identity even when transfer header has a legacy name',async()=>{
  const transfer=p+'-TRANSFER';
  await query(`INSERT INTO stock_transfers(id,from_warehouse,to_branch,status,gm_approved_by)
    VALUES($1,'Legacy display name',$2,'approved',$3)`,[transfer,b,gm.id]);
  const line=(await query(`INSERT INTO stock_transfer_items(transfer_id,product_id,product_name,quantity,quantity_approved)
    VALUES($1,$2,$2,3,3) RETURNING id`,[transfer,product])).rows[0].id;
  await query(`INSERT INTO stock_transfer_allocations(id,transfer_id,line_id,source_type,source_id,quantity,snapshot)
    VALUES($1,$2,$3,'branch',$4,3,$5)`,
  [p+'-ALLOCATION',transfer,line,p+'-ROW',JSON.stringify({product_name:product})]);
  const saved=await preview(),before=await baseline();
  expect(saved.reserved_transfers).toEqual([transfer]);
  expect((await execute(saved.id)).status).toBe(409);expect(await baseline()).toEqual(before);
});
it('does not allow client-supplied actor, quantity, exceptions or reason to control the posted batch',async()=>{
  const saved=await preview();
  expect((await execute(saved.id,{approved_by:'forged',quantity:1,reason:'forged',exclude_products:[]})).status).toBe(200);
  const audit=(await query('SELECT created_by,reason FROM stock_control_operations WHERE id=$1',[saved.id])).rows[0];
  expect(audit.created_by).toBe(gm.id);expect(audit.reason).not.toBe('forged');
  expect((await baseline()).movements.every(m=>m.approved_by===gm.id)).toBe(true);
  expect((await baseline()).physical.filter(r=>r.id.includes('-KEEP-')).reduce((s,r)=>s+Number(r.quantity),0)).toBe(28);
  const restored=await call({},gm,'GET',handler,{id:saved.id});
  expect(restored.status).toBe(200);expect(restored.body.status).toBe('approved');
});
it('rolls back a later ledger failure and permits a corrected same-preview retry',async()=>{
  const saved=await preview(), before=await baseline(), name='bc_fail_'+randomUUID().replaceAll('-','');
  await query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.product_name LIKE '%-UNKNOWN' AND NEW.reference_type='branch_clearance' THEN RAISE EXCEPTION 'Synthetic late ledger failure'; END IF;
    RETURN NEW; END $$; CREATE TRIGGER ${name} BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION ${name}()`);
  try {expect((await execute(saved.id)).status).toBe(500);expect(await baseline()).toEqual(before);}
  finally {await query(`DROP TRIGGER ${name} ON stock_movements; DROP FUNCTION ${name}()`);}
  expect((await execute(saved.id)).status).toBe(200);
});
it('serializes an actual contended execution and rejects a second stale preview',async()=>{
  const one=await preview(), two=await preview();
  let release;const held=new Promise(r=>release=r);let entered;
  const ready=new Promise(r=>entered=r);
  const lock=withTransaction(async client=>{
    await client.query('LOCK TABLE branch_inventory_batches IN EXCLUSIVE MODE');entered();await held;
  });
  await ready;
  let finished=false;
  const winner=execute(one.id).then(r=>{finished=true;return r;});
  await new Promise(r=>setTimeout(r,100));expect(finished).toBe(false);
  release();await lock;
  expect((await winner).status).toBe(200);
  const after=await baseline();
  expect((await execute(two.id)).status).toBe(409);
  expect((await execute(one.id)).body.unchanged).toBe(true);
  expect(await baseline()).toEqual(after);
});
