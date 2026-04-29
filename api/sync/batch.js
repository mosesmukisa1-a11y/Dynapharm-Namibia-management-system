import { applyAuthCors } from '../_lib/auth.js';
import { query, getOne } from '../db.js';

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const body = await parseJsonBody(req);
  const ops = Array.isArray(body.operations) ? body.operations : [];

  if (ops.length === 0) {
    return res.status(200).json({ success: true, results: [] });
  }

  if (ops.length > 200) {
    return res.status(400).json({ success: false, error: 'Too many operations in batch (max 200)' });
  }

  const results = [];

  for (const op of ops) {
    try {
      const { type, url, method, body: opBody, offlineId } = op;

      if (!offlineId) {
        results.push({ offlineId: null, success: false, error: 'Missing offlineId' });
        continue;
      }

      if (type === 'walkin_sale' || url?.includes('/branch/walkin-sales')) {
        const dup = await getOne('SELECT id FROM branch_walkin_sales WHERE offline_id = $1', [offlineId]);
        if (dup) {
          results.push({ offlineId, success: true, duplicate: true, recordId: dup.id });
          continue;
        }
        const { default: wHandler } = await import('../branch/walkin-sales.js');
        const mockReq = buildMockReq(req, method || 'POST', url || '/api/branch/walkin-sales', { ...opBody, offline_id: offlineId });
        const mockRes = buildMockRes();
        await wHandler(mockReq, mockRes);
        const respData = mockRes.getData();
        results.push({ offlineId, success: respData?.success ?? true, duplicate: !!respData?.duplicate, recordId: respData?.sale?.id || null, data: respData });

      } else if (type === 'expense' || url?.includes('/branch/expenses')) {
        const dup = await getOne('SELECT id FROM branch_expenses WHERE offline_id = $1', [offlineId]);
        if (dup) {
          results.push({ offlineId, success: true, duplicate: true, recordId: dup.id });
          continue;
        }
        const { default: eHandler } = await import('../branch/expenses.js');
        const mockReq = buildMockReq(req, method || 'POST', url || '/api/branch/expenses', { ...opBody, offline_id: offlineId });
        const mockRes = buildMockRes();
        await eHandler(mockReq, mockRes);
        const respData = mockRes.getData();
        results.push({ offlineId, success: respData?.success ?? true, duplicate: !!respData?.duplicate, recordId: respData?.expense?.id || null, data: respData });

      } else {
        results.push({ offlineId, success: false, error: `Unknown operation type: ${type}` });
      }
    } catch (err) {
      console.error('[sync/batch] Operation error:', err.message);
      results.push({ offlineId: op.offlineId || null, success: false, error: err.message });
    }
  }

  return res.status(200).json({ success: true, results });
}

function buildMockReq(originalReq, method, url, body) {
  return {
    method,
    url,
    headers: { ...originalReq.headers, host: originalReq.headers.host || 'localhost' },
    user: originalReq.user,
    body,
    on: () => {},
  };
}

function buildMockRes() {
  let statusCode = 200;
  let data = null;
  const headers = {};
  return {
    status(code) { statusCode = code; return this; },
    json(d) { data = d; return this; },
    end() { return this; },
    setHeader(k, v) { headers[k] = v; return this; },
    getHeader(k) { return headers[k]; },
    headersSent: false,
    getData() { return data; },
    getStatus() { return statusCode; },
  };
}
