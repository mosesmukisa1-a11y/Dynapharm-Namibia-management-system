import { Pool } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import {identifier as sqlIdentifier, insertStatement, findAllStatement,updateStatement} from './services/sqlShape.js';
import {applicationTable,applicationRecord,applicationFields} from './services/sqlFieldPolicy.js';
import {isTestProcess, assertIsolatedTestDatabase, verifyIsolatedTestConnection} from './testDatabaseGuard.js';

const requestTransactions = new AsyncLocalStorage();
const connectionErrors = new WeakMap();
function watchConnection(client) {
  // pg-pool's idle listener is detached while a client is checked out.
  // A severed in-flight connection can emit a second error after its query
  // rejects; retain a client listener so that failure cannot kill the server.
  client.on('error', error => {
    connectionErrors.set(client,error);
    console.error('[db-client]',/^[A-Z0-9]{5}$/.test(error.code || '')?error.code:'CONNECTION_LOST');
  });
}

export function deferUntilCommit(callback, key) {
  const context = requestTransactions.getStore();
  if (!context?.active) return false;
  if(key!==undefined){
    context.afterCommitKeys ??= new Set();
    if(context.afterCommitKeys.has(key))return true;
    context.afterCommitKeys.add(key);
  }
  context.afterCommit.push(callback);
  return true;
}

export async function withRequestTransaction(fn) {
  if (requestTransactions.getStore()?.active) return fn();
  const client = await getPool().connect();
  const context = { client, active: true, afterCommit: [], pending: new Set() };
  let result,releaseError;
  try {
    await client.query('BEGIN');
    result = await requestTransactions.run(context, async () => {
      const value = await fn();
      while (context.pending.size) await Promise.all([...context.pending]);
      // COMMIT in an aborted PostgreSQL transaction returns ROLLBACK rather than
      // throwing. Verify the transaction is usable before declaring success.
      await client.query('SELECT 1');
      await client.query('COMMIT');
      return value;
    });
  } catch (error) {
    context.afterCommit = [];
    try { await client.query('ROLLBACK'); }
    catch (rollbackError) { releaseError=rollbackError; }
    throw error;
  } finally {
    context.active = false;
    client.release(releaseError || connectionErrors.get(client));
  }
  for (const callback of context.afterCommit) {
    try { await callback(); } catch (error) {
      console.error('[stock-after-commit]', error.message);
    }
  }
  return result;
}

let pool = null;
let poolConnectionString;
export async function closePool() {
  if(pool)await pool.end();
  pool=null;
}

function resolveSslConfig() {
  const envOverride = process.env.DATABASE_SSL;
  if (envOverride) {
    const flag = envOverride.toLowerCase();
    if (['0', 'false', 'disabled', 'off'].includes(flag)) {
      return false;
    }
    return { rejectUnauthorized: false };
  }

  if (!process.env.DATABASE_URL) {
    return false;
  }

  try {
    const normalizedUrl = process.env.DATABASE_URL.replace(/^postgres(ql)?:/, 'postgresql:');
    const url = new URL(normalizedUrl);
    const hostname = (url.hostname || '').toLowerCase();
    if (hostname && !['localhost', '127.0.0.1'].includes(hostname)) {
      return { rejectUnauthorized: false };
    }
  } catch (error) {
    console.warn('DATABASE_URL parse failed, defaulting SSL off:', error.message);
  }

  return false;
}

function getPool() {
  const testing = isTestProcess();
  if (testing) {
    assertIsolatedTestDatabase();
    if (pool && poolConnectionString !== process.env.DATABASE_URL) {
      throw new Error('Test database connection changed after pool creation. Use npm run test:db.');
    }
  }
  if (!pool) {
    const sslConfig = resolveSslConfig();
    const connectionTimeout = Number(process.env.DB_CONNECTION_TIMEOUT || 10000);
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
      max: Number(process.env.DB_POOL_MAX || 5),
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT || 30000),
      connectionTimeoutMillis: Number.isFinite(connectionTimeout) ? connectionTimeout : 10000,
      // pg awaits this hook before any caller receives the client or runs SQL.
      onConnect: async client => {
        watchConnection(client);
        if(testing)await verifyIsolatedTestConnection(client);
      },
    });
    poolConnectionString = process.env.DATABASE_URL;
    pool.on('error', (err) => {
      console.error('[db-idle]',/^[A-Z0-9]{5}$/.test(err.code || '')?err.code:'CONNECTION_LOST');
    });
  }
  return pool;
}

export async function query(text, params) {
  const context = requestTransactions.getStore();
  const executor = context?.active ? context.client : getPool();
  try {
    const pending = executor.query(text, params);
    if (context?.active) context.pending.add(pending);
    let res;
    try { res = await pending; } finally { context?.pending.delete(pending); }
    return res;
  } catch (error) {
    // PostgreSQL detail/message can contain parameter values (including credentials).
    console.error('Database query failed', {code:/^[A-Z0-9]{5}$/.test(error.code || '') ? error.code : 'QUERY_FAILED'});
    throw error;
  }
}

export async function getOne(queryText, params) {
  const result = await query(queryText, params);
  return result.rows[0] || null;
}

export async function getMany(queryText, params) {
  const result = await query(queryText, params);
  return result.rows;
}

function sanitizeIdentifier(name) { return sqlIdentifier(name); }

export async function insert(tableName, data) {
  data=applicationRecord(tableName,data);
  const statement=insertStatement(tableName,data);
  const result = await query(statement.text, statement.params);
  return result.rows[0];
}

export async function update(tableName, id, data, idColumn = 'id') {
  data=applicationRecord(tableName,data);
  if(idColumn!=='id')throw Error('Invalid SQL identifier');
  const statement=updateStatement(tableName,id,data,applicationFields[tableName],idColumn);
  const result = await query(statement.text,statement.params);
  return result.rows[0];
}

export async function remove(tableName, id, idColumn = 'id') {
  applicationTable(tableName);if(idColumn!=='id')throw Error('Invalid SQL identifier');
  const queryText = `DELETE FROM ${sanitizeIdentifier(tableName)} WHERE "${sanitizeIdentifier(idColumn)}" = $1 RETURNING *`;
  const result = await query(queryText, [id]);
  return result.rows[0];
}

export async function findById(tableName, id, idColumn = 'id') {
  applicationTable(tableName);if(idColumn!=='id')throw Error('Invalid SQL identifier');
  const queryText = `SELECT * FROM ${sanitizeIdentifier(tableName)} WHERE "${sanitizeIdentifier(idColumn)}" = $1`;
  return await getOne(queryText, [id]);
}

export async function findAll(tableName, conditions = {}, orderBy = 'created_at DESC') {
  const allowed=applicationFields[applicationTable(tableName)];
  conditions=applicationRecord(tableName,conditions);
  if(typeof orderBy!=='string')throw Error('Invalid SQL ordering');
  for(const term of orderBy.split(',')){
    const [column]=term.trim().split(/\s+/);
    if(!allowed.includes(column))throw Error('Invalid SQL ordering');
  }
  const statement=findAllStatement(tableName,conditions,orderBy);
  return await getMany(statement.text,statement.params);
}

// Publish realtime events
export async function publishRealtimeEvent(resource, action, data) {
  if (deferUntilCommit(() => publishRealtimeEvent(resource, action, data))) return;
  try {
    const REALTIME_GATEWAY_URL = process.env.REALTIME_GATEWAY_URL;
    if (!REALTIME_GATEWAY_URL) return;
    const response = await fetch(`${REALTIME_GATEWAY_URL}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: {
          type: `${resource}:${action}`,
          resource,
          action,
          data,
          timestamp: Date.now(),
        }
      }),
    });
    
    if (!response.ok) {
      console.warn(`Failed to publish realtime event: ${response.statusText}`);
    }
  } catch (error) {
    console.warn('Error publishing realtime event:', error.message);
  }
}

// A session lock acquired before BEGIN protects the first MVCC snapshot.
// Taking a transaction advisory lock via SELECT inside REPEATABLE READ is too
// late: that SELECT establishes a snapshot even while it waits for the lock.
export async function withTransaction(fn, { advisoryLockBeforeBegin } = {}) {
  const context = requestTransactions.getStore();
  if (context?.active) {
    if (advisoryLockBeforeBegin !== undefined)
      throw new Error('A pre-snapshot lock requires a new transaction');
    return fn(context.client);
  }
  const pool = getPool();
  const client = await pool.connect();
  let lockHeld = false, lockAttempted = false, transactionStarted = false, releaseError;
  try {
    if (advisoryLockBeforeBegin !== undefined) {
      lockAttempted = true;
      await client.query('SELECT pg_advisory_lock($1)', [advisoryLockBeforeBegin]);
      lockHeld = true;
    }
    await client.query('BEGIN');
    transactionStarted = true;
    const result = await fn(client);
    await client.query('COMMIT');
    transactionStarted = false;
    return result;
  } catch (error) {
    if (lockAttempted && !lockHeld) releaseError = error;
    try {
      if (transactionStarted) await client.query('ROLLBACK');
    } catch (rollbackError) {
      releaseError = rollbackError;
      console.error('Rollback error:', rollbackError.message);
    }
    throw error;
  } finally {
    if (lockHeld) {
      try {
        const result = await client.query('SELECT pg_advisory_unlock($1) AS unlocked', [advisoryLockBeforeBegin]);
        if (!result.rows[0]?.unlocked) releaseError = new Error('Pre-snapshot lock was not released');
      } catch (error) {
        // Destroy rather than pool a connection which may still own a lock.
        // Do not retry a callback whose COMMIT has already succeeded.
        releaseError = error;
      }
    }
    client.release(releaseError || connectionErrors.get(client));
  }
}
