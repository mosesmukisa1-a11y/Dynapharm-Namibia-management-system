import { getOne, query } from '../db.js';
import { applyAuthCors } from '../_lib/auth.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';

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

    const ALLOWED_ROLES = ['frontdesk', 'consultant', 'dispenser', 'branch_manager', 'finance', 'hr_manager', 'gm', 'director', 'mis', 'stock', 'warehouse', 'distributor', 'training', 'trainer'];
    const BRANCH_REQUIRED_ROLES = new Set(['frontdesk', 'consultant', 'dispenser', 'branch_manager']);

    const user = await getOne('SELECT id, is_active, role, branch, metadata FROM users WHERE id = $1', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!ALLOWED_ROLES.includes(user.role)) {
      return res.status(400).json({ error: 'This role cannot be approved through this interface' });
    }

    if (user.is_active) {
      return res.status(400).json({ error: 'User is already active' });
    }

    const metadataBranch = (() => {
      try {
        const meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata || '{}') : (user.metadata || {});
        return meta.branch || null;
      } catch {
        return null;
      }
    })();

    const resolvedBranch = normalizeBranchSlug(user.branch) || normalizeBranchSlug(metadataBranch);

    if (!resolvedBranch && BRANCH_REQUIRED_ROLES.has(user.role)) {
      return res.status(400).json({
        error: `Cannot approve this ${user.role} — no branch is set on their account or registration metadata. Please assign a branch before approving.`
      });
    }

    if (resolvedBranch) {
      await query(
        `UPDATE users SET is_active = TRUE, branch = $1, updated_at = NOW() WHERE id = $2`,
        [resolvedBranch, userId]
      );
    } else {
      await query(
        `UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE id = $1`,
        [userId]
      );
    }

    return res.status(200).json({ success: true, message: 'Registration approved' });
  } catch (error) {
    console.error('Approve registration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
