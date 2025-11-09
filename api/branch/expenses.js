import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne } from '../db.js';

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

function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

function generateId(prefix = 'EXP') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normalizeExpense(row) {
  if (!row) return null;
  const metadata =
    row.metadata && typeof row.metadata === 'object'
      ? row.metadata
      : typeof row.metadata === 'string'
      ? JSON.parse(row.metadata)
      : null;
  return {
    id: row.id,
    branchId: row.branch_id,
    sessionId: row.session_id,
    date: row.date ? row.date.toISOString().slice(0, 10) : null,
    amount: row.amount !== null ? Number(row.amount) : 0,
    description: row.description || '',
    category: row.category || '',
    paymentMethod: row.payment_method || '',
    status: row.status || 'recorded',
    notes: row.notes || '',
    createdBy: row.created_by || '',
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    reviewedBy: row.reviewed_by || '',
    reviewedAt: row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : row.reviewed_at,
    metadata,
  };
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
        const row = await getOne('SELECT * FROM branch_expenses WHERE id = $1', [id]);
        if (!row) {
          return res.status(404).json({ success: false, error: 'Expense not found' });
        }
        return res.status(200).json({ success: true, expense: normalizeExpense(row) });
      }

      const branchId = searchParams.get('branch');
      const status = searchParams.get('status');
      const limit = parseInt(searchParams.get('limit') || '100', 10);

      let rows;
      const queryLimit = Number.isNaN(limit) ? 100 : limit;

      if (branchId) {
        if (status) {
          rows = await getMany(
            'SELECT * FROM branch_expenses WHERE branch_id = $1 AND status = $2 ORDER BY date DESC, created_at DESC LIMIT $3',
            [branchId, status, queryLimit]
          );
        } else {
          rows = await getMany(
            'SELECT * FROM branch_expenses WHERE branch_id = $1 ORDER BY date DESC, created_at DESC LIMIT $2',
            [branchId, queryLimit]
          );
        }
      } else {
        if (status) {
          rows = await getMany(
            'SELECT * FROM branch_expenses WHERE status = $1 ORDER BY date DESC, created_at DESC LIMIT $2',
            [status, queryLimit]
          );
        } else {
          rows = await getMany(
            'SELECT * FROM branch_expenses ORDER BY date DESC, created_at DESC LIMIT $1',
            [queryLimit]
          );
        }
      }

      return res.status(200).json({
        success: true,
        expenses: rows.map(normalizeExpense).filter(Boolean),
      });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const branchId = body.branchId || body.branch;
      if (!branchId) {
        return res.status(400).json({ success: false, error: 'branchId is required' });
      }

      const date = body.date || new Date().toISOString().slice(0, 10);
      const amount = parseNumber(body.amount, null);
      if (amount === null || amount <= 0) {
        return res.status(400).json({ success: false, error: 'amount must be greater than zero' });
      }

      const expenseId = generateId('EXP');
      const result = await query(
        `
          INSERT INTO branch_expenses
            (id, branch_id, session_id, date, amount, description, category, payment_method,
             status, notes, created_by, created_at, metadata)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12)
          RETURNING *
        `,
        [
          expenseId,
          branchId,
          body.sessionId || body.session || null,
          date,
          amount,
          body.description || '',
          body.category || '',
          body.paymentMethod || body.method || 'cash',
          body.status || 'recorded',
          body.notes || '',
          body.createdBy || currentUser?.fullName || currentUser?.username || 'system',
          body.metadata ? JSON.stringify(body.metadata) : null,
        ]
      );

      return res.status(201).json({
        success: true,
        expense: normalizeExpense(result.rows[0]),
      });
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = await parseJsonBody(req);
      const id = body.id || body.expenseId;
      if (!id) {
        return res.status(400).json({ success: false, error: 'id is required' });
      }

      const row = await getOne('SELECT * FROM branch_expenses WHERE id = $1', [id]);
      if (!row) {
        return res.status(404).json({ success: false, error: 'Expense not found' });
      }

      const status = body.status ? body.status.toLowerCase() : null;
      const allowedStatuses = ['recorded', 'approved', 'rejected'];
      if (status && !allowedStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status value' });
      }

      const updatedRow = await query(
        `
          UPDATE branch_expenses
          SET
            status = COALESCE($1, status),
            reviewed_by = CASE WHEN $1 IS NULL OR $1 = 'recorded' THEN reviewed_by ELSE $2 END,
            reviewed_at = CASE WHEN $1 IS NULL OR $1 = 'recorded' THEN reviewed_at ELSE NOW() END,
            notes = COALESCE($3, notes)
          WHERE id = $4
          RETURNING *
        `,
        [
          status,
          body.reviewedBy || currentUser?.fullName || currentUser?.username || 'system',
          body.notes || null,
          id,
        ]
      );

      return res.status(200).json({
        success: true,
        expense: normalizeExpense(updatedRow.rows[0]),
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Branch expenses API error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}




