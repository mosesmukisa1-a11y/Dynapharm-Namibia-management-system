import { getOne, query } from '../db.js';
import {
  applyAuthCors,
  getTokenFromRequest,
  verifyAuthToken,
  sanitizeUser,
} from '../_lib/auth.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = getTokenFromRequest(req);
    const decoded = verifyAuthToken(token);

    if (!decoded?.sub) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await getOne(
      `SELECT id, username, role, full_name, email, phone, branch, branches, additional_roles, is_active, metadata, last_login
         FROM users WHERE id = $1`,
      [decoded.sub]
    );

    if (!user || user.is_active === false) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const normalizedBranch = normalizeBranchSlug(user.branch);
    if (normalizedBranch && normalizedBranch !== user.branch) {
      await query('UPDATE users SET branch = $1, updated_at = NOW() WHERE id = $2', [normalizedBranch, user.id]);
      user.branch = normalizedBranch;
    }

    return res.status(200).json({ success: true, user: sanitizeUser(user) });
  } catch (error) {
    console.error('Session lookup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
