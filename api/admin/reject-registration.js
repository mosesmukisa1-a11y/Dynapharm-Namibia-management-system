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

    const user = await getOne('SELECT id, role, is_active FROM users WHERE id = $1', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.is_active === true) {
      return res.status(400).json({ error: 'Cannot reject an active account' });
    }

    await query('DELETE FROM users WHERE id = $1 AND is_active = FALSE', [userId]);

    return res.status(200).json({ success: true, message: 'Registration rejected' });
  } catch (error) {
    console.error('Reject registration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
