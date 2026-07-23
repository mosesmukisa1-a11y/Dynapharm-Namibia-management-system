import { applyAuthCors } from '../_lib/auth.js';
import { getOne, query } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const role = req.user?.role || '';
  const allowed = ['admin', 'hr', 'gm', 'director', 'superadmin'];
  if (!allowed.includes(role)) return res.status(403).json({ error: 'Not authorised' });

  if (req.method === 'GET') {
    const { employee_name, user_id } = req.query;
    if (!employee_name && !user_id)
      return res.status(400).json({ error: 'employee_name or user_id required' });
    try {
      // Match user by id, username, or full_name (full_name is the canonical link between employees and users)
      const user = await getOne(
        `SELECT
           id, username, full_name, email, phone, role, branch,
           address, emergency_contact_name, emergency_contact_phone,
           date_of_birth, gender, marital_status, nationality, home_language,
           next_of_kin_name, next_of_kin_relationship, next_of_kin_phone,
           highest_qualification, institution_name, graduation_year, field_of_study,
           professional_certifications,
           national_id, bank_name, bank_account_no,
           created_at
         FROM users
         WHERE
           ($1::text IS NOT NULL AND (LOWER(full_name) = LOWER($1) OR LOWER(username) = LOWER($1)))
           OR ($2::text IS NOT NULL AND (id = $2 OR LOWER(username) = LOWER($2)))
         LIMIT 1`,
        [employee_name || null, user_id || null]
      );

      if (!user) return res.status(404).json({ error: 'Profile not found' });

      // Fetch pending sensitive change requests for this staff member
      const pendingReqs = await query(
        `SELECT profile_changes, requested_at
         FROM hr_staff_change_requests
         WHERE request_type = 'profile_update'
           AND (LOWER(full_name) = LOWER($1) OR user_id = $2)
           AND status = 'pending'
         ORDER BY requested_at DESC
         LIMIT 5`,
        [user.full_name || '', user.id || '']
      );

      return res.json({ success: true, profile: user, pendingChanges: pendingReqs.rows });
    } catch (err) {
      console.error('[hr/staff-profile GET]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
