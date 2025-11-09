import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne } from '../db.js';

function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

function generateId(prefix = 'CASH') {
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
    metadata: typeof row.metadata === 'object' ? row.metadata : null,
  };
}

async function getActiveSession(branchId) {
  if (!branchId) return null;
  const row = await getOne(
    'SELECT * FROM branch_cash_sessions WHERE branch_id = $1 AND is_open = TRUE ORDER BY opened_at DESC LIMIT 1',
    [branchId]
  );
  return normalizeSessionRow(row);
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
    if (req.method === 'GET') {
      const id = searchParams.get('id');
      if (id) {
        const row = await getOne('SELECT * FROM branch_cash_sessions WHERE id = $1', [id]);
        if (!row) {
          return res.status(404).json({ success: false, error: 'Session not found' });
        }
        return res.status(200).json({ success: true, session: normalizeSessionRow(row) });
      }

      const branchId = searchParams.get('branch');
      const activeOnly = searchParams.get('active') === '1';
      if (activeOnly && branchId) {
        const session = await getActiveSession(branchId);
        return res.status(200).json({ success: true, session });
      }

      if (branchId) {
        const limit = parseInt(searchParams.get('limit') || '25', 10);
        const rows = await getMany(
          'SELECT * FROM branch_cash_sessions WHERE branch_id = $1 ORDER BY opened_at DESC LIMIT $2',
          [branchId, Number.isNaN(limit) ? 25 : limit]
        );
        return res.status(200).json({
          success: true,
          sessions: rows.map(normalizeSessionRow).filter(Boolean),
        });
      }

      // fallback to most recent sessions overall
      const rows = await getMany('SELECT * FROM branch_cash_sessions ORDER BY opened_at DESC LIMIT 50', []);
      return res.status(200).json({
        success: true,
        sessions: rows.map(normalizeSessionRow).filter(Boolean),
      });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const action = (body.action || '').toLowerCase();
      if (!action) {
        return res.status(400).json({ success: false, error: 'Action is required' });
      }

      if (action === 'open') {
        const branchId = body.branchId || body.branch;
        if (!branchId) {
          return res.status(400).json({ success: false, error: 'branchId is required' });
        }
        const existing = await getActiveSession(branchId);
        if (existing) {
          return res.status(409).json({ success: false, error: 'A cash session is already open for this branch' });
        }

        const sessionId = generateId('CASH');
        const openingBalance = parseNumber(body.openingBalance, 0);
        const metadata = {
          currentBalance: openingBalance,
          notes: body.notes || '',
        };

        const result = await query(
          `
            INSERT INTO branch_cash_sessions
              (id, branch_id, opening_balance, is_open, opened_by, opened_at, metadata)
            VALUES ($1, $2, $3, TRUE, $4, NOW(), $5)
            RETURNING *
          `,
          [
            sessionId,
            branchId,
            openingBalance,
            body.openedBy || currentUser?.fullName || currentUser?.username || 'system',
            JSON.stringify(metadata),
          ]
        );

        return res.status(201).json({
          success: true,
          session: normalizeSessionRow(result.rows[0]),
        });
      }

      if (action === 'close') {
        const sessionId = body.sessionId || body.id;
        if (!sessionId) {
          return res.status(400).json({ success: false, error: 'sessionId is required' });
        }
        const sessionRow = await getOne('SELECT * FROM branch_cash_sessions WHERE id = $1', [sessionId]);
        if (!sessionRow) {
          return res.status(404).json({ success: false, error: 'Session not found' });
        }
        if (!sessionRow.is_open) {
          return res.status(400).json({ success: false, error: 'Session is already closed' });
        }

        const countedCash = parseNumber(body.countedCash, null);
        if (countedCash === null) {
          return res.status(400).json({ success: false, error: 'countedCash is required to close the session' });
        }

        // Compute expected cash from movements
        const movements = await getMany(
          'SELECT type, amount FROM branch_cash_movements WHERE session_id = $1',
          [sessionId]
        );
        let expectedCash = parseNumber(sessionRow.opening_balance, 0);
        movements.forEach((movement) => {
          const amount = parseNumber(movement.amount, 0);
          const type = (movement.type || '').toLowerCase();
          if (type === 'drop' || type === 'expense') {
            expectedCash -= amount;
          } else if (type === 'adjustment') {
            expectedCash += amount;
          } else if (type === 'addition') {
            expectedCash += amount;
          }
        });
        const variance = countedCash - expectedCash;

        const metadata = sessionRow.metadata && typeof sessionRow.metadata === 'object'
          ? { ...sessionRow.metadata }
          : {};
        metadata.closingNotes = body.notes || '';

        const result = await query(
          `
            UPDATE branch_cash_sessions
            SET
              closing_balance = $1,
              variance = $2,
              is_open = FALSE,
              closed_by = $3,
              closed_at = NOW(),
              metadata = $4
            WHERE id = $5
            RETURNING *
          `,
          [
            countedCash,
            variance,
            body.closedBy || currentUser?.fullName || currentUser?.username || 'system',
            JSON.stringify(metadata),
            sessionId,
          ]
        );

        return res.status(200).json({
          success: true,
          session: normalizeSessionRow(result.rows[0]),
        });
      }

      return res.status(400).json({ success: false, error: `Unsupported action: ${action}` });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Cash sessions API error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}




