// @vitest-environment node
import {it,expect,beforeAll} from 'vitest';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {query,getOne} from '../api/db.js';
import handler from '../api/client-history.js';
import attachment from '../api/client-history-attachment.js';
import clients from '../api/clients.js';
const fd={sub:'CH-FD',role:'frontdesk',branch:'townshop'},consultant={sub:'CH-C',role:'consultant',branch:'townshop'};
async function invoke(h,method,body,user=fd,url='/api/client-history'){
 const out={status:200};const res={setHeader(){},getHeader(){},status(s){out.status=s;return this;},json(b){out.body=b;return this;},end(){return this;}};
 const req={method,body,user,url};
 Object.defineProperty(req,'headers',{get:()=>({host:'isolated.test'}),enumerable:false});
 await h(req,res);return out;
}
const post=(body,user=fd)=>invoke(handler,'POST',{operationId:randomUUID(),clientId:'CH-CLIENT',...body},user);
const balances=()=>getOne(`SELECT (SELECT COALESCE(SUM(quantity),0) FROM branch_inventory_batches) stock,
 (SELECT COUNT(*) FROM stock_movements) movements,(SELECT COUNT(*) FROM branch_activity_transactions) financial,
 (SELECT COUNT(*) FROM reports) reports,(SELECT COUNT(*) FROM online_orders) orders,
 (SELECT COUNT(*) FROM appointments) appointments,(SELECT COUNT(*) FROM stock_sale_allocations) allocations`);
const source={action:'create',serviceAt:'2026-01-10T10:00:00+02:00',source:'outreach',
 data:{originalAuthor:'Recorded external prescriber',originalFormReference:'PAPER-001',location:'Synthetic outreach',
 notes:'Original paper note',medicines:[{name:'Manual source item',quantity:5,alreadyDispensed:2,directions:'As on paper',unit:'unit'}]}};
let e;
beforeAll(async()=>{
 const migration=await readFile('migrations/032_client_history.sql','utf8');await query(migration);await query(migration);
 await query(`INSERT INTO clients(id,reference_number,full_name,phone,branch,data)
 VALUES('CH-CLIENT','CH-REFERENCE','Synthetic Client','000000','townshop','{}'),
 ('CH-OTHER','CH-OTHER-REF','Other Synthetic Client','000001','swakopmund','{}')`);
});
it('applies the additive migration twice on pre-feature schema preserving existing clients',async()=>{
 await query('BEGIN');
 try{
  await query('CREATE SCHEMA client_history_migration_test');await query('SET LOCAL search_path TO client_history_migration_test');
  await query('CREATE TABLE clients(id VARCHAR(255) PRIMARY KEY)');await query("INSERT INTO clients VALUES('old-client')");
  const migration=await readFile('migrations/032_client_history.sql','utf8');await query(migration);await query(migration);
  expect((await getOne('SELECT COUNT(*) n FROM clients')).n).toBe('1');
  expect((await getOne('SELECT COUNT(*) n FROM client_history_attachments')).n).toBe('0');
 }finally{await query('ROLLBACK');}
});
it('Front Desk files and replays historical transcription with no approval, order, stock or financial writes',async()=>{
 const before=await balances(),operationId=randomUUID(),payload={...source,operationId};
 const results=await Promise.all([post(payload),post(payload)]);
 expect(results.map(r=>r.status),JSON.stringify(results)).toEqual([200,200]);e=results[0].body.encounter;
 expect(e.captured_by).toBe(fd.sub);expect(e.report_id).toBeNull();expect(e.reviewed_by).toBeNull();
 expect(results[1].body.encounter.id).toBe(e.id);
 expect(await balances()).toEqual(before);
 const profile=await invoke(handler,'GET',null,consultant,'/api/client-history?clientId=CH-CLIENT');
 expect(profile.status).toBe(200);
 expect(profile.body.encounters[0].quantities[0]).toMatchObject({quantity:5,dispensed:2,outstanding:3});
 expect((await post({...payload,source:'outage'})).status).toBe(409);
});
it('Front Desk amendments preserve originals and optimistic versions without operational side effects',async()=>{
 const before=await balances();
 const body={...source,action:'amend',encounterId:e.id,version:e.version,reason:'Correct paper transcription',
 data:{...source.data,notes:'Corrected paper note',medicines:[{...source.data.medicines[0],alreadyDispensed:3}]}};
 const result=await post(body);expect(result.status).toBe(200);e=result.body.encounter;
 const history=await invoke(handler,'GET',null,fd,'/api/client-history?clientId=CH-CLIENT');
 expect(history.body.encounters[0].history.some(h=>h.snapshot.data.notes==='Original paper note')).toBe(true);
 expect(history.body.encounters[0].quantities[0].dispensed).toBe(3);
 expect((await post(body)).status).toBe(409);
 expect(await balances()).toEqual(before);
});
it('denies wrong branch/role and consultant writes; removed authoring/live actions cannot replay',async()=>{
 const before=await balances();
 for(const user of [{...fd,branch:'swakopmund'},{sub:'finance',role:'finance'},null])
  expect((await invoke(handler,'GET',null,user,'/api/client-history?clientId=CH-CLIENT')).status).toBe(user?403:401);
 expect((await post(source,consultant)).status).toBe(403);
 for(const action of ['dispense','finalize','submit','save']){
  expect((await post({...source,action,encounterId:e.id,version:e.version,mode:'live'})).status).toBe(400);
 }
 const operationId=randomUUID(),old={action:'dispense',operationId,clientId:'CH-CLIENT'};
 await query('INSERT INTO client_history_operations(id,actor,request,response) VALUES($1,$2,$3,$4)',
  [operationId,fd.sub,JSON.stringify(old),'{"success":true}']);
 expect((await post(old)).status).toBe(400);
 expect(await balances()).toEqual(before);
});
it('rejects invalid or foreign-attachment forms atomically and permits corrected retry',async()=>{
 const before=await balances(),count=await getOne('SELECT COUNT(*) n FROM client_encounters'),operationId=randomUUID();
 expect((await post({...source,operationId,data:{...source.data,medicines:[{name:'Bad',quantity:1,alreadyDispensed:2}]}})).status).toBe(400);
 expect(await getOne('SELECT COUNT(*) n FROM client_encounters')).toEqual(count);
 await query(`INSERT INTO client_history_attachments(id,client_id,name,object_name,mime_type,size,captured_by)
 VALUES('foreign','CH-OTHER','source.pdf','never-uploaded-fixture','application/pdf',5,'fixture')`);
 expect((await post({...source,data:{...source.data,attachments:[{id:'foreign'}]}})).status).toBe(400);
 expect((await post({...source,operationId})).status).toBe(200);
 expect(await balances()).toEqual(before);
});
it('preserves earlier encounter evidence read-only and fails closed when secure storage is unavailable',async()=>{
 await query(`INSERT INTO client_encounters(id,client_id,branch,service_at,source,responsible_consultant,captured_by,data)
 VALUES('earlier','CH-CLIENT','townshop','2026-01-01','paper','earlier-author','earlier-actor','{"notes":"Retain me"}')`);
 expect((await post({...source,action:'amend',encounterId:'earlier',version:1,reason:'rewrite'})).status).toBe(409);
 expect((await getOne("SELECT data FROM client_encounters WHERE id='earlier'")).data.notes).toBe('Retain me');
 const url='/api/client-history-attachment?clientId=CH-CLIENT';
 expect((await invoke(attachment,'GET',null,fd,url+'&capabilities=true')).body.available).toBe(false);
 expect((await invoke(attachment,'POST',{},fd,url)).status).toBe(503);
 expect((await invoke(attachment,'POST',{},consultant,url)).status).toBe(403);
 expect((await invoke(attachment,'GET',null,{...fd,branch:'swakopmund'},url)).status).toBe(403);
});
it('registers email-free shared clients with session-attributed idempotent retry',async()=>{
 const body={id:randomUUID(),full_name:'Synthetic Nonmember',phone:'000111',branch:'townshop',data:{nbNumber:''}};
 const created=await invoke(clients,'POST',body,fd,'/api/clients');expect(created.status).toBe(201);
 const retry=await invoke(clients,'POST',body,fd,'/api/clients');expect(retry.status).toBe(200);
 expect(retry.body.client.id).toBe(created.body.client.id);
 expect((await invoke(clients,'POST',{...body,full_name:'Different'},fd,'/api/clients')).status).toBe(409);
});
