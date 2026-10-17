// @vitest-environment node
import {beforeEach,afterEach,it,expect,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
  client:{query:vi.fn(),release:vi.fn()},
  connect:vi.fn(),on:vi.fn(),
}));
vi.mock('pg',()=>({Pool:class {
  connect(...args){return mocks.connect(...args);}
  on(...args){return mocks.on(...args);}
}}));
vi.mock('../api/testDatabaseGuard.js',()=>({
  isTestProcess:()=>false,assertIsolatedTestDatabase:vi.fn(),
  verifyIsolatedTestConnection:vi.fn(),
}));
beforeEach(()=>{
  vi.resetModules();
  vi.clearAllMocks();
  mocks.client.query.mockReset();
  mocks.client.query.mockResolvedValue({rows:[{unlocked:true}]});
  mocks.connect.mockResolvedValue(mocks.client);
  vi.stubEnv('DATABASE_URL','postgresql://localhost/synthetic_pool_test');
});
afterEach(()=>vi.unstubAllEnvs());
it('locks before BEGIN and snapshot reads, then unlocks after COMMIT',async()=>{
  const {withTransaction}=await import('../api/db.js');
  const result=await withTransaction(async client=>{
    expect(Object.isFrozen(client)).toBe(true);
    expect(Object.keys(client)).toEqual(['query']);
    expect(client.release).toBeUndefined();expect(client.connect).toBeUndefined();
    const before=mocks.client.query.mock.calls.length;
    expect(()=>client.query('COMMIT')).toThrow('Query boundary');
    expect(mocks.client.query).toHaveBeenCalledTimes(before);
    const {transactionIsolationDescriptor}=await import('../api/services/queryDescriptors.js');
    await client.query(transactionIsolationDescriptor('repeatable-read'));
    return 42;
  },{advisoryLockBeforeBegin:123});
  expect(result).toBe(42);
  expect(mocks.client.query.mock.calls.map(([sql])=>sql)).toEqual([
    'SELECT pg_advisory_lock($1)','BEGIN',
    'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ','SELECT 1','COMMIT',
    'SELECT pg_advisory_unlock($1) AS unlocked',
  ]);
  expect(mocks.client.release).toHaveBeenCalledWith(undefined);
});
it('expires an escaped facade when the wrapper finishes',async()=>{
  const {withTransaction}=await import('../api/db.js');
  const {crudDescriptor}=await import('../api/services/queryDescriptors.js');
  let escaped;await withTransaction(async client=>{escaped=client;});
  const before=mocks.client.query.mock.calls.length;
  expect(()=>escaped.query(crudDescriptor('findById','clients',{},'synthetic'))).toThrow('Transaction context is closed');
  expect(mocks.client.query).toHaveBeenCalledTimes(before);
});
it('rolls back and releases the session lock when the callback fails',async()=>{
  const {withTransaction}=await import('../api/db.js');
  const failure=new Error('synthetic callback failure');
  await expect(withTransaction(async()=>{throw failure;},{advisoryLockBeforeBegin:123})).rejects.toBe(failure);
  expect(mocks.client.query.mock.calls.map(([sql])=>sql)).toEqual([
    'SELECT pg_advisory_lock($1)','BEGIN','ROLLBACK','SELECT pg_advisory_unlock($1) AS unlocked',
  ]);
  expect(mocks.client.release).toHaveBeenCalledWith(undefined);
});
it('destroys an uncertain locked connection without retrying committed work',async()=>{
  const {withTransaction}=await import('../api/db.js');
  const failure=new Error('synthetic unlock failure');
  mocks.client.query.mockImplementation(async sql=>{
    if(sql.includes('pg_advisory_unlock'))throw failure;
    return {rows:[]};
  });
  const callback=vi.fn().mockResolvedValue(42);
  expect(await withTransaction(callback,{advisoryLockBeforeBegin:123})).toBe(42);
  expect(callback).toHaveBeenCalledOnce();
  expect(mocks.client.release).toHaveBeenCalledWith(failure);
});
it('discards the connection if lock acquisition fails before BEGIN',async()=>{
  const {withTransaction}=await import('../api/db.js');
  const failure=new Error('synthetic acquisition failure');
  mocks.client.query.mockRejectedValueOnce(failure);
  await expect(withTransaction(async()=>{}, {advisoryLockBeforeBegin:123})).rejects.toBe(failure);
  expect(mocks.client.query).toHaveBeenCalledTimes(1);
  expect(mocks.client.release).toHaveBeenCalledWith(failure);
});
