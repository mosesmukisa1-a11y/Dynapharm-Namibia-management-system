// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {withTransaction,query} from '../api/db.js';
import handler from '../api/stock-requests.js';
import {atomicStockRequest} from '../api/_lib/atomicStockRequest.js';
const migration=readFileSync('migrations/031_stock_request_audit_fields.sql','utf8');
it('adds missing audit fields idempotently to old and fresh schemas and rolls DDL back',async()=>{
 for(const original of [false,true]){
  await withTransaction(async client=>{
   const base=readFileSync('migrations/002_create_shared_tables.sql','utf8').match(/CREATE TABLE IF NOT EXISTS stock_requests \([\s\S]*?\n\);/)[0];
   await client.query(base.replace('CREATE TABLE IF NOT EXISTS','CREATE TEMP TABLE'));
   if(original)await client.query('ALTER TABLE stock_requests ADD COLUMN last_status_change timestamptz');
   await client.query("INSERT INTO stock_requests(id,requesting_branch,status,items) VALUES('historical','townshop','pending','[]')");
   await client.query('SAVEPOINT before_migration');
   await client.query(migration);await client.query(migration);
   await client.query("UPDATE stock_requests SET updated_by='session-actor',last_status_change=NOW(),rejected_by='session-actor',rejected_at=NOW(),status='rejected' WHERE id='historical'");
   expect((await client.query('SELECT updated_by FROM stock_requests')).rows[0].updated_by).toBe('session-actor');
   await client.query('ROLLBACK TO SAVEPOINT before_migration');
   expect((await client.query('SELECT status FROM stock_requests')).rows[0].status).toBe('pending');
   await client.query('DROP TABLE pg_temp.stock_requests');
  });
 }
});
async function invoke(user,body,method='PUT'){
 const result={status:200};
 const res={setHeader(){},status(s){result.status=s;return this},json(b){result.body=b;return this},end(){}};
 await atomicStockRequest(handler)({method,body,url:'/api/stock-requests'+(method==='DELETE'?`?id=${body.id}`:''),headers:{host:'test'},user},res);
 return result;
}
it('rejects forged creation and bulk scope, retains reviewed records and cancels pending with session evidence',async()=>{
 const user={id:'session-creator',role:'branch_manager',branch:'townshop'};
 const a='TEST-POST-AUDIT-A',b='TEST-POST-AUDIT-B';
 try{
  expect((await invoke({id:'x',role:'distributor'},{id:a,requesting_branch:'townshop'},'POST')).status).toBe(403);
  expect((await invoke(user,{id:a,requesting_branch:'townshop',status:'approved',approved_by:'spoof'},'POST')).status).toBe(409);
  expect((await invoke(user,[{id:a,requesting_branch:'townshop'},{id:b,requesting_branch:'swakopmund'}],'POST')).status).toBe(403);
  expect((await query('SELECT id FROM stock_requests WHERE id=$1',[a])).rows).toHaveLength(0);
  expect((await invoke(user,[{id:a,requesting_branch:'townshop'},{id:b,requesting_branch:'townshop',items:[{productName:'Synthetic',quantity:1,unit:'x'.repeat(1000)}]}],'POST')).status).toBe(500);
  expect((await query('SELECT id FROM stock_requests WHERE id=ANY($1)',[[a,b]])).rows).toHaveLength(0);
  expect((await invoke(user,[{id:a,requesting_branch:'townshop',created_by:'spoof',approved_by:'spoof'},{id:b,requesting_branch:'townshop',history:[{actor:'spoof'}]}],'POST')).status).toBe(200);
  const row=(await query('SELECT * FROM stock_requests WHERE id=$1',[a])).rows[0];
  expect(row.created_by).toBe(user.id);expect(row.approved_by).toBeNull();expect(row.history[0].actor).toBe(user.id);
  expect((await invoke({id:'x',role:'distributor'},{id:a},'DELETE')).status).toBe(403);
  expect((await invoke({...user,branch:'swakopmund'},{id:a},'DELETE')).status).toBe(403);
  for(const status of ['approved','received']){
   await query('UPDATE stock_requests SET status=$2 WHERE id=$1',[a,status]);
   expect((await invoke({id:'gm',role:'gm'},{id:a},'DELETE')).status).toBe(409);
  }
  expect((await invoke(user,{id:b},'DELETE')).status).toBe(200);
  expect((await invoke(user,{id:b},'DELETE')).status).toBe(200);
  const retained=(await query('SELECT * FROM stock_requests WHERE id=$1',[b])).rows[0];
  expect(retained.status).toBe('cancelled');expect(retained.updated_by).toBe(user.id);
  expect(retained.history.filter(e=>e.action==='cancelled')).toHaveLength(1);
 }finally{await query('DELETE FROM stock_requests WHERE id=ANY($1)',[[a,b]]);}
});
it('attributes rejection to session, keeps retry timestamps, denies roles and branches',async()=>{
 await query(migration);
 const id='TEST-REQUEST-MIGRATION';
 await query("INSERT INTO stock_requests(id,requesting_branch,status,items) VALUES($1,'townshop','pending','[]')",[id]);
 try{
  expect((await invoke({id:'outsider',role:'distributor'},{id,status:'rejected'})).status).toBe(403);
  expect((await invoke({id:'other',role:'branch_manager',branch:'swakopmund'},{id,notes:'forbidden'})).status).toBe(403);
  const user={id:'session-gm',role:'gm'};
  expect((await invoke({id:'staff',role:'branch_manager',branch:'townshop'},{id,approval:{approved:true,role:'gm'}})).status).toBe(403);
  const failed=await invoke(user,{id,status:'approved',items:[{productName:'Synthetic',quantity:1,unit:'x'.repeat(1000)}]});
  expect(failed.status).toBe(500);
  expect((await query('SELECT status FROM stock_requests WHERE id=$1',[id])).rows[0].status).toBe('pending');
  expect((await invoke(user,{id,status:'approved',items:[{productName:'Synthetic',quantity:1,unit:'unit'}]})).status).toBe(200);
  expect((await invoke(user,{id,status:'rejected',updated_by:'spoof',rejected_by:'spoof'})).status).toBe(200);
  const before=(await query('SELECT * FROM stock_requests WHERE id=$1',[id])).rows[0];
  expect(before.updated_by).toBe('session-gm');expect(before.rejected_by).toBe('session-gm');
  expect((await invoke(user,{id,status:'rejected'})).status).toBe(200);
  const after=(await query('SELECT * FROM stock_requests WHERE id=$1',[id])).rows[0];
  expect(after.rejected_at).toEqual(before.rejected_at);
  expect(after.last_status_change).toEqual(before.last_status_change);
  expect((await invoke(user,{id,status:'approved'})).status).toBe(200);
  expect((await invoke({id:'session-stock',role:'stock'},{id,status:'dispatched',dispatched_by:'spoof'})).status).toBe(200);
  const dispatched=(await query('SELECT * FROM stock_requests WHERE id=$1',[id])).rows[0];
  expect(dispatched.dispatched_by).toBe('session-stock');
  expect(dispatched.dispatched_at).toBeTruthy();
  expect((await invoke({id:'session-stock',role:'stock'},{id,status:'rejected'})).status).toBe(200);
 }finally{await query('DELETE FROM stock_requests WHERE id=$1',[id]);}
});
