import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { query, getMany, getOne, withTransaction } from '../db.js';

function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

function generateId(prefix = 'MOVE') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function parseJsonBody(req) {
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

function normalizeMovementRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    branchId: row.branch_id,
    type: row.type,
    description: row.description || '',
    amount: row.amount !== null ? Number(row.amount) : 0,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at instanceof Date ? row.recorded_at.toISOString() : row.recorded_at,
    reference: row.reference || '',
    notes: row.notes || '',
    metadata: typeof row.metadata === 'object' ? row.metadata : null,
    status: row.metadata?.status || 'posted'
  };
}

function normalizeSessionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    branchId: row.branch_id,
    openingBalance: row.opening_balance !== null ? Number(row.opening_balance) : 0,
    closingBalance: row.closing_balance !== null ? Number(row.closing_balance) : null,
    variance: row.variance !== null ? Number(row.variance) : null,
    isOpen: row.is_open,
    openedBy: row.opened_by,
    openedAt: row.opened_at instanceof Date ? row.opened_at.toISOString() : row.opened_at,
    closedBy: row.closed_by,
    closedAt: row.closed_at instanceof Date ? row.closed_at.toISOString() : row.closed_at,
    metadata: typeof row.metadata === 'object' ?
    row.metadata :
    typeof row.metadata === 'string' ?
    JSON.parse(row.metadata) :
    null
  };
}

async function getActiveSession(client, branchId) {
  const row = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/cash-movements.js:79:0"),

  [branchId]);

  return row.rows[0] || null;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const searchParams = url.searchParams;
  const currentUser = req.user || null;

  try {
    if (req.method === 'PUT' || req.method === 'PATCH') {
      if (!currentUser) return res.status(401).json({ error: 'Authentication required' });
      if (!['gm', 'admin', 'director'].includes(currentUser.role)) return res.status(403).json({ error: 'GM approval access required' });
      const body = await parseJsonBody(req);
      const id = body.id || searchParams.get('id') || url.pathname.split('/').filter(Boolean).at(-1);
      if (!id || id === 'cash-movements') return res.status(400).json({ error: 'id is required' });
      if (!['approved', 'rejected'].includes(body.status)) return res.status(400).json({ error: 'Status must be approved or rejected' });
      const movement = await withTransaction(async (db) => {
        const { rows } = await __qd_executePlan(db.query.bind(db), __qd_registeredPlan("api/branch/cash-movements.js:105:1"), [id]);
        const row = rows[0];
        if (!row) throw Object.assign(new Error('Cash movement not found'), { statusCode: 404 });
        const metadata = row.metadata || {};
        if (metadata.status === body.status) return row;
        if (metadata.status !== 'pending') throw Object.assign(new Error('Cash movement is not pending review'), { statusCode: 409 });
        const result = await __qd_executePlan(db.query.bind(db), __qd_registeredPlan("api/branch/cash-movements.js:111:2"),
        [id, JSON.stringify({ ...metadata, status: body.status, reviewedBy: currentUser.sub || currentUser.id || currentUser.username,
          reviewedByName: currentUser.fullName || currentUser.full_name || currentUser.username, reviewedAt: new Date().toISOString() }), body.notes || null]);
        return result.rows[0];
      });
      // Reviewing an already recorded movement must not post cash a second time.
      return res.json({ success: true, movement: normalizeMovementRow(movement) });
    }
    if (req.method === 'GET') {
      const sessionId = searchParams.get('sessionId') || searchParams.get('session');
      const branchScope = getBranchScope(currentUser);
      const requestedBranch = searchParams.get('branch');
      const effectiveBranchId = branchScope.enforced ? branchScope.primaryBranch || branchScope.branches?.[0] || null : requestedBranch;
      const limit = parseInt(searchParams.get('limit') || '100', 10);

      let rows;
      if (sessionId) {
        rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/cash-movements.js:129:3"),

        [sessionId, Number.isNaN(limit) ? 100 : limit]);

      } else if (effectiveBranchId) {
        rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/cash-movements.js:134:4"),

        [effectiveBranchId, Number.isNaN(limit) ? 100 : limit]);

      } else {
        rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/cash-movements.js:138:5"), [
        Number.isNaN(limit) ? 100 : limit]);

      }

      return res.status(200).json({
        success: true,
        movements: rows.map(normalizeMovementRow).filter(Boolean)
      });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const branchId = body.branchId || body.branch;
      if (!branchId) {
        return res.status(400).json({ success: false, error: 'branchId is required' });
      }

      const type = (body.type || '').toLowerCase();
      if (!['drop', 'expense', 'adjustment', 'addition'].includes(type)) {
        return res.status(400).json({ success: false, error: 'Invalid movement type' });
      }

      const amount = parseNumber(body.amount, null);
      if (amount === null || amount <= 0) {
        return res.status(400).json({ success: false, error: 'amount must be greater than zero' });
      }

      const movementId = generateId('MOVE');
      const description = body.description || '';
      const notes = body.notes || '';
      const reference = body.reference || '';

      const result = await withTransaction(async (client) => {
        // Determine session
        let sessionId = body.sessionId || body.session;
        let sessionRow = null;
        if (sessionId) {
          const sessionRes = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/cash-movements.js:176:6"), [sessionId]);
          sessionRow = sessionRes.rows[0];
        } else {
          sessionRow = await getActiveSession(client, branchId);
          sessionId = sessionRow?.id || null;
        }

        if (!sessionRow) {
          throw new Error('No active cash session found for this branch. Open the drawer first.');
        }
        if (!sessionRow.is_open) {
          throw new Error('Cannot record movement on a closed session.');
        }

        // Insert movement
        const movementResult = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/cash-movements.js:192:7"),







        [
        movementId,
        sessionId,
        branchId,
        type,
        description,
        amount,
        body.recordedBy || currentUser?.fullName || currentUser?.username || 'system',
        reference,
        notes,
        body.metadata ? JSON.stringify(body.metadata) : null]);



        // Update session metadata currentBalance when available
        const metadata =
        sessionRow.metadata && typeof sessionRow.metadata === 'object' ?
        { ...sessionRow.metadata } :
        { currentBalance: parseNumber(sessionRow.opening_balance, 0) };

        const currentBalance = parseNumber(metadata.currentBalance, parseNumber(sessionRow.opening_balance, 0));
        let updatedBalance = currentBalance;
        if (type === 'drop' || type === 'expense') {
          updatedBalance = currentBalance - amount;
        } else if (type === 'addition') {
          updatedBalance = currentBalance + amount;
        } else if (type === 'adjustment') {
          updatedBalance = currentBalance + parseNumber(body.adjustmentDelta ?? amount, amount);
        }
        metadata.currentBalance = updatedBalance;

        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/cash-movements.js:230:8"), [
        JSON.stringify(metadata),
        sessionId]);


        const updatedSession = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/cash-movements.js:235:9"), [sessionId]);

        return {
          movement: movementResult.rows[0],
          session: updatedSession.rows[0]
        };
      });

      return res.status(201).json({
        success: true,
        movement: normalizeMovementRow(result.movement),
        session: normalizeSessionRow(result.session)
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Cash movements API error:', error);
    return res.status(error.statusCode || 500).json({ success: false, error: error.statusCode ? error.message : 'Internal server error' });
  }
}
