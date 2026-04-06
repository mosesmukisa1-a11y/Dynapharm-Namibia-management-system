import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne } from '../db.js';

function nowIso() { return new Date().toISOString(); }
function shortId() { return `PC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`; }

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const parts = pathname.replace(/^\/api\/finance\/petty-cash\/?/, '').split('/').filter(Boolean);
  const sub = parts[0];
  const id = parts[1];

  try {
    // GET /api/finance/petty-cash/balance
    if (req.method === 'GET' && sub === 'balance') {
      const rows = await getMany(`SELECT * FROM petty_cash_accounts ORDER BY location`);
      return res.json({ success: true, accounts: rows });
    }

    // GET /api/finance/petty-cash/requests
    if (req.method === 'GET' && (!sub || sub === 'requests')) {
      const rows = await getMany(
        `SELECT * FROM petty_cash_requests ORDER BY created_at DESC LIMIT 200`
      );
      return res.json({ success: true, requests: rows });
    }

    // POST /api/finance/petty-cash/requests — Finance creates request
    if (req.method === 'POST' && (!sub || sub === 'requests')) {
      const body = req.body || {};
      if (!body.amount || !body.purpose) {
        return res.status(400).json({ error: 'amount and purpose are required' });
      }
      const rec = await query(
        `INSERT INTO petty_cash_requests
           (id, request_number, amount, purpose, location, requested_by, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending_gm', $7, $7)
         RETURNING *`,
        [
          shortId(),
          `PCR-${Date.now()}`,
          Number(body.amount),
          body.purpose,
          body.location || 'head_office',
          req.user?.fullName || req.user?.username || 'Finance',
          nowIso(),
        ]
      );
      return res.status(201).json({ success: true, request: rec.rows[0] });
    }

    // PUT /api/finance/petty-cash/requests/:id/approve — GM approves
    if (req.method === 'PUT' && sub === 'requests' && id && parts[2] === 'approve') {
      const body = req.body || {};
      const rec = await query(
        `UPDATE petty_cash_requests
         SET status = 'pending_director', gm_approved_by = $1, gm_approved_at = $2, notes = COALESCE($3, notes), updated_at = $2
         WHERE id = $4 AND status = 'pending_gm'
         RETURNING *`,
        [req.user?.fullName || req.user?.username || 'GM', nowIso(), body.notes || null, id]
      );
      if (!rec.rows.length) return res.status(404).json({ error: 'Request not found or already processed' });
      return res.json({ success: true, request: rec.rows[0] });
    }

    // PUT /api/finance/petty-cash/requests/:id/reject — GM or Director rejects
    if (req.method === 'PUT' && sub === 'requests' && id && parts[2] === 'reject') {
      const body = req.body || {};
      const rec = await query(
        `UPDATE petty_cash_requests
         SET status = 'rejected', rejected_by = $1, rejected_at = $2, notes = COALESCE($3, notes), updated_at = $2
         WHERE id = $4 AND status IN ('pending_gm', 'pending_director')
         RETURNING *`,
        [req.user?.fullName || req.user?.username, nowIso(), body.notes || null, id]
      );
      if (!rec.rows.length) return res.status(404).json({ error: 'Request not found or already processed' });
      return res.json({ success: true, request: rec.rows[0] });
    }

    // PUT /api/finance/petty-cash/requests/:id/issue — Director issues cash
    if (req.method === 'PUT' && sub === 'requests' && id && parts[2] === 'issue') {
      const body = req.body || {};
      const existing = await getOne(`SELECT * FROM petty_cash_requests WHERE id = $1 AND status = 'pending_director'`, [id]);
      if (!existing) return res.status(404).json({ error: 'Request not found or not yet GM-approved' });

      const issuedAt = nowIso();
      const issuedBy = req.user?.fullName || req.user?.username || 'Director';

      await query(
        `UPDATE petty_cash_requests
         SET status = 'issued', issued_by = $1, issued_at = $2, notes = COALESCE($3, notes), updated_at = $2
         WHERE id = $4`,
        [issuedBy, issuedAt, body.notes || null, id]
      );

      // Credit the petty cash account
      const location = existing.location || 'head_office';
      await query(
        `INSERT INTO petty_cash_accounts (id, location, balance, last_topped_up_at, last_topped_up_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (location) DO UPDATE
           SET balance = petty_cash_accounts.balance + EXCLUDED.balance,
               last_topped_up_at = EXCLUDED.last_topped_up_at,
               last_topped_up_by = EXCLUDED.last_topped_up_by,
               updated_at = NOW()`,
        [`PCA-${location}`, location, Number(existing.amount), issuedAt, issuedBy]
      );

      // Log the top-up in petty_cash_transactions
      await query(
        `INSERT INTO petty_cash_transactions
           (id, location, type, amount, description, reference_id, performed_by, created_at)
         VALUES ($1, $2, 'top_up', $3, $4, $5, $6, $7)`,
        [
          `PCT-${Date.now()}`,
          location,
          Number(existing.amount),
          `Petty cash issued: ${existing.purpose}`,
          id,
          issuedBy,
          issuedAt,
        ]
      );

      const updated = await getOne(`SELECT * FROM petty_cash_requests WHERE id = $1`, [id]);
      const account = await getOne(`SELECT * FROM petty_cash_accounts WHERE location = $1`, [location]);
      return res.json({ success: true, request: updated, account });
    }

    // POST /api/finance/petty-cash/spend — record a petty cash expense
    if (req.method === 'POST' && sub === 'spend') {
      const body = req.body || {};
      if (!body.amount || !body.description) {
        return res.status(400).json({ error: 'amount and description are required' });
      }
      const location = body.location || 'head_office';
      const amount = Number(body.amount);

      // Check balance
      const acct = await getOne(`SELECT * FROM petty_cash_accounts WHERE location = $1`, [location]);
      if (!acct || Number(acct.balance) < amount) {
        return res.status(400).json({ error: `Insufficient petty cash balance. Available: N$${acct ? acct.balance : 0}` });
      }

      // Deduct from petty cash account
      await query(
        `UPDATE petty_cash_accounts SET balance = balance - $1, updated_at = NOW() WHERE location = $2`,
        [amount, location]
      );

      // Log the transaction
      await query(
        `INSERT INTO petty_cash_transactions
           (id, location, type, amount, description, category, branch_id, reference_id, performed_by, created_at)
         VALUES ($1, $2, 'expense', $3, $4, $5, $6, $7, $8, $9)`,
        [
          `PCT-${Date.now()}`,
          location,
          amount,
          body.description,
          body.category || 'General',
          body.branch_id || location,
          body.reference_id || null,
          req.user?.fullName || req.user?.username || 'Finance',
          nowIso(),
        ]
      );

      // Also record in branch_expenses for overhead tracking
      await query(
        `INSERT INTO branch_expenses
           (id, branch_id, date, amount, description, category, payment_method, status, created_by, created_at)
         VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, 'petty_cash', 'approved', $6, NOW())`,
        [
          `EXP-${Date.now()}`,
          body.branch_id || location,
          amount,
          body.description,
          body.category || 'General',
          req.user?.fullName || req.user?.username || 'Finance',
        ]
      );

      const updatedAcct = await getOne(`SELECT * FROM petty_cash_accounts WHERE location = $1`, [location]);
      return res.status(201).json({ success: true, account: updatedAcct });
    }

    // GET /api/finance/petty-cash/transactions
    if (req.method === 'GET' && sub === 'transactions') {
      const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const location = searchParams.get('location');
      let sql = `SELECT * FROM petty_cash_transactions`;
      const params = [];
      if (location) { sql += ` WHERE location = $1`; params.push(location); }
      sql += ` ORDER BY created_at DESC LIMIT 500`;
      const rows = await getMany(sql, params);
      return res.json({ success: true, transactions: rows });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('[petty-cash]', err);
    return res.status(500).json({ error: err.message });
  }
}
