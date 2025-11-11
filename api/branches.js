import { applyAuthCors } from './_lib/auth.js';
import { ensureDistributorsTable } from './distributors.js';
import { query, getMany, getOne, insert, update, publishRealtimeEvent } from './db.js';

const BRANCH_ENTITY_TYPE = 'branch';

function normalizeBranchRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.distributor_code,
    name: row.distributor_name,
    location: row.location || row.branch || '',
    phone: row.mobile_no || '',
    email: row.email || '',
    status: row.status || 'active',
    entity_type: row.entity_type || BRANCH_ENTITY_TYPE,
    metadata: normalizeMetadata(row.metadata),
    agreement_data: normalizeMetadata(row.agreement_data),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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

function prepareMetadata(branch) {
  const metadata = {
    location: branch.location || branch.branch || branch.address || null,
    phone: branch.phone || branch.mobile || null,
    updatedBy: branch.updatedBy || branch.actor || null,
    ...(branch.metadata && typeof branch.metadata === 'object' ? branch.metadata : {}),
  };
  if (metadata.location === null && metadata.phone === null && Object.keys(metadata).length === 0) {
    return null;
  }
  return JSON.stringify(metadata);
}

function resolveId(branch) {
  if (branch.id) return branch.id;
  if (branch.code) return String(branch.code).trim().toLowerCase();
  if (branch.name) {
    return String(branch.name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `branch-${Date.now().toString(36)}`;
  }
  return `branch-${Date.now().toString(36)}`;
}

function resolveCode(branch, fallbackId) {
  const base = branch.code || branch.distributor_code || branch.distributorCode || fallbackId;
  if (!base) {
    return `BR-${Date.now().toString(36).toUpperCase()}`;
  }
  return String(base).trim().toUpperCase();
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

  try {
    await ensureDistributorsTable();

    if (method === 'GET') {
      if (id) {
        const branch = await getOne(
          'SELECT * FROM distributors WHERE id = $1 AND entity_type = $2',
          [id, BRANCH_ENTITY_TYPE]
        );
        if (!branch) {
          return res.status(404).json({ error: 'Branch not found' });
        }
        return res.json(normalizeBranchRow(branch));
      }

      if (code) {
        const branch = await getOne(
          'SELECT * FROM distributors WHERE distributor_code = $1 AND entity_type = $2',
          [code, BRANCH_ENTITY_TYPE]
        );
        if (!branch) {
          return res.status(404).json({ error: 'Branch not found' });
        }
        return res.json(normalizeBranchRow(branch));
      }

      const params = [BRANCH_ENTITY_TYPE];
      const whereParts = ['entity_type = $1'];

      if (search) {
        params.push(`%${search}%`);
        whereParts.push(
          `(distributor_name ILIKE $${params.length} OR distributor_code ILIKE $${params.length})`
        );
      }

      if (status) {
        params.push(status);
        whereParts.push(`status = $${params.length}`);
      }

      const queryText = `
        SELECT *
        FROM distributors
        WHERE ${whereParts.join(' AND ')}
        ORDER BY distributor_name
      `;
      const rows = await getMany(queryText, params);
      return res.json({ branches: rows.map(normalizeBranchRow) });
    }

    if (method === 'POST') {
      const body = await parseRequestBody(req);

      const insertBranch = async (payload = {}) => {
        const idValue = resolveId(payload);
        const record = {
          id: idValue,
          distributor_code: resolveCode(payload, idValue),
          distributor_name: payload.name || payload.distributor_name,
          mobile_no: payload.phone || payload.mobile || payload.mobile_no || null,
          email: payload.email || null,
          status: payload.status || 'active',
          branch: payload.location || payload.branch || payload.address || null,
          location: payload.location || payload.branch || payload.address || null,
          entity_type: BRANCH_ENTITY_TYPE,
          agreement_data: null,
          metadata: prepareMetadata(payload),
        };
        cleanupUndefined(record);
        const inserted = await insert('distributors', record);
        const normalized = normalizeBranchRow(inserted);
        await publishRealtimeEvent('branches', 'create', normalized);
        await publishRealtimeEvent('distributors', 'create', { ...normalized, entity_type: BRANCH_ENTITY_TYPE });
        return normalized;
      };

      if (Array.isArray(body)) {
        const insertedBranches = [];
        for (const payload of body) {
          try {
            insertedBranches.push(await insertBranch(payload));
          } catch (error) {
            if (error.code !== '23505') {
              console.error('Failed to insert branch', error);
            }
          }
        }
        return res.json({ success: true, count: insertedBranches.length, branches: insertedBranches });
      }

      const branch = await insertBranch(body);
      return res.json({ success: true, branch });
    }

    if (method === 'PUT' || method === 'PATCH') {
      const body = await parseRequestBody(req);
      if (!body?.id) {
        return res.status(400).json({ error: 'id is required for update' });
      }

      const updatePayload = {
        distributor_name: body.name || body.distributor_name,
        mobile_no: body.phone || body.mobile || body.mobile_no,
        email: body.email,
        status: body.status,
        branch: body.location || body.branch || body.address,
        location: body.location || body.branch || body.address,
        metadata: body.metadata ? JSON.stringify(body.metadata) : prepareMetadata(body),
        updated_at: new Date().toISOString(),
      };
      cleanupUndefined(updatePayload);

      const updated = await update('distributors', body.id, updatePayload, 'id');
      const normalized = normalizeBranchRow(updated);
      await publishRealtimeEvent('branches', 'update', normalized);
      await publishRealtimeEvent('distributors', 'update', { ...normalized, entity_type: BRANCH_ENTITY_TYPE });
      return res.json({ success: true, branch: normalized });
    }

    if (method === 'DELETE') {
      if (!id) {
        return res.status(400).json({ error: 'id query parameter is required' });
      }

      const result = await query(
        'DELETE FROM distributors WHERE id = $1 AND entity_type = $2 RETURNING *',
        [id, BRANCH_ENTITY_TYPE]
      );
      const removed = result.rows[0];
      if (!removed) {
        return res.status(404).json({ error: 'Branch not found' });
      }
      await publishRealtimeEvent('branches', 'delete', { id });
      await publishRealtimeEvent('distributors', 'delete', { id });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Branches API error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
      code: error.code || 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

