// @vitest-environment node
import {afterEach, expect, it, vi} from 'vitest';

const poolConstructor = vi.hoisted(() => vi.fn());
vi.mock('pg', () => ({Pool: poolConstructor}));
import {query, withTransaction, withRequestTransaction} from '../api/db.js';

afterEach(() => vi.unstubAllEnvs());
it('blocks API reads, writes and transactions before creating a business pool', async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('STOCK_AUDIT_ISOLATED', '');
  await expect(query('INSERT INTO stock_batches(id) VALUES($1)', ['should-never-write'])).rejects.toThrow('Use npm run test:db');
  await expect(query('SELECT 1')).rejects.toThrow('Use npm run test:db');
  const work = vi.fn();
  await expect(withTransaction(work)).rejects.toThrow('Use npm run test:db');
  await expect(withRequestTransaction(work)).rejects.toThrow('Use npm run test:db');
  expect(work).not.toHaveBeenCalled();
  expect(poolConstructor).not.toHaveBeenCalled();
});

it('verifies the server before permitting application SQL, even without Vitest setup', async () => {
  const name = `stock_audit_${'b'.repeat(32)}`;
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('STOCK_AUDIT_ISOLATED', '1');
  vi.stubEnv('STOCK_AUDIT_DATABASE', name);
  vi.stubEnv('DATABASE_URL', `postgresql://tester@localhost/${name}`);
  vi.stubEnv('REPLIT_DEPLOYMENT', '');
  const client = {query: vi.fn().mockResolvedValue({rows: [{name: 'business'}]})};
  const applicationQuery = vi.fn();
  poolConstructor.mockImplementation(function(options) {
    return {
      on: vi.fn(),
      query: async (...args) => {
        await options.onConnect(client);
        return applicationQuery(...args);
      },
    };
  });
  await expect(query('DELETE FROM stock_batches')).rejects.toThrow('shared business databases');
  expect(client.query.mock.calls).toEqual([['SELECT current_database() AS name']]);
  expect(applicationQuery).not.toHaveBeenCalled();
  // Changing to another valid isolated identity cannot reuse the old pool.
  const other = `stock_audit_${'c'.repeat(32)}`;
  vi.stubEnv('STOCK_AUDIT_DATABASE', other);
  vi.stubEnv('DATABASE_URL', `postgresql://tester@localhost/${other}`);
  await expect(query('DELETE FROM stock_batches')).rejects.toThrow('connection changed');
  expect(applicationQuery).not.toHaveBeenCalled();
});
