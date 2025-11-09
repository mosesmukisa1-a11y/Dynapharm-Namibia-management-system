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

function generateId(prefix = 'DEP') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normalizeDeposit(row) {
  if (!row) return null;
  const slipFile =
    row.slip_file && typeof row.slip_file === 'object'
      ? row.slip_file
      : typeof row.slip_file === 'string'
      ? JSON.parse(row.slip_file)
      : null;
  return {
    id: row.id,
    branchId: row.branch_id,
    date: row.date ? row.date.toISOString().slice(0, 10) : null,
    amount: row.amount !== null ? Number(row.amount) : 0,
    slipNumber: row.slip_number || '',
    bankName: row.bank_name || '',
    bankBranch: row.bank_branch || '',
    accountNumber: row.account_number || '',
    accountType: row.account_type || '',
    depositedBy: row.deposited_by || '',
    notes: row.notes || '',
    slipFile,
    status: row.status || 'pending',
    decisionNotes: row.decision_notes || '',
    reviewedBy: row.reviewed_by || '',
    reviewedAt: row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : row.reviewed_at,
    createdBy: row.created_by || '',
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
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
        const row = await getOne('SELECT * FROM branch_bank_deposits WHERE id = $1', [id]);
        if (!row) {
          return res.status(404).json({ success: false, error: 'Deposit not found' });
        }
        return res.status(200).json({ success: true, deposit: normalizeDeposit(row) });
      }

      const branchId = searchParams.get('branch');
      const status = searchParams.get('status');
      const limit = parseInt(searchParams.get('limit') || '50', 10);

      let rows;
      if (branchId) {
        if (status) {
          rows = await getMany(
            'SELECT * FROM branch_bank_deposits WHERE branch_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT $3',
            [branchId, status, Number.isNaN(limit) ? 50 : limit]
          );
        } else {
          rows = await getMany(
            'SELECT * FROM branch_bank_deposits WHERE branch_id = $1 ORDER BY created_at DESC LIMIT $2',
            [branchId, Number.isNaN(limit) ? 50 : limit]
          );
        }
      } else {
        if (status) {
          rows = await getMany(
            'SELECT * FROM branch_bank_deposits WHERE status = $1 ORDER BY created_at DESC LIMIT $2',
            [status, Number.isNaN(limit) ? 50 : limit]
          );
        } else {
          rows = await getMany('SELECT * FROM branch_bank_deposits ORDER BY created_at DESC LIMIT $1', [
            Number.isNaN(limit) ? 50 : limit,
          ]);
        }
      }

      return res.status(200).json({
        success: true,
        deposits: rows.map(normalizeDeposit).filter(Boolean),
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

      const depositId = generateId('DEP');
      const result = await query(
        `
          INSERT INTO branch_bank_deposits
            (id, branch_id, date, amount, slip_number, bank_name, bank_branch, account_number, account_type,
             deposited_by, notes, slip_file, status, created_by, created_at)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', $13, NOW())
          RETURNING *
        `,
        [
          depositId,
          branchId,
          date,
          amount,
          body.slipNumber || body.slipNo || '',
          body.bankName || '',
          body.bankBranch || '',
          body.accountNumber || '',
          body.accountType || '',
          body.depositedBy || (currentUser?.fullName || currentUser?.username || 'system'),
          body.notes || '',
          body.slipFile ? JSON.stringify(body.slipFile) : null,
          currentUser?.username || currentUser?.fullName || 'system',
        ]
      );

      return res.status(201).json({
        success: true,
        deposit: normalizeDeposit(result.rows[0]),
      });
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = await parseJsonBody(req);
      const id = body.id || body.depositId;
      if (!id) {
        return res.status(400).json({ success: false, error: 'id is required' });
      }

      const row = await getOne('SELECT * FROM branch_bank_deposits WHERE id = $1', [id]);
      if (!row) {
        return res.status(404).json({ success: false, error: 'Deposit not found' });
      }

      const status = body.status ? body.status.toLowerCase() : null;
      const allowedStatuses = ['pending', 'approved', 'rejected'];
      if (status && !allowedStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status value' });
      }

      const updatedRow = await query(
        `
          UPDATE branch_bank_deposits
          SET
            status = COALESCE($1, status),
            decision_notes = COALESCE($2, decision_notes),
            reviewed_by = CASE WHEN $1 IS NULL OR $1 = 'pending' THEN reviewed_by ELSE $3 END,
            reviewed_at = CASE WHEN $1 IS NULL OR $1 = 'pending' THEN reviewed_at ELSE NOW() END
          WHERE id = $4
          RETURNING *
        `,
        [
          status,
          body.decisionNotes || body.notes || null,
          body.reviewedBy || currentUser?.fullName || currentUser?.username || 'system',
          id,
        ]
      );

      return res.status(200).json({
        success: true,
        deposit: normalizeDeposit(updatedRow.rows[0]),
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Branch deposits API error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}




