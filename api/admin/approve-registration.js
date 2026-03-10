import { getOne, query } from '../db.js';
import { applyAuthCors } from '../_lib/auth.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const body = req.body || {};
    const userId = body.userId;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const STAFF_ROLES = ['frontdesk', 'consultant', 'dispenser', 'branch_manager', 'finance', 'hr_manager', 'gm', 'director', 'mis', 'stock', 'warehouse'];
    const user = await getOne('SELECT id, is_active, role FROM users WHERE id = $1', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!STAFF_ROLES.includes(user.role)) {
      return res.status(400).json({ error: 'Only staff registrations can be approved here' });
    }

    if (user.is_active) {
      return res.status(400).json({ error: 'User is already active' });
    }

    await query('UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE id = $1', [userId]);

    return res.status(200).json({ success: true, message: 'Registration approved' });
  } catch (error) {
    console.error('Approve registration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
