import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { query, withTransaction } from '../db.js';

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

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeLine(row) {
  if (!row) return null;
  const data = typeof row.data === 'object' && row.data !== null ? row.data : {};
  const validation = typeof row.validation === 'object' && row.validation !== null ? row.validation : {};
  return {
    id: row.id,
    line_uid: row.line_uid || data.tempId || `LINE-${row.id}`,
    distributor_name: row.distributor_name || data.distributorName || '',
    distributor_code: row.distributor_code || data.distributorNb || '',
    sku: row.sku || data.sku || '',
    product_name: row.product_name || data.productName || '',
    quantity: safeNumber(row.quantity ?? data.quantity ?? 0),
    unit_price: safeNumber(row.unit_price ?? data.unitPrice ?? 0),
    branch_id: row.branch_id || data.branch || '',
    sale_timestamp: row.sale_timestamp || data.timestamp || new Date().toISOString(),
    status: row.status || data.status || 'draft',
    validation,
    data
  };
}

function normalizeDraft(row, lines) {
  if (!row) return null;
  const payload = typeof row.payload === 'object' && row.payload !== null ? row.payload : {};
  return {
    id: row.id,
    branch_id: row.branch_id,
    status: row.status || 'draft',
    total_amount: safeNumber(row.total_amount ?? payload.totalAmount ?? 0),
    total_quantity: safeNumber(row.total_quantity ?? payload.totalQuantity ?? 0),
    line_count: row.line_count ?? payload.lineCount ?? lines?.length ?? 0,
    updated_at: row.updated_at,
    lines: Array.isArray(lines) ? lines.map(normalizeLine).filter(Boolean) : [],
    payload
  };
}

async function loadDraft(id, client) {
  const runQuery = client ? (text, params) => __qd_executePlan(client.query.bind(client), text, params) : (text, params) => __qd_executePlan(query, text, params);
  const draftResult = await __qd_executePlan(runQuery, __qd_registeredPlan("api/mis/drafts.js:72:0"), [id]);
  const draft = client ? draftResult.rows[0] : draftResult.rows?.[0] || draftResult;
  if (!draft) return null;
  const linesResult = await __qd_executePlan(runQuery, __qd_registeredPlan("api/mis/drafts.js:76:1"),






  [id]);

  const lines = client ? linesResult.rows : linesResult;
  return normalizeDraft(draft, lines);
}

async function persistDraft(client, draft, user) {
  const draftId = draft.id || `DRAFT-${Date.now()}`;
  const branchId = draft.branch || draft.branch_id || 'main';
  const lines = Array.isArray(draft.lines) ? draft.lines : [];

  const totals = lines.reduce(
    (acc, line) => {
      const qty = safeNumber(line.quantity, 0);
      const price = safeNumber(line.unitPrice || line.unit_price, 0);
      acc.quantity += qty;
      acc.amount += qty * price;
      return acc;
    },
    { quantity: 0, amount: 0 }
  );

  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/mis/drafts.js:105:2"),














  [
  draftId,
  branchId,
  draft.status || 'draft',
  lines.length,
  totals.amount,
  totals.quantity,
  JSON.stringify(draft),
  draft.metadata ? JSON.stringify(draft.metadata) : null,
  user?.fullName || user?.username || null,
  user?.username || null,
  user?.fullName || user?.username || null]);



  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/mis/drafts.js:134:3"), [draftId]);

  for (const line of lines) {
    const validation = line.validation || {};
    const distributorMatch = validation.distributor ?? null;
    const productMatch = validation.product ?? null;
    const notes = Array.isArray(validation.notes) ? validation.notes : [];

    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/mis/drafts.js:143:4"),





















    [
    draftId,
    line.tempId || line.line_uid || `LINE-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    line.distributorName || line.distributor_name || '',
    line.distributorNb || line.distributor_code || '',
    line.sku || '',
    line.productName || line.product_name || '',
    safeNumber(line.quantity, 0),
    safeNumber(line.unitPrice || line.unit_price, 0),
    line.branch || line.branch_id || branchId,
    line.timestamp || line.sale_timestamp || new Date().toISOString(),
    line.status || 'draft',
    JSON.stringify({
      distributor: distributorMatch,
      product: productMatch,
      notes
    }),
    JSON.stringify(line)]);


  }

  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/mis/drafts.js:187:5"),




  [
  'draft_saved',
  draftId,
  user?.fullName || user?.username || null,
  JSON.stringify({
    branch: branchId,
    lineCount: lines.length,
    totalAmount: totals.amount,
    totalQuantity: totals.quantity
  })]);



  return loadDraft(draftId, client);
}

async function verifyLines(client, draftId, lineIds, user) {
  if (!Array.isArray(lineIds) || lineIds.length === 0) return loadDraft(draftId);

  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/mis/drafts.js:211:6"),








  [
  draftId,
  user?.fullName || user?.username || null,
  lineIds,
  lineIds.filter((value) => /^\d+$/.test(String(value))).map((value) => Number(value))]);



  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/mis/drafts.js:228:7"),













  [draftId, user?.fullName || user?.username || null]);


  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/mis/drafts.js:245:8"),




  [
  'lines_verified',
  draftId,
  user?.fullName || user?.username || null,
  JSON.stringify({
    lineIds
  })]);



  return loadDraft(draftId, client);
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });

  try {
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const saved = await withTransaction(async (client) => {
        return persistDraft(client, body.draft || body, req.user);
      });
      return res.status(200).json({ success: true, draft: saved });
    }

    if (req.method === 'PATCH') {
      const body = await parseBody(req);
      if (body.action === 'publish') {
        const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const draftId = body.id || searchParams.get('id');
        if (!draftId) {
          return res.status(400).json({ success: false, error: 'id is required' });
        }
        const { rowCount } = await __qd_executePlan(query, __qd_registeredPlan("api/mis/drafts.js:288:9"),

        [draftId]);

        if (rowCount === 0) {
          return res.status(404).json({ success: false, error: 'Draft not found' });
        }
        return res.status(200).json({ success: true });
      }
      if (body.action !== 'verify') {
        return res.status(400).json({ success: false, error: 'Unsupported action' });
      }
      if (!body.draftId) {
        return res.status(400).json({ success: false, error: 'draftId is required' });
      }
      const saved = await withTransaction(async (client) => {
        return verifyLines(client, body.draftId, Array.isArray(body.lineIds) ? body.lineIds : [], req.user);
      });
      return res.status(200).json({ success: true, draft: saved });
    }

    if (req.method === 'GET') {
      const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const id = searchParams.get('id');
      if (id) {
        const draft = await loadDraft(id);
        if (!draft) {
          return res.status(404).json({ success: false, error: 'Draft not found' });
        }
        return res.status(200).json({ success: true, draft });
      }
      const { rows } = await __qd_executePlan(query, __qd_registeredPlan("api/mis/drafts.js:319:10"), []);





      return res.status(200).json({ success: true, drafts: rows });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('MIS drafts API error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error'
    });
  }
}
