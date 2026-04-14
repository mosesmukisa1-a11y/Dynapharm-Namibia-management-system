import { applyAuthCors } from '../_lib/auth.js';
import { query } from '../db.js';

function workingDays(startDate, endDate) {
  let count = 0;
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const sp = new URL(req.url, `http://localhost`).searchParams;
      const status = sp.get('status');
      const employee_name = sp.get('employee_name');

      let sql = `
        SELECT l.*,
               e.position        AS emp_position,
               e.branch          AS emp_branch,
               e.department      AS emp_department,
               e.employee_id     AS emp_number,
               e.leave_entitlements
        FROM hr_leave_requests l
        LEFT JOIN employees e
          ON LOWER(TRIM(e.full_name)) = LOWER(TRIM(l.employee_name))
        WHERE 1=1`;
      const params = [];
      if (status) { params.push(status); sql += ` AND l.status = $${params.length}`; }
      if (employee_name) { params.push(`%${employee_name}%`); sql += ` AND l.employee_name ILIKE $${params.length}`; }
      sql += ` ORDER BY l.created_at DESC LIMIT 500`;

      const result = await query(sql, params);
      const leaves = result.rows;

      const pendingLeaves = leaves.filter(l => l.status === 'pending');
      await Promise.all(
        pendingLeaves.map(async leaf => {
          if (!leaf.emp_position || !leaf.emp_branch) return;

          const covResult = await query(
            `SELECT e.full_name, e.employee_id, e.position, e.branch
             FROM employees e
             WHERE LOWER(TRIM(e.position)) = LOWER(TRIM($1))
               AND LOWER(TRIM(e.branch))   = LOWER(TRIM($2))
               AND LOWER(TRIM(e.full_name)) != LOWER(TRIM($3))
               AND NOT EXISTS (
                 SELECT 1 FROM hr_leave_requests lr
                 WHERE LOWER(TRIM(lr.employee_name)) = LOWER(TRIM(e.full_name))
                   AND lr.status = 'approved'
                   AND lr.start_date <= $5::date
                   AND lr.end_date   >= $4::date
               )
             LIMIT 5`,
            [leaf.emp_position, leaf.emp_branch, leaf.employee_name, leaf.start_date, leaf.end_date]
          );
          leaf.coverage_staff = covResult.rows;
          leaf.working_days = workingDays(leaf.start_date, leaf.end_date);
        })
      );

      for (const leaf of leaves.filter(l => l.status !== 'pending')) {
        leaf.working_days = workingDays(leaf.start_date, leaf.end_date);
      }

      return res.json({ success: true, leaves });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { employee_name, employee_id, leave_type, start_date, end_date, reason, urgent } = body;

      if (!employee_name || !start_date || !end_date) {
        return res.status(400).json({ success: false, error: 'Employee name, start date, and end date are required' });
      }

      const result = await query(
        `INSERT INTO hr_leave_requests
           (employee_name, employee_id, leave_type, start_date, end_date, reason, urgent, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, NOW(), NOW())
         RETURNING *`,
        [
          employee_name,
          employee_id || null,
          leave_type || 'Annual',
          start_date,
          end_date,
          reason || null,
          urgent === true || urgent === 'true' ? true : false,
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

      const { status, approved_by, notes, rejection_reason } = body;
      const result = await query(
        `UPDATE hr_leave_requests
         SET status           = COALESCE($1, status),
             approved_by      = COALESCE($2, approved_by),
             notes            = CASE WHEN $3::TEXT IS NOT NULL THEN $3 ELSE notes END,
             rejection_reason = CASE WHEN $5::TEXT IS NOT NULL THEN $5 ELSE rejection_reason END,
             approved_at      = CASE WHEN $1 IN ('approved','rejected') THEN NOW() ELSE approved_at END,
             updated_at       = NOW()
         WHERE id = $4
         RETURNING *`,
        [status || null, approved_by || null, notes || null, id, rejection_reason || null]
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
