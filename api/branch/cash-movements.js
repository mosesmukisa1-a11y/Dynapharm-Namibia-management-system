import { applyAuthCors } from '../_lib/auth.js';
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
    metadata: typeof row.metadata === 'object'
      ? row.metadata
      : typeof row.metadata === 'string'
      ? JSON.parse(row.metadata)
      : null,
  };
}

async function getActiveSession(client, branchId) {
  const row = await client.query(
    'SELECT * FROM branch_cash_sessions WHERE branch_id = $1 AND is_open = TRUE ORDER BY opened_at DESC LIMIT 1',
    [branchId]
  );
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
    if (req.method === 'GET') {
      const sessionId = searchParams.get('sessionId') || searchParams.get('session');
      const branchId = searchParams.get('branch');
      const limit = parseInt(searchParams.get('limit') || '100', 10);

      let rows;
      if (sessionId) {
        rows = await getMany(
          'SELECT * FROM branch_cash_movements WHERE session_id = $1 ORDER BY recorded_at DESC LIMIT $2',
          [sessionId, Number.isNaN(limit) ? 100 : limit]
        );
      } else if (branchId) {
        rows = await getMany(
          'SELECT * FROM branch_cash_movements WHERE branch_id = $1 ORDER BY recorded_at DESC LIMIT $2',
          [branchId, Number.isNaN(limit) ? 100 : limit]
        );
      } else {
        rows = await getMany('SELECT * FROM branch_cash_movements ORDER BY recorded_at DESC LIMIT $1', [
          Number.isNaN(limit) ? 100 : limit,
        ]);
      }

      return res.status(200).json({
        success: true,
        movements: rows.map(normalizeMovementRow).filter(Boolean),
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
          const sessionRes = await client.query('SELECT * FROM branch_cash_sessions WHERE id = $1', [sessionId]);
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
        const movementResult = await client.query(
          `
            INSERT INTO branch_cash_movements
              (id, session_id, branch_id, type, description, amount, recorded_by, recorded_at, reference, notes, metadata)
            VALUES
              ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10)
            RETURNING *
          `,
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
            body.metadata ? JSON.stringify(body.metadata) : null,
          ]
        );

        // Update session metadata currentBalance when available
        const metadata =
          sessionRow.metadata && typeof sessionRow.metadata === 'object'
            ? { ...sessionRow.metadata }
            : { currentBalance: parseNumber(sessionRow.opening_balance, 0) };

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

        await client.query('UPDATE branch_cash_sessions SET metadata = $1 WHERE id = $2', [
          JSON.stringify(metadata),
          sessionId,
        ]);

        const updatedSession = await client.query('SELECT * FROM branch_cash_sessions WHERE id = $1', [sessionId]);

        return {
          movement: movementResult.rows[0],
          session: updatedSession.rows[0],
        };
      });

      return res.status(201).json({
        success: true,
        movement: normalizeMovementRow(result.movement),
        session: normalizeSessionRow(result.session),
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Cash movements API error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}

