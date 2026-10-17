// @vitest-environment node
import {describe, it, expect, vi, afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
import {createStartupPolicy, runStartupOperation, STARTUP_OPERATIONS,
  LEGACY_BOOTSTRAP_EFFECTS, healthDigestEnabled} from './startupPolicy.js';
import {checkStartupCompatibility, REQUIRED_STARTUP_SCHEMA, startupReadinessGate,
  setStartupReadiness} from './startupSchema.js';

const db = vi.hoisted(() => ({query:vi.fn(), getOne:vi.fn(), getMany:vi.fn(),
  withTransaction:vi.fn(), withRequestTransaction:vi.fn()}));
const scheduler = vi.hoisted(() => ({ensureStockSummaryTable:vi.fn(), startStockScheduler:vi.fn()}));
const prices = vi.hoisted(() => ({ensurePriceImportSchema:vi.fn(), activateDuePrices:vi.fn()}));
const stock = vi.hoisted(() => ({seedInventoryBalances:vi.fn(), recomputeLocationBalances:vi.fn()}));
vi.mock('../db.js', () => db);
vi.mock('./stockScheduler.js', () => scheduler);
vi.mock('./priceImport.js', () => prices);
vi.mock('./stockEngine.js', () => stock);

const completeRows = () => Object.entries(REQUIRED_STARTUP_SCHEMA)
  .flatMap(([table_name,names]) => names.map(column_name => ({table_name,column_name,readable:true})));
const policy = createStartupPolicy({STARTUP_MODE:'code-only'});
const response = () => ({status:vi.fn().mockReturnThis(), json:vi.fn().mockReturnThis(),
  setHeader:vi.fn(), end:vi.fn()});
afterEach(() => {vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks();});

describe('central startup policy', () => {
  it('retains every legacy entrypoint and disabled historical guard when mode is unset', () => {
    const legacy = createStartupPolicy();
    expect(legacy.writesAllowed).toBe(true);
    expect(legacy.enableStockScheduler).toBe(true);
    const seen = [];
    for (const id of Object.keys(STARTUP_OPERATIONS))
      runStartupOperation(legacy,id,() => seen.push(id));
    expect(seen).toEqual(Object.keys(STARTUP_OPERATIONS));
    expect(readFileSync(new URL('../../server.js',import.meta.url),'utf8'))
      .toContain('const runLegacyStockRepairs = false');
  });
  it('skips every registered effect, including seeds, repairs and all scheduler children', () => {
    const calls = vi.fn(), logs = [];
    for (const id of Object.keys(STARTUP_OPERATIONS))
      runStartupOperation(policy,id,calls,line => logs.push(JSON.parse(line)));
    expect(calls).not.toHaveBeenCalled();
    for (const operation of [...Object.keys(STARTUP_OPERATIONS),
      ...Object.values(STARTUP_OPERATIONS).flat()])
      expect(logs).toContainEqual(expect.objectContaining({operation,event:'startup.operation.skipped'}));
    expect(LEGACY_BOOTSTRAP_EFFECTS).toContain('stock-scheduler');
  });
  it.each(['', 'safe', 'LEGACY', 'code_only'])('fails closed on unknown mode %j', mode => {
    expect(() => createStartupPolicy({STARTUP_MODE:mode})).toThrow('Invalid STARTUP_MODE');
  });
  it.each(['ALLOW_SCHEMA_SYNC','ALLOW_REFERENCE_SEEDS','ALLOW_INVENTORY_SEED',
    'ALLOW_STOCK_SUMMARY_DDL','ENABLE_STOCK_SCHEDULER'])('rejects code-only override %s', name => {
    expect(() => createStartupPolicy({STARTUP_MODE:'code-only',[name]:'true'})).toThrow('forbids');
    expect(createStartupPolicy({STARTUP_MODE:'code-only',[name]:'false'}).writesAllowed).toBe(false);
  });
  it('rejects malformed booleans and unregistered operations', () => {
    expect(() => createStartupPolicy({ALLOW_SCHEMA_SYNC:'yes'})).toThrow('Invalid boolean');
    expect(() => runStartupOperation(policy,'unknown',vi.fn())).toThrow('Unregistered');
  });
});

describe('read-only existing-schema compatibility', () => {
  it('uses one catalogue SELECT, passes complete schema and exposes only safe policy fields', async () => {
    const query = vi.fn(async sql => {
      expect(sql.trim()).toMatch(/^SELECT/);
      expect(String(sql)).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|CALL|BEGIN|COMMIT)\b/i);
      return {rows:completeRows()};
    });
    const result = await checkStartupCompatibility(query,policy);
    expect(query).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({compatible:true,missingTables:[],missingColumns:[],
      startupMode:'code-only',writesAllowed:false,schedulerEnabled:false});
  });
  it('reports missing table and column without ever creating or repairing anything', async () => {
    const query = vi.fn(async () => ({rows:completeRows().filter(r =>
      r.table_name !== 'users' && !(r.table_name === 'stock_requests' && r.column_name === 'updated_by'))}));
    const result = await checkStartupCompatibility(query,policy);
    expect(result.compatible).toBe(false);
    expect(result.missingTables).toEqual(['users']);
    expect(result.missingColumns).toEqual(['stock_requests.updated_by']);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('fails closed on inaccessible tables and redacts connection/query errors', async () => {
    const result = await checkStartupCompatibility(async () => ({rows:completeRows()
      .map(r => ({...r,readable:r.table_name !== 'users'}))}),policy);
    expect(result.unreadableTables).toEqual(['users']);
    const failed = await checkStartupCompatibility(async () => {throw Error('synthetic-secret-uri');},policy);
    expect(failed.compatible).toBe(false);
    expect(JSON.stringify(failed)).not.toContain('synthetic-secret-uri');
  });
  it('blocks all HTTP/API reads while incompatible and allows compatible reads', () => {
    const res = response(), next = vi.fn();
    setStartupReadiness({startupMode:'code-only',compatible:false});
    startupReadinessGate({path:'/api/prices'},res,next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
    setStartupReadiness({startupMode:'code-only',compatible:true});
    startupReadinessGate({},res,next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('actual server boot in an owned disposable Node environment', () => {
  it.each([true,false])('serves only compatible business routes: %s; never writes or schedules', async compatible => {
    vi.resetModules();
    vi.stubEnv('STARTUP_MODE','code-only');
    vi.stubEnv('PORT','0');
    vi.stubEnv('HOST','127.0.0.1');
    for (const flag of ['ALLOW_SCHEMA_SYNC','ALLOW_REFERENCE_SEEDS','ALLOW_INVENTORY_SEED',
      'ALLOW_STOCK_SUMMARY_DDL','ENABLE_STOCK_SCHEDULER']) vi.stubEnv(flag,'false');
    db.query.mockImplementation(async sql => {
      if (!/^\s*SELECT\b/i.test(sql)) throw Error('Write/DDL attempted');
      if (sql.includes('pg_catalog')) return {rows:compatible ? completeRows() : []};
      return {rows:[{one:1}]};
    });
    const intervals = vi.spyOn(globalThis,'setInterval');
    vi.spyOn(console,'info').mockImplementation(() => {});
    vi.spyOn(console,'log').mockImplementation(() => {});
    const {server} = await import('../../server.js');
    try {
      if (!server.listening) await new Promise(resolve => server.once('listening',resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      const health = await fetch(base+'/api/health');
      const body = await health.json();
      expect(health.status).toBe(compatible ? 200 : 503);
      expect(body.startup).toMatchObject({compatible,startupMode:'code-only',
        writesAllowed:false,schedulerEnabled:false});
      if (!compatible) expect((await fetch(base+'/api/prices')).status).toBe(503);
      expect(intervals).not.toHaveBeenCalled();
      for (const fn of [...Object.values(prices),...Object.values(stock),...Object.values(scheduler)])
        expect(fn).not.toHaveBeenCalled();
      expect(db.getOne).not.toHaveBeenCalled();
      expect(db.withTransaction).not.toHaveBeenCalled();
      expect(db.query.mock.calls.every(([sql]) => /^\s*SELECT\b/i.test(sql))).toBe(true);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
  it('has no unguarded top-level database bootstrap or timer entrypoint', () => {
    const text = readFileSync(new URL('../../server.js',import.meta.url),'utf8');
    const ast = parse(text,{sourceType:'module'});
    // These formerly unconditional statements must only be passed as lazy callbacks.
    for (const statement of ast.program.body) {
      if (statement.type !== 'ExpressionStatement') continue;
      const expression = statement.expression;
      const name = expression.callee?.name;
      expect(['setInterval','initProductPricesTable','applyPendingPriceChanges']).not.toContain(name);
      expect(expression.callee?.type).not.toBe('ArrowFunctionExpression');
    }
  });
});

describe('independent digest quarantine, unapplied to production', () => {
  it('also denies direct scheduler startup in code-only, not only the web wrapper', async () => {
    vi.stubEnv('STARTUP_MODE','code-only');
    const intervals = vi.spyOn(globalThis,'setInterval');
    vi.spyOn(console,'info').mockImplementation(() => {});
    const real = await vi.importActual('./stockScheduler.js');
    real.startStockScheduler();
    expect(intervals).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });
  it('preserves the default and rejects invalid values', () => {
    expect(healthDigestEnabled()).toBe(true);
    expect(healthDigestEnabled({ENABLE_STOCK_HEALTH_DIGEST:'true'})).toBe(true);
    expect(healthDigestEnabled({ENABLE_STOCK_HEALTH_DIGEST:'false'})).toBe(false);
    expect(() => healthDigestEnabled({ENABLE_STOCK_HEALTH_DIGEST:'no'})).toThrow('Invalid');
  });
  it('skips only the digest before any database reads/writes', async () => {
    vi.stubEnv('ENABLE_STOCK_HEALTH_DIGEST','false');
    const {runNightlyStockHealthDigest,runAutoWriteOff} = await import('./stockAutomation.js');
    await runNightlyStockHealthDigest();
    expect(db.getOne).not.toHaveBeenCalled();
    expect(db.getMany).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
    expect(typeof runAutoWriteOff).toBe('function');
  });
});
