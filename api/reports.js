import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';

async function parseRequestBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body || '{}');
      } catch (error) {
        throw new Error('Invalid JSON payload');
      }
    }
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

function normalizeReportRow(row) {
  if (!row) return null;
  const payload =
    typeof row.data === 'string'
      ? (() => {
          try {
            return JSON.parse(row.data);
          } catch {
            return {};
          }
        })()
      : row.data || {};

  return {
    id: row.id || payload.id || `RPT-${Date.now()}`,
    clientId: row.client_id || payload.clientId || null,
    consultant: row.consultant || payload.consultant || null,
    branch: row.branch || payload.branch || payload.consultantInfo?.branch || null,
    reportType: row.report_type || payload.reportType || payload.type || null,
    createdAt: row.created_at || payload.createdAt || payload.timestamp || null,
    updatedAt: row.updated_at || payload.updatedAt || payload.lastModified || null,
    ...payload
  };
}

function buildReportInsert(body) {
  const id = body.id || `RPT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    id,
    client_id: body.clientId || body.client_id || body.client?.id || null,
    consultant: body.consultant || body.consultantInfo?.fullName || null,
    branch: body.branch || body.consultantInfo?.branch || body.clientInfo?.branch || null,
    report_type: body.reportType || body.type || null,
    data
  };
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const id = searchParams.get('id');
  const clientId = searchParams.get('clientId');
  const branch = searchParams.get('branch');
  const consultant = searchParams.get('consultant');

  try {
    if (req.method === 'GET') {
      let queryText = 'SELECT * FROM reports';
      const params = [];
      const conditions = [];

      if (id) {
        conditions.push(`id = $${params.length + 1}`);
        params.push(id);
      }
      if (clientId) {
        conditions.push(`client_id = $${params.length + 1}`);
        params.push(clientId);
      }
      if (branch) {
        conditions.push(`branch = $${params.length + 1}`);
        params.push(branch);
      }
      if (consultant) {
        conditions.push(`consultant = $${params.length + 1}`);
        params.push(consultant);
      }

      if (conditions.length > 0) {
        queryText += ` WHERE ${conditions.join(' AND ')}`;
      }

      queryText += ' ORDER BY created_at DESC';

      const rows = await getMany(queryText, params);
      return res.status(200).json(rows.map(normalizeReportRow).filter(Boolean));
    }

    if (req.method === 'POST') {
      const body = await parseRequestBody(req);
      const insertData = buildReportInsert(body);
      const result = await insert('reports', insertData);
      const report = normalizeReportRow(result);
      await publishRealtimeEvent('reports', 'create', report);
      return res.status(201).json({ success: true, report });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseRequestBody(req);
      if (!body?.id) {
        return res.status(400).json({ success: false, error: 'Report id is required' });
      }

      const existing = await getOne('SELECT * FROM reports WHERE id = $1', [body.id]);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Report not found' });
      }

      const updatePayload = {
        ...buildReportInsert({ ...normalizeReportRow(existing), ...body }),
        updated_at: new Date().toISOString()
      };

      const updated = await update('reports', body.id, updatePayload, 'id');
      const report = normalizeReportRow(updated);
      await publishRealtimeEvent('reports', 'update', report);
      return res.status(200).json({ success: true, report });
    }

    if (req.method === 'DELETE') {
      if (!id) {
        return res.status(400).json({ success: false, error: 'Report id is required' });
      }
      await remove('reports', id, 'id');
      await publishRealtimeEvent('reports', 'delete', { id });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Reports API error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}

