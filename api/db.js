import { Pool } from 'pg';

let pool = null;

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
  if (!pool) {
    const sslConfig = resolveSslConfig();
    const connectionTimeout = Number(process.env.DB_CONNECTION_TIMEOUT || 10000);
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
      max: Number(process.env.DB_POOL_MAX || 5),
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT || 30000),
      connectionTimeoutMillis: Number.isFinite(connectionTimeout) ? connectionTimeout : 10000,
    });
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }
  return pool;
}

export async function query(text, params) {
  const pool = getPool();
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    console.error('Database query error', { text, error: error.message });
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

export async function insert(tableName, data) {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const columnNames = columns.map(c => `"${c}"`).join(', ');
  const queryText = `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders}) RETURNING *`;
  const result = await query(queryText, values);
  return result.rows[0];
}

export async function update(tableName, id, data, idColumn = 'id') {
  const columns = Object.keys(data).filter(key => key !== idColumn);
  const values = columns.map(col => data[col]);
  const setClause = columns.map((col, i) => `"${col}" = $${i + 1}`).join(', ');
  const queryText = `UPDATE ${tableName} SET ${setClause} WHERE "${idColumn}" = $${columns.length + 1} RETURNING *`;
  const result = await query(queryText, [...values, id]);
  return result.rows[0];
}

export async function remove(tableName, id, idColumn = 'id') {
  const queryText = `DELETE FROM ${tableName} WHERE "${idColumn}" = $1 RETURNING *`;
  const result = await query(queryText, [id]);
  return result.rows[0];
}

export async function findById(tableName, id, idColumn = 'id') {
  const queryText = `SELECT * FROM ${tableName} WHERE "${idColumn}" = $1`;
  return await getOne(queryText, [id]);
}

export async function findAll(tableName, conditions = {}, orderBy = 'created_at DESC') {
  let queryText = `SELECT * FROM ${tableName}`;
  const params = [];
  const conditionsList = [];
  
  Object.keys(conditions).forEach((key, index) => {
    conditionsList.push(`"${key}" = $${index + 1}`);
    params.push(conditions[key]);
  });
  
  if (conditionsList.length > 0) {
    queryText += ` WHERE ${conditionsList.join(' AND ')}`;
  }
  
  queryText += ` ORDER BY ${orderBy}`;
  
  return await getMany(queryText, params);
}

// Publish realtime events
export async function publishRealtimeEvent(resource, action, data) {
  try {
    const REALTIME_GATEWAY_URL = process.env.REALTIME_GATEWAY_URL || 'https://web-production-40cac.up.railway.app';
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

export async function withTransaction(fn) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback error:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}
