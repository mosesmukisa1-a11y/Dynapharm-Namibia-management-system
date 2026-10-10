import pg from 'pg';
import {assertIsolatedTestDatabase, verifyIsolatedTestConnection} from '../../api/testDatabaseGuard.js';

export function createIsolatedTestPool() {
  assertIsolatedTestDatabase();
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === '0' ? false : {rejectUnauthorized: false},
    onConnect: verifyIsolatedTestConnection,
  });
}
