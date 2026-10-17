import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { getOne, query } from '../db.js';
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

    const user = await __qd_executePlan(getOne, __qd_registeredPlan("api/admin/reject-registration.js:28:0"),

    [userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.is_active === true) {
      return res.status(400).json({ error: 'Cannot reject an active account' });
    }

    // Delete employee record if this was a staff registration
    // (staff registrations auto-create an employees row with employment_status='pending')
    if (user.role !== 'distributor') {
      await __qd_executePlan(query, __qd_registeredPlan("api/admin/reject-registration.js:43:1"),

      [userId]).
      catch((err) => console.warn('Employee cleanup (non-critical):', err.message));
    }

    // Remove the pending portal account from users
    await __qd_executePlan(query, __qd_registeredPlan("api/admin/reject-registration.js:49:2"), [userId]);

    return res.status(200).json({
      success: true,
      message: 'Registration rejected and account removed from the system',
      removed_user: user.full_name || user.username
    });
  } catch (error) {
    console.error('Reject registration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
