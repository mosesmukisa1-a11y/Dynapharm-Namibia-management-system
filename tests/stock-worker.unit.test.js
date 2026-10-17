// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {workerConfig} from '../worker/config.mjs';
import {TASKS} from '../worker/tasks.mjs';
import {windhoekParts,dueSlot,workerEvent} from '../worker/dates.mjs';
import {identity} from '../worker/runner.mjs';
import {createStartupPolicy,assertCodeOnlyWebProfile} from '../api/services/startupPolicy.js';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const profile={STARTUP_MODE:'code-only',ALLOW_SCHEMA_SYNC:'false',ALLOW_REFERENCE_SEEDS:'false',
  ALLOW_INVENTORY_SEED:'false',ALLOW_STOCK_SUMMARY_DDL:'false',ENABLE_STOCK_SCHEDULER:'false',
  ENABLE_STOCK_HEALTH_DIGEST:'false',WORKER_ENABLED:'false'};
describe('production web fail closed',()=>{
  it('retains development legacy but never production fallback',()=>{
    expect(createStartupPolicy({}).startupMode).toBe('legacy');
    expect(()=>createStartupPolicy({NODE_ENV:'production'})).toThrow();
    expect(()=>createStartupPolicy({REPLIT_DEPLOYMENT:'1'})).toThrow();
    expect(createStartupPolicy({...profile,NODE_ENV:'production'}).writesAllowed).toBe(false);
  });
  for(const name of Object.keys(profile))it('rejects missing/malformed production '+name,()=>{
    const missing={...profile,NODE_ENV:'production'};delete missing[name];
    expect(()=>createStartupPolicy(missing)).toThrow();
    expect(()=>createStartupPolicy({...profile,NODE_ENV:'production',[name]:'invalid'})).toThrow();
    expect(()=>assertCodeOnlyWebProfile({...profile,[name]:'true'})).toThrow();
  });
  it('web never imports worker or exposes its task entrypoint',()=>{
    const s=readFileSync('server.js','utf8');
    expect(s).not.toMatch(/import.*worker\/|startStockWorker/);
  });
});
describe('worker internal and configuration allowlists',()=>{
  it('defaults completely off without credentials or SQL',()=>{
    const c=workerConfig({});expect(c.enabled).toBe(false);expect(c.jobs).toEqual([]);
    const r=spawnSync(process.execPath,['worker/main.mjs'],{env:{PATH:process.env.PATH},encoding:'utf8'});
    expect(r.status).toBe(0);expect(r.stdout).toContain('"timersStarted":false');
  });
  it('has exactly fourteen assessed tasks, only proven drift detection eligible',()=>{
    expect(TASKS).toHaveLength(14);expect(TASKS.filter(t=>t.status==='ENABLED').map(t=>t.id)).toEqual(['drift-detection']);
  });
  for(const t of TASKS.filter(t=>t.status!=='ENABLED'))it('cannot enable quarantined '+t.id,()=>{
    expect(()=>workerConfig({WORKER_ENABLED:'true',[t.flag]:'true'})).toThrow(/quarantined/);
  });
  it('rejects unknown tasks and malformed flags',()=>{
    expect(()=>workerConfig({WORKER_SURPRISE:'true'})).toThrow();
    expect(()=>workerConfig({WORKER_ENABLED:'yes'})).toThrow();
    expect(()=>workerConfig({WORKER_DRIFT_DETECTION:'true'})).toThrow();
  });
  it('requires typed exact scopes and dedicated credentials, not web fallback',()=>{
    expect(()=>workerConfig({WORKER_ENABLED:'true',WORKER_DRIFT_DETECTION:'true',DATABASE_URL:'ignored'})).toThrow();
    const e={WORKER_ENABLED:'true',WORKER_DRIFT_DETECTION:'true',WORKER_DATABASE_URL:'test',WORKER_SCOPE:'branch:A'};
    expect(workerConfig(e).scope).toEqual([{type:'branch',id:'A'}]);
    expect(()=>workerConfig({...e,WORKER_SCOPE:'branch:A,branch:A'})).toThrow();
    expect(()=>workerConfig({...e,WORKER_SCOPE:'warehouse:A;DROP'})).toThrow();
    expect(()=>workerConfig({...e,WORKER_TIMEZONE:'UTC'})).toThrow();
    expect(()=>workerConfig({...e,WORKER_TIMEOUT_MS:'0'})).toThrow();
  });
  it('uses deterministic scoped idempotency but global task lock',()=>{
    const a=identity('drift-detection','2026-10-15',[{type:'branch',id:'A'}]);
    const b=identity('drift-detection','2026-10-15',[{type:'warehouse',id:'A'}]);
    expect(a.key).not.toBe(b.key);expect(a.lock).toBe(b.lock);
    expect(identity('drift-detection:dry-run','2026-10-15',[{type:'branch',id:'A'}]).lock).toBe(a.lock);
  });
});
describe('Windhoek business dates independent of host timezone',()=>{
  it.each([
    ['2026-10-14T21:59:59.999Z','2026-10-14',23,59],
    ['2026-10-14T22:00:00.000Z','2026-10-15',0,0],
    ['2026-10-14T22:00:00.001Z','2026-10-15',0,0],
    ['2026-10-15T22:00:00.000Z','2026-10-16',0,0],
    ['2026-01-14T22:00:00.000Z','2026-01-15',0,0],
    ['2016-07-14T22:59:59.999Z','2016-07-14',23,59],
    ['2016-07-14T23:00:00.000Z','2016-07-15',0,0],
  ])('%s maps to %s',(instant,date,hour,minute)=>{
    expect(windhoekParts(new Date(instant))).toMatchObject({date,hour,minute});
  });
  it('runs only at the configured local slot, never catches up at boot',()=>{
    expect(dueSlot('drift-detection',new Date('2026-10-14T23:00:00Z'))).toBe('2026-10-15');
    expect(dueSlot('drift-detection',new Date('2026-10-14T23:01:00Z'))).toBeNull();
    expect(dueSlot('daily-summary',new Date('2026-10-14T23:00:00Z'))).toBeNull();
  });
  it('keeps UTC and labelled local timestamps distinct',()=>{
    const e=workerEvent({kind:'start'},new Date('2026-10-14T22:00:00Z'));
    expect(e.timestampUtc).toBe('2026-10-14T22:00:00.000Z');
    expect(e.timestampWindhoek).toContain('2026-10-15 00:00:00 Africa/Windhoek');
  });
});
