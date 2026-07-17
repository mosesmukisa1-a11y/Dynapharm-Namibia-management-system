import { applyAuthCors } from '../_lib/auth.js';
import { query, getOne } from '../db.js';

const SAFE_FIELDS = ['phone', 'email', 'address', 'emergency_contact_name', 'emergency_contact_phone', 'date_of_birth', 'gender'];
const SENSITIVE_FIELDS = ['national_id', 'bank_name', 'bank_account_no'];

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = req.user?.sub || req.user?.username || req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

  if (req.method === 'GET') {
    try {
      const user = await getOne(
        `SELECT id, username, full_name, email, phone, role, branch,
                address, emergency_contact_name, emergency_contact_phone,
                national_id, date_of_birth, gender, bank_name, bank_account_no,
                created_at
         FROM users WHERE id = $1 OR LOWER(username) = LOWER($1)`,
        [userId]
      );
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      // Fetch any pending sensitive update requests for this user
      const pending = await query(
        `SELECT id, profile_changes, requested_at, status
         FROM hr_staff_change_requests
         WHERE request_type = 'profile_update'
           AND (user_id = $1 OR LOWER(full_name) = LOWER($2))
           AND status = 'pending'
         ORDER BY requested_at DESC`,
        [userId, user.full_name || userId]
      );

      return res.json({
        success: true,
        profile: user,
        pendingSensitive: pending.rows,
      });
    } catch (err) {
      console.error('[staff/profile GET]', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (req.method === 'PUT') {
    const body = req.body || {};
    const { action } = body;

    // ── Direct update: contact / personal fields ─────────────────────────────
    if (action === 'update_contact') {
      const updates = {};
      for (const field of SAFE_FIELDS) {
        if (body[field] !== undefined) updates[field] = body[field] || null;
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: 'No fields to update' });
      }
      try {
        const setClauses = Object.keys(updates).map((f, i) => `${f} = $${i + 2}`).join(', ');
        const vals = [userId, ...Object.values(updates)];
        const updated = await getOne(
          `UPDATE users SET ${setClauses}, updated_at = NOW()
           WHERE id = $1 OR LOWER(username) = LOWER($1)
           RETURNING id, username, full_name, email, phone, role, branch,
                     address, emergency_contact_name, emergency_contact_phone,
                     national_id, date_of_birth, gender, bank_name, bank_account_no`,
          vals
        );
        return res.json({ success: true, profile: updated });
      } catch (err) {
        console.error('[staff/profile PUT contact]', err);
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // ── Approval request: sensitive fields (national_id, bank details) ────────
    if (action === 'request_sensitive') {
      const changes = {};
      for (const field of SENSITIVE_FIELDS) {
        if (body[field] !== undefined && body[field] !== '') changes[field] = body[field];
      }
      if (Object.keys(changes).length === 0) {
        return res.status(400).json({ success: false, error: 'No sensitive fields provided' });
      }

      try {
        const user = await getOne(
          `SELECT full_name FROM users WHERE id = $1 OR LOWER(username) = LOWER($1)`,
          [userId]
        );
        const fullName = user?.full_name || userId;

        // Check for existing pending request
        const existing = await getOne(
          `SELECT id FROM hr_staff_change_requests
           WHERE request_type = 'profile_update' AND user_id = $1 AND status = 'pending'`,
          [userId]
        );
        if (existing) {
          return res.status(409).json({ success: false, error: 'You already have a pending sensitive update request. Please wait for HR to process it.' });
        }

        const changeLabels = Object.keys(changes).map(f => f.replace(/_/g, ' ')).join(', ');
        const result = await query(
          `INSERT INTO hr_staff_change_requests
             (request_type, full_name, user_id, profile_changes, reason, status, requested_by, requested_at)
           VALUES ('profile_update', $1, $2, $3, $4, 'pending', $1, NOW())
           RETURNING id`,
          [fullName, userId, JSON.stringify(changes), `Staff self-update request for: ${changeLabels}`]
        );
        return res.status(201).json({ success: true, requestId: result.rows[0]?.id });
      } catch (err) {
        console.error('[staff/profile PUT sensitive]', err);
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    return res.status(400).json({ success: false, error: 'Invalid action. Use "update_contact" or "request_sensitive".' });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
