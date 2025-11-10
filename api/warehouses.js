import { applyAuthCors } from './_lib/auth.js';
import { getMany, getOne, insert, update, remove, query } from './db.js';

function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
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

function safeParseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function normalizeWarehouse(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    type: row.type,
    branchId: row.branch_id,
    status: row.status,
    timezone: row.timezone,
    contact: safeParseJson(row.contact),
    metadata: safeParseJson(row.metadata),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

async function ensureDefaultWarehouse() {
  const rows = await getMany('SELECT id FROM warehouse_locations LIMIT 1', []);
  if (rows.length === 0) {
    await query(
      `
        INSERT INTO warehouse_locations (id, name, code, type, status)
        VALUES
          ('warehouse-windhoek', 'Windhoek Warehouse', 'WH-WINDHOEK', 'warehouse', 'active'),
          ('warehouse-ondangwa', 'Ondangwa Warehouse', 'WH-ONDANGWA', 'warehouse', 'active')
        ON CONFLICT (id) DO NOTHING;
      `,
      []
    );
  }
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const searchParams = url.searchParams;

  try {
    if (req.method === 'GET') {
      await ensureDefaultWarehouse();

      const id = searchParams.get('id');
      const code = searchParams.get('code');
      const status = searchParams.get('status');
      const type = searchParams.get('type');

      if (id) {
        const row = await getOne('SELECT * FROM warehouse_locations WHERE id = $1', [id]);
        if (!row) {
          return res.status(404).json({ success: false, error: 'Warehouse not found' });
        }
        return res.status(200).json({ success: true, warehouse: normalizeWarehouse(row) });
      }

      const conditions = [];
      const params = [];

      if (code) {
        conditions.push('code = $' + (params.length + 1));
        params.push(code);
      }
      if (status) {
        conditions.push('status = $' + (params.length + 1));
        params.push(status);
      }
      if (type) {
        conditions.push('type = $' + (params.length + 1));
        params.push(type);
      }

      let queryText = 'SELECT * FROM warehouse_locations';
      if (conditions.length > 0) {
        queryText += ' WHERE ' + conditions.join(' AND ');
      }
      queryText += ' ORDER BY created_at ASC';

      const rows = await getMany(queryText, params);
      return res.status(200).json({
        success: true,
        warehouses: rows.map(normalizeWarehouse).filter(Boolean),
      });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.name) {
        return res.status(400).json({ success: false, error: 'name is required' });
      }
      const payload = {
        id: body.id || `warehouse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: body.name,
        code: body.code || null,
        type: body.type || 'warehouse',
        branch_id: body.branchId || body.branch_id || null,
        status: body.status || 'active',
        timezone: body.timezone || null,
        contact: body.contact ? JSON.stringify(body.contact) : null,
        metadata: body.metadata ? JSON.stringify(body.metadata) : null,
      };
      const row = await insert('warehouse_locations', payload);
      return res.status(201).json({ success: true, warehouse: normalizeWarehouse(row) });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseBody(req);
      const id = body.id || searchParams.get('id');
      if (!id) {
        return res.status(400).json({ success: false, error: 'id is required' });
      }

      const updatePayload = { ...body };
      delete updatePayload.id;
      delete updatePayload.branchId;
      delete updatePayload.contact;
      delete updatePayload.metadata;

      if (body.branchId !== undefined) {
        updatePayload.branch_id = body.branchId;
      }
      if (body.contact !== undefined) {
        updatePayload.contact = body.contact ? JSON.stringify(body.contact) : null;
      }
      if (body.metadata !== undefined) {
        updatePayload.metadata = body.metadata ? JSON.stringify(body.metadata) : null;
      }

      const row = await update('warehouse_locations', id, updatePayload, 'id');
      return res.status(200).json({ success: true, warehouse: normalizeWarehouse(row) });
    }

    if (req.method === 'DELETE') {
      const id = searchParams.get('id');
      if (!id) {
        return res.status(400).json({ success: false, error: 'id query parameter is required' });
      }
      await remove('warehouse_locations', id, 'id');
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Warehouses API error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}


