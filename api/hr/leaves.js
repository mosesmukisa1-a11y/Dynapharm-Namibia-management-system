import { applyAuthCors } from '../_lib/auth.js';
import { query } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { status, employee_name } = Object.fromEntries(
        new URL(req.url, `http://localhost`).searchParams
      );
      let sql = `SELECT * FROM hr_leave_requests WHERE 1=1`;
      const params = [];
      if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
      if (employee_name) { params.push(employee_name); sql += ` AND employee_name ILIKE $${params.length}`; }
      sql += ` ORDER BY created_at DESC LIMIT 500`;

      const result = await query(sql, params);
      return res.json({ success: true, leaves: result.rows });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { employee_name, employee_id, leave_type, start_date, end_date, reason } = body;

      if (!employee_name || !start_date || !end_date) {
        return res.status(400).json({ success: false, error: 'Employee name, start date, and end date are required' });
      }

      const result = await query(
        `INSERT INTO hr_leave_requests
           (employee_name, employee_id, leave_type, start_date, end_date, reason, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NOW(), NOW())
         RETURNING *`,
        [
          employee_name,
          employee_id || null,
          leave_type || 'Annual',
          start_date,
          end_date,
          reason || null,
          req.user?.full_name || req.user?.username || null,
        ]
      );

      return res.status(201).json({ success: true, leave: result.rows[0] });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const url = new URL(req.url, `http://localhost`);
      const id = url.searchParams.get('id') || (req.body || {}).id;
      const body = req.body || {};

      if (!id) return res.status(400).json({ success: false, error: 'id is required' });

      const { status, approved_by, notes } = body;
      const result = await query(
        `UPDATE hr_leave_requests
         SET status = COALESCE($1, status),
             approved_by = COALESCE($2, approved_by),
             reason = CASE WHEN $3::TEXT IS NOT NULL THEN $3 ELSE reason END,
             approved_at = CASE WHEN $1 IN ('approved','rejected') THEN NOW() ELSE approved_at END,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [status || null, approved_by || null, notes || null, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Leave request not found' });
      }

      return res.json({ success: true, leave: result.rows[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[hr/leaves]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
