import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
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
      const user = await __qd_executePlan(getOne, __qd_registeredPlan("api/hr/staff-profile.js:19:0"),














      [employee_name || null, user_id || null]);


      if (!user) return res.status(404).json({ error: 'Profile not found' });

      // Fetch pending sensitive change requests for this staff member
      const pendingReqs = await __qd_executePlan(query, __qd_registeredPlan("api/hr/staff-profile.js:40:1"),







      [user.full_name || '', user.id || '']);


      return res.json({ success: true, profile: user, pendingChanges: pendingReqs.rows });
    } catch (err) {
      console.error('[hr/staff-profile GET]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
