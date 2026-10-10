// @vitest-environment node
import {afterEach, describe, expect, it, vi} from 'vitest';
import {assertIsolatedTestDatabase, installTestConnectionGuard, verifyIsolatedTestConnection} from '../api/testDatabaseGuard.js';

const name = `stock_audit_${'a'.repeat(32)}`;
const safe = {
  NODE_ENV: 'test', VITEST: 'true', STOCK_AUDIT_ISOLATED: '1',
  STOCK_AUDIT_DATABASE: name, DATABASE_URL: `postgresql://tester@localhost/${name}`,
  REPLIT_DEPLOYMENT: '',
};
afterEach(() => vi.unstubAllEnvs());
function useEnv(env) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

describe('fail-closed database identity', () => {
  it('accepts only the exact generated identity', () => {
    expect(assertIsolatedTestDatabase(safe)).toBe(name);
  });
  it.each([
    {STOCK_AUDIT_ISOLATED: ''},
    {STOCK_AUDIT_DATABASE: 'stock_audit_test'},
    {DATABASE_URL: 'postgresql://tester@localhost/business'},
    {DATABASE_URL: undefined},
    {DATABASE_URL: 'not a url'},
    {DATABASE_URL: `https://localhost/${name}`},
    {DATABASE_URL: `${safe.DATABASE_URL}?database=business`},
    {DATABASE_URL: `${safe.DATABASE_URL}#business`},
    {DATABASE_URL: `${safe.DATABASE_URL}/extra`},
    {REPLIT_DEPLOYMENT: '1'},
  ])('rejects unsafe configuration without connecting: %j', override => {
    expect(() => assertIsolatedTestDatabase({...safe, ...override})).toThrow('Use npm run test:db');
  });
  it('checks the server identity using only a read', async () => {
    useEnv(safe);
    const client = {query: vi.fn().mockResolvedValue({rows: [{name: 'business'}]})};
    await expect(verifyIsolatedTestConnection(client)).rejects.toThrow('shared business databases');
    expect(client.query.mock.calls).toEqual([['SELECT current_database() AS name']]);
  });
});

describe('direct PostgreSQL connection guard', () => {
  function fakePg(serverName = name) {
    class Client {
      constructor() {
        this.connectionParameters = {database: name, host: 'localhost', port: 5432, user: 'tester'};
        this.query = vi.fn().mockResolvedValue({rows: [{name: serverName}]});
        this.end = vi.fn().mockResolvedValue();
      }
      connect(callback) { callback(null); }
    }
    const original = vi.spyOn(Client.prototype, 'connect');
    const pg = {Client};
    installTestConnectionGuard(pg);
    return {pg, original};
  }
  it('refuses before any network connection or SQL when isolation is absent', async () => {
    useEnv({...safe, STOCK_AUDIT_ISOLATED: ''});
    const {pg, original} = fakePg();
    const client = new pg.Client();
    await expect(client.connect()).rejects.toThrow('Use npm run test:db');
    expect(original).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
  });
  it('rejects a pool/client overriding the configured database before connecting', async () => {
    useEnv(safe);
    const {pg, original} = fakePg();
    const client = new pg.Client();
    client.connectionParameters.database = 'business';
    await expect(client.connect()).rejects.toThrow('Use npm run test:db');
    expect(original).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
  });
  it('closes a mismatched server connection before exposing it to callers', async () => {
    useEnv(safe);
    const {pg} = fakePg('business');
    const client = new pg.Client();
    const callback = vi.fn();
    await new Promise(resolve => client.connect(error => {callback(error); resolve();}));
    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(client.query.mock.calls).toEqual([['SELECT current_database() AS name']]);
    expect(client.end).toHaveBeenCalledOnce();
  });
  it('supports promise and callback clients after validating the server', async () => {
    useEnv(safe);
    const {pg, original} = fakePg();
    installTestConnectionGuard(pg);
    await new pg.Client().connect();
    await new Promise((resolve, reject) => new pg.Client().connect(error => error ? reject(error) : resolve()));
    expect(original).toHaveBeenCalledTimes(2);
  });
});
