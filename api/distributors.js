import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';

let distributorsTableChecked = false;

export async function ensureDistributorsTable() {
  if (distributorsTableChecked) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS distributors (
        id TEXT PRIMARY KEY,
        distributor_code TEXT UNIQUE,
        distributor_name TEXT NOT NULL,
        mobile_no TEXT,
        email TEXT,
        commission_rate NUMERIC DEFAULT 0,
        status TEXT DEFAULT 'active',
        branch TEXT,
        location TEXT,
        entity_type TEXT DEFAULT 'distributor',
        agreement_data JSONB,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE distributors ADD COLUMN IF NOT EXISTS location TEXT`);
    await query(`ALTER TABLE distributors ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'distributor'`);
    await query(`ALTER TABLE distributors ALTER COLUMN entity_type SET DEFAULT 'distributor'`);
    await query(`UPDATE distributors SET entity_type = 'distributor' WHERE entity_type IS NULL`);
    await query(`ALTER TABLE distributors ADD COLUMN IF NOT EXISTS metadata JSONB`);
    await query('CREATE INDEX IF NOT EXISTS idx_distributors_name ON distributors (distributor_name)');
    await query('CREATE INDEX IF NOT EXISTS idx_distributors_status ON distributors (status)');
    await query('CREATE INDEX IF NOT EXISTS idx_distributors_entity_type ON distributors (entity_type)');
    distributorsTableChecked = true;
  } catch (error) {
    distributorsTableChecked = false;
    console.error('Failed to ensure distributors table', error);
  }
}

function normalizeAgreementData(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return value;
    }
  }
  return value;
}

function normalizeMetadata(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return { note: value };
    }
  }
  return value;
}

function prepareAgreementDataForInsert(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed);
    } catch (_) {
      return value;
    }
  }
  return JSON.stringify(value);
}

function prepareMetadataForInsert(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed);
    } catch (_) {
      return JSON.stringify({ note: value });
    }
  }
  return JSON.stringify(value);
}

function normalizeDistributorRow(row) {
  if (!row) return null;
  return {
    ...row,
    agreement_data: normalizeAgreementData(row.agreement_data),
    metadata: normalizeMetadata(row.metadata),
  };
}

async function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function resolveCode(payload, fallbackId) {
  const source =
    payload?.distributor_code ||
    payload?.distributorCode ||
    payload?.code ||
    payload?.id ||
    fallbackId;
  if (!source) {
    return `DIST-${Date.now().toString(36).toUpperCase()}`;
  }
  return String(source).trim().toUpperCase();
}

function resolveEntityType(payload) {
  const raw = payload?.entity_type || payload?.entityType || payload?.type || 'distributor';
  return String(raw).trim().toLowerCase() || 'distributor';
}

function cleanupUndefined(record) {
  Object.keys(record).forEach((key) => {
    if (record[key] === undefined) {
      delete record[key];
    }
  });
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const method = req.method;
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { searchParams } = requestUrl;
  const id = searchParams.get('id');
  const code = searchParams.get('code');
  const search = searchParams.get('search');
  const status = searchParams.get('status');
  const limit = searchParams.get('limit');
  const entityTypeParam = searchParams.get('entityType') || searchParams.get('type');

  try {
    await ensureDistributorsTable();

    if (method === 'GET') {
      if (id) {
        const distributor = await getOne('SELECT * FROM distributors WHERE id = $1', [id]);
        if (!distributor) {
          return res.status(404).json({ error: 'Distributor not found' });
        }
        return res.json(normalizeDistributorRow(distributor));
      }

      if (code) {
        const distributor = await getOne('SELECT * FROM distributors WHERE distributor_code = $1', [code]);
        if (!distributor) {
          return res.status(404).json({ error: 'Distributor not found' });
        }
        return res.json(normalizeDistributorRow(distributor));
      }

      const params = [];
      const whereParts = [];

      if (search) {
        params.push(`%${search}%`);
        whereParts.push(`(distributor_name ILIKE $${params.length} OR distributor_code ILIKE $${params.length})`);
      }

      if (status) {
        params.push(status);
        whereParts.push(`status = $${params.length}`);
      }

      if (entityTypeParam) {
        params.push(entityTypeParam.toLowerCase());
        whereParts.push(`entity_type = $${params.length}`);
      }

      let queryText = 'SELECT * FROM distributors';
      if (whereParts.length > 0) {
        queryText += ` WHERE ${whereParts.join(' AND ')}`;
      }
      queryText += ' ORDER BY distributor_name';

      if (limit) {
        const parsedLimit = Number.parseInt(limit, 10);
        if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
          params.push(parsedLimit);
          queryText += ` LIMIT $${params.length}`;
        }
      }

      const distributors = await getMany(queryText, params);
      return res.json(distributors.map(normalizeDistributorRow));
    }

    if (method === 'POST') {
      const body = await parseRequestBody(req);

      const handleInsert = async (payload) => {
        const idValue = payload.id || `DIST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const record = {
          id: idValue,
          distributor_code: resolveCode(payload, idValue),
          distributor_name: payload.distributor_name || payload.name,
          mobile_no: payload.mobile_no || payload.mobile || null,
          email: payload.email || null,
          commission_rate: payload.commission_rate || 0,
          status: payload.status || 'active',
          branch: payload.branch || null,
          location: payload.location || payload.address || payload.city || payload.branch_location || null,
          entity_type: resolveEntityType(payload),
          agreement_data: prepareAgreementDataForInsert(payload.agreement_data || payload.agreementData),
          metadata: prepareMetadataForInsert(payload.metadata || payload.meta || payload.extra),
        };
        cleanupUndefined(record);
        const inserted = await insert('distributors', record);
        return normalizeDistributorRow(inserted);
      };

      if (Array.isArray(body)) {
        const results = [];
        for (const item of body) {
          try {
            results.push(await handleInsert(item || {}));
          } catch (error) {
            if (error.code !== '23505') {
              console.error('Error inserting distributor:', error);
            }
          }
        }
        if (results.length > 0) {
          await publishRealtimeEvent('distributors', 'create', results);
        }
        return res.json({ success: true, count: results.length, distributors: results });
      }

      const distributor = await handleInsert(body || {});
      await publishRealtimeEvent('distributors', 'create', distributor);
      return res.json(distributor);
    }

    if (method === 'PUT' || method === 'PATCH') {
      const body = await parseRequestBody(req);
      if (!body?.id) {
        return res.status(400).json({ error: 'id is required for update' });
      }

      const updatePayload = {
        distributor_code: body.distributor_code || body.code,
        distributor_name: body.distributor_name || body.name,
        mobile_no: body.mobile_no || body.mobile,
        email: body.email,
        commission_rate: body.commission_rate,
        status: body.status,
        branch: body.branch,
        location: body.location || body.address || body.city || body.branch_location,
        entity_type: body.entity_type || body.entityType || body.type,
        agreement_data: body.agreement_data || body.agreementData || body.agreement_data_json,
        metadata: body.metadata || body.meta || body.extra,
        updated_at: new Date().toISOString(),
      };

      if (updatePayload.distributor_code) {
        updatePayload.distributor_code = resolveCode(updatePayload, body.id);
      }
      if (updatePayload.entity_type) {
        updatePayload.entity_type = resolveEntityType(updatePayload);
      }
      if (updatePayload.agreement_data !== undefined) {
        updatePayload.agreement_data = prepareAgreementDataForInsert(updatePayload.agreement_data);
      }
      if (updatePayload.metadata !== undefined) {
        updatePayload.metadata = prepareMetadataForInsert(updatePayload.metadata);
      }
      cleanupUndefined(updatePayload);

      const distributor = await update('distributors', body.id, updatePayload, 'id');
      const normalized = normalizeDistributorRow(distributor);
      await publishRealtimeEvent('distributors', 'update', normalized);
      return res.json(normalized);
    }

    if (method === 'DELETE') {
      if (!id) {
        return res.status(400).json({ error: 'id query parameter is required' });
      }
      const removed = await remove('distributors', id, 'id');
      if (!removed) {
        return res.status(404).json({ error: 'Distributor not found' });
      }
      await publishRealtimeEvent('distributors', 'delete', { id });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Distributors API error:', error);
    const errorMessage = error.message || 'Internal server error';
    const errorCode = error.code || 'INTERNAL_ERROR';

    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Distributor code already exists',
        code: 'DUPLICATE_CODE',
        details: error.message,
      });
    }

    if (error.code === '23503') {
      return res.status(400).json({
        error: 'Invalid branch reference',
        code: 'FOREIGN_KEY_VIOLATION',
        details: error.message,
      });
    }

    return res.status(500).json({
      error: errorMessage,
      code: errorCode,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

