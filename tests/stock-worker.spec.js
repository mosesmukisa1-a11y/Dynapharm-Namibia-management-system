// @vitest-environment node
import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from 'vitest';
import pg from 'pg';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createIsolatedTestPool} from './helpers/isolated-test-pool.js';
import {workerConfig} from '../worker/config.mjs';
import {workerReadiness} from '../worker/readiness.mjs';
import {runTask} from '../worker/runner.mjs';
import {detectDrift} from '../worker/drift.mjs';
import {windhoekParts} from '../worker/dates.mjs';
const admin=createIsolatedTestPool(),branch='worker_test_a',other='worker_test_b',product='Worker synthetic product';
const role=process.env.STOCK_AUDIT_DATABASE.replace(/^stock_audit_/,'worker_audit_');
if(!/^worker_audit_[a-f0-9]{32}$/.test(role))throw Error('Owned worker role required');
const url=new URL(process.env.DATABASE_URL);url.username=role;url.password=randomBytes(32).toString('hex');
const config=workerConfig({WORKER_ENABLED:'true',WORKER_DRIFT_DETECTION:'true',
  WORKER_DATABASE_URL:url.toString(),WORKER_SCOPE:'branch:'+branch,
  WORKER_TIMEOUT_MS:'1000',WORKER_BACKOFF_MS:'1',WORKER_MAX_ATTEMPTS:'2'});
let pool;
const stages=[];
const call=(extra={})=>runTask({pool,config,taskId:'drift-detection',log(){},...extra});
const fingerprint=async()=>{
  const result=[];
  for(const table of ['branch_inventory_batches','inventory_balances','stock_movements','stock_requests','stock_transfers','product_prices','branch_walkin_sales']){
    const r=await admin.query(`SELECT COUNT(*)::text AS n,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS h FROM ${table} t`);
    result.push([table,r.rows[0]]);
  }
  return createHash('sha256').update(JSON.stringify(result)).digest('hex');
};
beforeAll(async()=>{
  await admin.query(await readFile('migrations/034_stock_worker_journal.sql','utf8'));
  await admin.query(await readFile('migrations/034_stock_worker_journal.sql','utf8'));
  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${url.password}'`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await admin.query(`GRANT SELECT ON branches,warehouse_locations,inventory_balances,stock_batches,branch_inventory_batches TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT ON stock_worker_runs,stock_worker_events,stock_worker_findings TO ${role}`);
  await admin.query(`GRANT UPDATE ON stock_worker_runs TO ${role}`);
  pool=new pg.Pool({connectionString:url.toString(),ssl:process.env.DATABASE_SSL==='0'?false:{rejectUnauthorized:false},max:5});
  await admin.query("INSERT INTO branches(id,name,status) VALUES($1,'Owned worker A','active'),($2,'Owned worker B','active')",[branch,other]);
});
beforeEach(async()=>{
  await admin.query('DELETE FROM stock_worker_events');await admin.query('DELETE FROM stock_worker_findings');await admin.query('DELETE FROM stock_worker_runs');
  await admin.query('DELETE FROM inventory_balances WHERE location_id=ANY($1)',[[branch,other]]);
  await admin.query('DELETE FROM branch_inventory_batches WHERE branch_id=ANY($1)',[[branch,other]]);
  for(const [id,qty,cache]of [[branch,10,12],[other,7,9]]){
    await admin.query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,quantity,batch_no,expiry_date,status)
      VALUES($1,$2,$3,$4,'WORKER-BATCH','2028-01-01','active')`,['batch-'+id,id,product,qty]);
    await admin.query(`INSERT INTO inventory_balances(id,location_id,location_type,product_name,closing_qty)
      VALUES($1,$2,'branch',$3,$4)`,['balance-'+id,id,product,cache]);
  }
});
afterEach(async context=>{
  stages.push({stage:context.task.name,at:new Date().toISOString(),
    protectedFingerprint:await fingerprint(),
    runs:(await admin.query('SELECT id,task_id,business_date,status,attempts,rows_read,rows_written,service_actor FROM stock_worker_runs ORDER BY created_at')).rows,
    events:(await admin.query('SELECT kind,attempt,detail FROM stock_worker_events ORDER BY event_at')).rows,
    findings:(await admin.query('SELECT location_type,location_id,finding_type,cached_quantity,known_physical_quantity,difference FROM stock_worker_findings')).rows});
  await mkdir('generated-artifacts/stock-worker/test-evidence',{recursive:true});
  await writeFile('generated-artifacts/stock-worker/test-evidence/worker-stages.json',JSON.stringify({isolated:true,realDataCopied:false,stages},null,2));
});
afterAll(async()=>{
  await pool?.end();
  await admin.query('DELETE FROM stock_worker_events');await admin.query('DELETE FROM stock_worker_findings');await admin.query('DELETE FROM stock_worker_runs');
  await admin.query('DELETE FROM inventory_balances WHERE location_id=ANY($1)',[[branch,other]]);
  await admin.query('DELETE FROM branch_inventory_batches WHERE branch_id=ANY($1)',[[branch,other]]);
  await admin.query('DELETE FROM branches WHERE id=ANY($1)',[[branch,other]]);
  await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);await admin.end();
});
it('requires additive schema and least-privileged service role without repairing either',async()=>{
  await expect(workerReadiness(pool)).resolves.toEqual({ready:true,serviceActor:'stock-worker',schemaWrites:false});
  await expect(workerReadiness(admin)).rejects.toThrow(/privilege|Privileged/);
  await expect(pool.query("UPDATE inventory_balances SET closing_qty=0 WHERE location_id=$1",[branch])).rejects.toThrow(/permission denied/);
  await expect(pool.query("SELECT * FROM users LIMIT 1")).rejects.toThrow(/permission denied/);
  await expect(pool.query("DELETE FROM stock_worker_events")).rejects.toThrow(/permission denied/);
});
it('additive migration works on empty worker schema and idempotent existing setup',async()=>{
  const client=await admin.connect(),before=await fingerprint();
  try{
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA worker_fresh_fixture');
    await client.query('SET LOCAL search_path=worker_fresh_fixture,pg_catalog');
    const sql=await readFile('migrations/034_stock_worker_journal.sql','utf8');
    await client.query(sql);await client.query(sql);
    const {rows}=await client.query("SELECT COUNT(*)::int n FROM pg_tables WHERE schemaname='worker_fresh_fixture'");
    expect(rows[0].n).toBe(3);
  }finally{await client.query('ROLLBACK');client.release();}
  expect(await fingerprint()).toBe(before);
});
it('missing worker schema fails closed without automatic DDL',async()=>{
  const before=await fingerprint();
  await admin.query('ALTER TABLE stock_worker_runs RENAME TO stock_worker_runs_hidden');
  try{await expect(workerReadiness(pool)).rejects.toThrow(/schema contract/);}
  finally{await admin.query('ALTER TABLE stock_worker_runs_hidden RENAME TO stock_worker_runs');}
  expect(await fingerprint()).toBe(before);
});
it('detects scoped populated discrepancy with immutable business fingerprints and no repair',async()=>{
  const before=await fingerprint(),result=await call();expect(result.status).toBe('succeeded');
  const findings=(await admin.query('SELECT * FROM stock_worker_findings')).rows;
  expect(findings).toHaveLength(1);expect(findings[0]).toMatchObject({location_type:'branch',location_id:branch,
    evidence_basis:'exact_id_known_source_only'});
  expect(Number(findings[0].cached_quantity)).toBe(12);
  expect(Number(findings[0].known_physical_quantity)).toBe(10);
  expect(Number(findings[0].difference)).toBe(2);
  expect(await fingerprint()).toBe(before);
  expect((await admin.query('SELECT service_actor,rows_written FROM stock_worker_runs')).rows[0])
    .toMatchObject({service_actor:'stock-worker',rows_written:1});
});
it('duplicate invocation and restart cannot duplicate findings or completed work',async()=>{
  expect((await call()).status).toBe('succeeded');expect((await call()).status).toBe('skipped');
  const restarted=new pg.Pool({connectionString:url.toString(),ssl:process.env.DATABASE_SSL==='0'?false:{rejectUnauthorized:false}});
  try{expect((await call({pool:restarted})).status).toBe('skipped');}finally{await restarted.end();}
  expect((await admin.query('SELECT COUNT(*)::int n FROM stock_worker_findings')).rows[0].n).toBe(1);
  expect((await admin.query('SELECT attempts FROM stock_worker_runs')).rows[0].attempts).toBe(1);
});
it('lost commit acknowledgement recovers the committed success instead of repeating it',async()=>{
  const leased=await pool.connect(),original=leased.query.bind(leased);let successes=0,injected=false;
  leased.query=async(...args)=>{
    const text=typeof args[0]==='string'?args[0]:args[0].text;
    const result=await original(...args);
    if(text?.includes("status='succeeded'"))successes++;
    if(text==='COMMIT'&&successes&&!injected){injected=true;throw Object.assign(Error('Owned synthetic lost acknowledgement'),{code:'08006'});}
    return result;
  };
  const wrapped={connect:async()=>leased};
  try{
    expect((await call({pool:wrapped})).status).toBe('succeeded');
    expect(injected).toBe(true);
    expect((await call()).status).toBe('skipped');
    expect((await admin.query('SELECT COUNT(*)::int n FROM stock_worker_findings')).rows[0].n).toBe(1);
  }finally{leased.query=original;}
});
it('concurrent worker instances use the database lock, not an in-memory mutex',async()=>{
  let entered,release;const started=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
  const first=call({testImplementation:async ctx=>{entered();await hold;await detectDrift(ctx);}});
  await started;
  expect(await call()).toMatchObject({status:'skipped',reason:'locked'});
  release();expect((await first).status).toBe('succeeded');
});
it('partial failure rolls back findings, alerts once, retries and commits only once',async()=>{
  let attempts=0;const before=await fingerprint();
  const r=await call({testImplementation:async ctx=>{await detectDrift(ctx);if(++attempts===1)throw Object.assign(Error('synthetic fault'),{code:'40001'});}});
  expect(r.status).toBe('succeeded');expect(attempts).toBe(2);
  expect((await admin.query('SELECT COUNT(*)::int n FROM stock_worker_findings')).rows[0].n).toBe(1);
  expect((await admin.query("SELECT COUNT(*)::int n FROM stock_worker_events WHERE kind='failure_alert'")).rows[0].n).toBe(1);
  expect(await fingerprint()).toBe(before);
});
it('retry exhaustion persists across restart without repeated side effects',async()=>{
  const failing=()=>{throw Object.assign(Error('synthetic fault'),{code:'40001'});};
  expect((await call({testImplementation:failing})).status).toBe('failed');
  expect((await call({testImplementation:()=>{throw Error('must not execute');}})).status).toBe('failed');
  expect((await admin.query('SELECT attempts FROM stock_worker_runs')).rows[0].attempts).toBe(2);
  expect((await admin.query('SELECT COUNT(*)::int n FROM stock_worker_findings')).rows[0].n).toBe(0);
});
it('deadline cancels late work and rolls back, leaving no lock or protected writes',async()=>{
  const before=await fingerprint(),short={...config,maxAttempts:1,timeoutMs:25};
  const r=await call({config:short,testImplementation:async ctx=>{await detectDrift(ctx);await new Promise(()=>{});}});
  expect(r.status).toBe('failed');
  expect((await admin.query('SELECT COUNT(*)::int n FROM stock_worker_findings')).rows[0].n).toBe(0);
  expect(await fingerprint()).toBe(before);
  const locks=await admin.query("SELECT COUNT(*)::int n FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database())");
  expect(locks.rows[0].n).toBe(0);
});
it('graceful cancellation rolls back and records cancellation',async()=>{
  const abort=new AbortController();
  const r=await call({signal:abort.signal,testImplementation:async ctx=>{await detectDrift(ctx);abort.abort();throw Object.assign(Error('stop'),{code:'WORKER_CANCELLED'});}});
  expect(r.status).toBe('cancelled');
  expect((await admin.query('SELECT COUNT(*)::int n FROM stock_worker_findings')).rows[0].n).toBe(0);
});
it('dry-run findings roll back and do not poison the subsequent real run',async()=>{
  expect((await call({dryRun:true})).status).toBe('dry_run');
  expect((await admin.query('SELECT COUNT(*)::int n FROM stock_worker_findings')).rows[0].n).toBe(0);
  expect((await call()).status).toBe('succeeded');
});
it('rejects historical invocation, disabled task and guessed cross-branch finding',async()=>{
  await expect(call({businessDate:'2001-01-01'})).rejects.toThrow(/Historical/);
  await expect(call({taskId:'drift-repair'})).rejects.toThrow(/authorized/);
  const r=await call({config:{...config,maxAttempts:1},testImplementation:ctx=>ctx.finding({type:'branch',id:other})});
  expect(r.status).toBe('failed');
  expect((await admin.query('SELECT COUNT(*)::int n FROM stock_worker_findings')).rows[0].n).toBe(0);
});
it('unknown source/cached evidence is labelled, not forced to a zero balance',async()=>{
  await admin.query('DELETE FROM branch_inventory_batches WHERE branch_id=$1',[branch]);
  expect((await call()).status).toBe('succeeded');
  const f=(await admin.query('SELECT finding_type,difference,known_physical_quantity FROM stock_worker_findings')).rows[0];
  expect(f).toEqual({finding_type:'missing_source',difference:null,known_physical_quantity:null});
});
function cli(args=[],extra={},stopWhenReady=false){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['worker/main.mjs',...args],{env:{
      PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test',
      WORKER_ENABLED:'true',WORKER_DRIFT_DETECTION:'true',WORKER_DATABASE_URL:url.toString(),
      WORKER_SCOPE:'branch:'+branch,WORKER_POLL_MS:'60000',...extra},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',stopping=false;
    const deadline=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Owned worker subprocess timed out'));},10000);
    child.stdout.on('data',b=>{stdout+=b;if(stopWhenReady&&!stopping&&stdout.includes('"worker.ready"')){stopping=true;child.kill('SIGTERM');}});
    child.stderr.on('data',b=>{stderr+=b;});
    child.once('error',error=>{clearTimeout(deadline);reject(error);});
    child.once('exit',(code,signal)=>{clearTimeout(deadline);
      // Never include the private connection URI in assertions or saved evidence.
      resolve({code,signal,events:stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line)),
        errorCode:stderr.includes('quarantined')?'TASK_QUARANTINED':null});});
  });
}
it('standalone enabled worker uses dedicated credentials without any web DATABASE_URL',async()=>{
  const before=await fingerprint(),result=await cli(['--once']);
  expect(result.code).toBe(0);expect(result.events.some(e=>e.kind==='success')).toBe(true);
  expect((await cli(['--once'])).events.some(e=>e.kind==='skip')).toBe(true);
  expect(await fingerprint()).toBe(before);
});
it('worker scheduled startup and graceful SIGTERM perform no immediate business work',async()=>{
  const before=await fingerprint(),result=await cli([],{},true);
  expect(result).toMatchObject({code:0,signal:null});
  expect(result.events.some(e=>e.kind==='worker.ready')).toBe(true);
  expect((await admin.query('SELECT COUNT(*)::int n FROM stock_worker_runs')).rows[0].n).toBe(0);
  expect(await fingerprint()).toBe(before);
});
it('malformed/quarantined task configuration fails before worker startup',async()=>{
  const before=await fingerprint(),result=await cli(['--once'],{WORKER_DRIFT_REPAIR:'true'});
  expect(result.code).toBe(1);expect(result.errorCode).toBe('TASK_QUARANTINED');
  expect((await admin.query('SELECT COUNT(*)::int n FROM stock_worker_runs')).rows[0].n).toBe(0);
  expect(await fingerprint()).toBe(before);
});
