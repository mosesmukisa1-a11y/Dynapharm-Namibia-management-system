import { applyAuthCors } from '../_lib/auth.js';
import { query, getOne } from '../db.js';

const GM_ROLES = new Set(['gm', 'admin', 'director']);
const HR_ROLES = new Set(['hr_manager', 'hr', 'admin', 'gm', 'director']);

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const role = req.user?.role || '';
  const actor = req.user?.fullName || req.user?.full_name || req.user?.username || role;

  try {
    if (req.method === 'GET') {
      if (!HR_ROLES.has(role)) return res.status(403).json({ error: 'Access denied' });
      const sp = new URL(req.url, 'http://localhost').searchParams;
      const status = sp.get('status');
      let sql = 'SELECT * FROM hr_staff_change_requests';
      const params = [];
      if (status) { params.push(status); sql += ` WHERE status = $${params.length}`; }
      sql += ' ORDER BY requested_at DESC';
      const result = await query(sql, params);
      return res.json({ success: true, requests: result.rows });
    }

    if (req.method === 'POST') {
      if (!HR_ROLES.has(role)) return res.status(403).json({ error: 'Access denied' });
      const body = req.body || {};
      const { request_type, full_name, employee_row_id, position, department, branch, hire_date, phone, email, reason } = body;
      if (!request_type || !full_name) {
        return res.status(400).json({ error: 'request_type and full_name are required' });
      }
      if (!['add', 'remove'].includes(request_type)) {
        return res.status(400).json({ error: 'request_type must be add or remove' });
      }
      const result = await query(
        `INSERT INTO hr_staff_change_requests
          (request_type, full_name, employee_row_id, position, department, branch, hire_date, phone, email, reason, status, requested_by, requested_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,NOW())
         RETURNING *`,
        [request_type, full_name, employee_row_id || null, position || null, department || null, branch || null,
         hire_date || null, phone || null, email || null, reason || null, actor]
      );
      return res.status(201).json({ success: true, request: result.rows[0] });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      if (!GM_ROLES.has(role)) return res.status(403).json({ error: 'Only GM, Admin, or Director can approve/reject staff changes' });
      const sp = new URL(req.url, 'http://localhost').searchParams;
      const id = sp.get('id') || (req.body || {}).id;
      if (!id) return res.status(400).json({ error: 'id is required' });
      const body = req.body || {};
      const { status, gm_note } = body;
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'status must be approved or rejected' });
      }

      const existing = await getOne('SELECT * FROM hr_staff_change_requests WHERE id = $1', [id]);
      if (!existing) return res.status(404).json({ error: 'Request not found' });
      if (existing.status !== 'pending') return res.status(409).json({ error: 'Request already processed' });

      await query(
        `UPDATE hr_staff_change_requests SET status=$1, reviewed_by=$2, reviewed_at=NOW(), gm_note=$3 WHERE id=$4`,
        [status, actor, gm_note || null, id]
      );

      if (status === 'approved') {
        if (existing.request_type === 'add') {
          await query(
            `INSERT INTO employees (full_name, position, department, branch, hire_date, phone, email, employment_status, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'active',NOW(),NOW())`,
            [existing.full_name, existing.position || '', existing.department || '',
             existing.branch || '', existing.hire_date || null, existing.phone || null, existing.email || null]
          );
        } else if (existing.request_type === 'remove' && existing.employee_row_id) {
          await query(
            `UPDATE employees SET employment_status='inactive', updated_at=NOW() WHERE id=$1`,
            [existing.employee_row_id]
          );
        }
      }

      const updated = await getOne('SELECT * FROM hr_staff_change_requests WHERE id = $1', [id]);
      return res.json({ success: true, request: updated });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[hr/staff-change-requests]', err);
    return res.status(500).json({ error: err.message });
  }
}
