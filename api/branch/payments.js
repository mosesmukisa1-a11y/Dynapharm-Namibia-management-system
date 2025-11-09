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

function generateId(prefix = 'PAY') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normalizePayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    branchId: row.branch_id,
    date: row.date ? row.date.toISOString().slice(0, 10) : null,
    clientName: row.client_name || '',
    invoiceNumber: row.invoice_number || '',
    amount: row.amount !== null ? Number(row.amount) : 0,
    method: row.method || '',
    reference: row.reference || '',
    notes: row.notes || '',
    recordedBy: row.recorded_by || '',
    recordedAt: row.recorded_at instanceof Date ? row.recorded_at.toISOString() : row.recorded_at,
    metadata: row.metadata && typeof row.metadata === 'object'
      ? row.metadata
      : typeof row.metadata === 'string'
      ? JSON.parse(row.metadata)
      : null,
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
        const row = await getOne('SELECT * FROM branch_payments WHERE id = $1', [id]);
        if (!row) {
          return res.status(404).json({ success: false, error: 'Payment not found' });
        }
        return res.status(200).json({ success: true, payment: normalizePayment(row) });
      }

      const branchId = searchParams.get('branch');
      const limit = parseInt(searchParams.get('limit') || '100', 10);
      const queryLimit = Number.isNaN(limit) ? 100 : limit;

      let rows;
      if (branchId) {
        rows = await getMany(
          'SELECT * FROM branch_payments WHERE branch_id = $1 ORDER BY date DESC, recorded_at DESC LIMIT $2',
          [branchId, queryLimit]
        );
      } else {
        rows = await getMany(
          'SELECT * FROM branch_payments ORDER BY date DESC, recorded_at DESC LIMIT $1',
          [queryLimit]
        );
      }

      return res.status(200).json({
        success: true,
        payments: rows.map(normalizePayment).filter(Boolean),
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
      const method = body.method || body.paymentMethod || 'cash';

      const paymentId = generateId('PAY');
      const result = await query(
        `
          INSERT INTO branch_payments
            (id, branch_id, date, client_name, invoice_number, amount, method, reference, notes, recorded_by, recorded_at, metadata)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)
          RETURNING *
        `,
        [
          paymentId,
          branchId,
          date,
          body.clientName || body.client || '',
          body.invoiceNumber || body.invoice || '',
          amount,
          method,
          body.reference || '',
          body.notes || '',
          body.recordedBy || currentUser?.fullName || currentUser?.username || 'system',
          body.metadata ? JSON.stringify(body.metadata) : null,
        ]
      );

      return res.status(201).json({
        success: true,
        payment: normalizePayment(result.rows[0]),
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Branch payments API error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}




