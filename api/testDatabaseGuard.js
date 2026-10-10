const isolatedName = /^stock_audit_[a-f0-9]{32}$/;
const refusal = 'Test database access refused. Use npm run test:db; shared business databases are forbidden.';

export function isTestProcess(env = process.env) {
  return env.NODE_ENV === 'test' || !!env.VITEST || !!env.VITEST_WORKER_ID;
}

// This check never connects and never includes credentials in an error.
export function assertIsolatedTestDatabase(env = process.env) {
  if (env.REPLIT_DEPLOYMENT === '1' || env.STOCK_AUDIT_ISOLATED !== '1' ||
      !isolatedName.test(env.STOCK_AUDIT_DATABASE || '')) throw new Error(refusal);
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error(refusal); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
      url.pathname !== `/${env.STOCK_AUDIT_DATABASE}` || url.search || url.hash) {
    throw new Error(refusal);
  }
  return env.STOCK_AUDIT_DATABASE;
}

export async function verifyIsolatedTestConnection(client) {
  const expected = assertIsolatedTestDatabase();
  const result = await client.query('SELECT current_database() AS name');
  if (result.rows[0]?.name !== expected) throw new Error(refusal);
}

// Cover specs which construct pg pools/clients directly, including future specs.
// Verification completes before pg hands a connected client to caller code.
export function installTestConnectionGuard(pg) {
  const prototype = pg.Client.prototype;
  const key = Symbol.for('dynapharm.testDatabaseGuard');
  if (prototype[key]) return;
  prototype[key] = true;
  const originalConnect = prototype.connect;
  prototype.connect = function(callback) {
    const connect = async () => {
      assertIsolatedTestDatabase();
      const expected = new pg.Client({connectionString: process.env.DATABASE_URL}).connectionParameters;
      const actual = this.connectionParameters;
      if (['database', 'host', 'port', 'user'].some(key => actual[key] !== expected[key])) {
        throw new Error(refusal);
      }
      await new Promise((resolve, reject) => originalConnect.call(this, error => error ? reject(error) : resolve()));
      try { await verifyIsolatedTestConnection(this); }
      catch (error) { await this.end(); throw error; }
    };
    const pending = connect();
    if (typeof callback === 'function') {
      pending.then(() => callback(null), error => callback(error));
      return;
    }
    return pending;
  };
}
