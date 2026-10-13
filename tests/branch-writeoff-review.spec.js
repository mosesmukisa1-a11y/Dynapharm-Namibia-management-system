// @vitest-environment node
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { query, withRequestTransaction } from '../api/db.js';
import login from '../api/auth/login.js';
import movements from '../api/stock-movements.js';
import { getTokenFromRequest, verifyAuthToken } from '../api/_lib/auth.js';

const prefix = 'TEST-WO-' + randomUUID();
const branch = 'townshop', product = prefix + '-PRODUCT';
const password = randomUUID();
let server, base, staff, gm, admin, director, pause;
async function call(cookie, method, body) {
  const response = await fetch(base + '/api/stock-movements', {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? {Cookie:cookie} : {}) },
    body:JSON.stringify(body),
  });
  return {status:response.status, body:await response.json()};
}
async function signIn(role) {
  const response = await fetch(base + '/api/auth/login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:prefix+'-'+role,password}),
  });
  expect(response.status).toBe(200);
  return response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
}
async function request(extra = {}, cookie = staff) {
  return call(cookie,'POST',{movement_type:'write_off',product_name:product,
    source_location:branch,batch_no:'LOT',
    quantity:4,reason:'damaged',created_by:'FORGED-ACTOR',...extra});
}
async function state() {
  return {
    physical:(await query('SELECT id,quantity,metadata FROM branch_inventory_batches WHERE product_name=$1 ORDER BY id',[product])).rows,
    movements:(await query('SELECT id,status,created_by,approved_by,disposal_status FROM stock_movements WHERE product_name=$1 ORDER BY id',[product])).rows,
    ledger:(await query('SELECT type,quantity,created_by FROM branch_inventory_movements WHERE product_name=$1 ORDER BY id',[product])).rows,
    balances:(await query('SELECT * FROM inventory_balances WHERE product_name=$1 ORDER BY id',[product])).rows,
  };
}
async function units() {
  return Number((await query('SELECT COALESCE(SUM(quantity),0) AS qty FROM branch_inventory_batches WHERE product_name=$1',[product])).rows[0].qty);
}
async function cleanup() {
  await query('DELETE FROM branch_inventory_movements WHERE product_name=$1',[product]);
  await query('DELETE FROM stock_movements WHERE product_name=$1',[product]);
  await query('DELETE FROM branch_inventory_batches WHERE product_name=$1',[product]);
  await query('DELETE FROM inventory_balances WHERE product_name=$1',[product]);
}
beforeAll(async()=>{
  const hash = await bcrypt.hash(password,10);
  for (const role of ['stock_manager','gm','admin','director']) {
    await query(`INSERT INTO users(id,username,password_hash,full_name,role,branch,is_active,must_change_password)
      VALUES($1,$1,$2,$3,$4,$5,true,false)`,[prefix+'-'+role,hash,'Synthetic '+role,role,branch]);
  }
  const app = express(); app.use(express.json());
  app.post('/api/auth/login',login);
  // Same signed-cookie decoding used by server.js, with real login-generated claims.
  app.use((req,res,next)=>{
    const decoded=verifyAuthToken(getTokenFromRequest(req));
    if(decoded)req.user=decoded;
    next();
  });
  app.all('/api/stock-movements',async(req,res)=>{
    if (!pause || req.body.test_gate !== pause.key) return movements(req,res);
    // Hold the winner's real transaction after its handler completes. This is
    // scheduling only: no SQL results or business handler behavior are mocked.
    let status=200,payload;
    const buffered={setHeader(){},status(s){status=s;return this;},json(v){payload=v;return this;}};
    try {
      await withRequestTransaction(async()=>{
        const pid=Number((await query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
        await movements(req,buffered);
        pause.ready({pid,status,payload});
        await pause.release;
      });
      res.status(status).json(payload);
    } catch(error) {res.status(500).json({error:error.message});}
  });
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  base='http://127.0.0.1:'+server.address().port;
  [staff,gm,admin,director]=await Promise.all(['stock_manager','gm','admin','director'].map(signIn));
});
beforeEach(async()=>{
  await cleanup();
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,status,metadata)
    VALUES($1,$2,$3,'LOT','2035-01-01',10,'in_stock',$4)`,
    [prefix+'-BATCH',branch,product,JSON.stringify({cost_layers:[{quantity:10,source:{id:prefix+'-SOURCE',cif_unit_cost:2}}]})]);
});
afterAll(async()=>{
  await new Promise(resolve=>server?.close(resolve));
  await cleanup();
  await query('DELETE FROM notifications WHERE message LIKE $1',['%'+product+'%']);
  await query('DELETE FROM hr_records WHERE employee_id LIKE $1',[prefix+'%']);
  await query('DELETE FROM users WHERE id LIKE $1',[prefix+'%']);
});
it.each([undefined,'posted','approved','rejected'])('forces review for client status %s without any deduction',async(status)=>{
  const before=await state();
  const result=await request(status===undefined?{}:{status});
  expect(result.status).toBe(201);
  expect(result.body).toMatchObject({created_by:'Synthetic stock_manager'});
  const after=await state();
  expect(after.movements[0]).toMatchObject({status:'pending_approval',created_by:'Synthetic stock_manager'});
  expect(after.physical).toEqual(before.physical);
  expect(after.balances).toEqual(before.balances);
  expect(after.ledger).toEqual([]);
});
it('authenticates submissions and denies staff approval, then GM approval deducts exactly once with distinct actors',async()=>{
  expect((await request({},null)).status).toBe(401);
  const created=await request();
  const decision={id:created.body.id,action:'approve',approved_by:'FORGED-GM'};
  expect((await call(staff,'PUT',decision)).status).toBe(403);
  expect(await units()).toBe(10);
  expect((await call(gm,'PUT',decision)).status).toBe(200);
  expect(await units()).toBe(6);
  const after=await state();
  expect(after.movements[0]).toMatchObject({status:'approved',created_by:'Synthetic stock_manager',approved_by:'Synthetic gm'});
  expect(after.ledger).toHaveLength(1);
  expect(after.ledger[0]).toMatchObject({type:'write_off',created_by:'Synthetic gm'});
  expect(Number(after.ledger[0].quantity)).toBe(4);
  expect((await call(gm,'PUT',decision)).status).toBe(200);
  expect(await state()).toEqual(after);
});
it('admin rejection leaves stock and ledger unchanged and cannot later be approved',async()=>{
  const created=await request(),before=await state();
  expect((await call(admin,'PUT',{id:created.body.id,action:'reject'})).status).toBe(200);
  expect((await state()).physical).toEqual(before.physical);
  expect((await state()).ledger).toEqual([]);
  expect((await state()).movements[0]).toMatchObject({status:'rejected',approved_by:'Synthetic admin'});
  expect((await call(gm,'PUT',{id:created.body.id,action:'approve'})).status).toBe(200);
  expect(await units()).toBe(10);
});
it.each(['approve','approve_all','reject','reject_all'])('denies authenticated director %s without changing any stock or request',async(action)=>{
  const created=await request({},director),before=await state();
  expect(created.status).toBe(201);
  expect(before.movements[0]).toMatchObject({status:'pending_approval',created_by:'Synthetic director'});
  const result=await call(director,'PUT',{id:created.body.id,ids:[created.body.id],action});
  expect(result.status).toBe(403);
  expect(await state()).toEqual(before);
});
it('rolls back insufficient and bulk approvals, retaining both requests and cost layers',async()=>{
  const first=await request({quantity:4}),second=await request({quantity:8}),before=await state();
  expect((await call(gm,'PUT',{ids:[first.body.id,second.body.id],action:'approve_all'})).status).toBe(409);
  expect(await state()).toEqual(before);
  const tooLarge=await request({quantity:11}),now=await state();
  expect((await call(gm,'PUT',{id:tooLarge.body.id,action:'approve'})).status).toBe(409);
  expect(await state()).toEqual(now);
});
it('preserves existing posted historical records',async()=>{
  await query(`INSERT INTO stock_movements(id,product_name,movement_type,quantity,source_location,status,created_by)
    VALUES($1,$2,'write_off',2,$3,'posted','Original historical actor')`,[prefix+'-OLD',product,branch]);
  const before=(await state()).movements.find(r=>r.id===prefix+'-OLD');
  await request();
  await call(gm,'PUT',{id:prefix+'-OLD',action:'approve'});
  expect((await state()).movements.find(r=>r.id===prefix+'-OLD')).toEqual(before);
  expect(await units()).toBe(10);
});
it('rolls back physical stock, cost layers, balance and approval after a late ledger failure',async()=>{
  const created=await request(),before=await state();
  await query(`CREATE FUNCTION test_writeoff_ledger_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.product_name = '${product}' THEN RAISE EXCEPTION 'Disposable write-off ledger failure'; END IF;
    RETURN NEW; END $$`);
  await query(`CREATE TRIGGER test_writeoff_ledger_failure BEFORE INSERT ON branch_inventory_movements
    FOR EACH ROW EXECUTE FUNCTION test_writeoff_ledger_failure()`);
  try {
    expect((await call(gm,'PUT',{id:created.body.id,action:'approve'})).status).toBe(500);
    expect(await state()).toEqual(before);
  } finally {
    await query('DROP TRIGGER test_writeoff_ledger_failure ON branch_inventory_movements');
    await query('DROP FUNCTION test_writeoff_ledger_failure()');
  }
});
it('fully deducts a requested lot split across multiple physical cost layers',async()=>{
  await query('UPDATE branch_inventory_batches SET quantity=3,metadata=$2 WHERE id=$1',
    [prefix+'-BATCH',JSON.stringify({cost_layers:[{quantity:3,source:{id:prefix+'-SOURCE',cif_unit_cost:2}}]})]);
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,quantity,status,metadata)
    VALUES($1,$2,$3,'LOT',7,'in_stock',$4)`,
    [prefix+'-BATCH2',branch,product,JSON.stringify({cost_layers:[{quantity:7,source:{id:prefix+'-SOURCE2',cif_unit_cost:3}}]})]);
  const created=await request({quantity:8});
  expect((await call(admin,'PUT',{id:created.body.id,action:'approve'})).status).toBe(200);
  expect(await units()).toBe(2);
  expect((await state()).physical[0].metadata.cost_layers[0]).toMatchObject({quantity:2,source:{cif_unit_cost:3}});
});
it.each(['sale','approval'])('serializes a competing sale and approval when %s wins; loser rolls back',async(winner)=>{
  const created=await request({quantity:7});
  let ready,release;
  const readyPromise=new Promise(r=>ready=r),releasePromise=new Promise(r=>release=r);
  pause={key:randomUUID(),ready,release:releasePromise};
  const sale={movement_type:'sale',product_name:product,source_location:branch,source_location_type:'branch',quantity:7};
  const approval={id:created.body.id,action:'approve'};
  const winning=call(winner==='sale'?staff:gm,winner==='sale'?'POST':'PUT',
    {...(winner==='sale'?sale:approval),test_gate:pause.key});
  let losing;
  try {
    const held=await readyPromise;
    expect(held.status).toBe(winner==='sale'?201:200);
    losing=call(winner==='sale'?gm:staff,winner==='sale'?'PUT':'POST',winner==='sale'?approval:sale);
    const deadline=Date.now()+5000;
    let blocked=false;
    while(Date.now()<deadline) {
      blocked=(await query('SELECT 1 FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))',[held.pid])).rowCount>0;
      if(blocked)break;
      await new Promise(r=>setTimeout(r,25));
    }
    expect(blocked,'competing real transaction must wait on winner locks').toBe(true);
  } finally {release(); await winning; if(losing)await losing; pause=null;}
  expect((await losing).status).toBe(409);
  expect(await units()).toBe(3);
  const after=await state();
  expect(after.ledger).toHaveLength(1);
  expect(after.movements.find(r=>r.id===created.body.id).status).toBe(winner==='sale'?'pending_approval':'approved');
  expect(after.movements.filter(r=>r.status==='posted')).toHaveLength(winner==='sale'?1:0);
});
