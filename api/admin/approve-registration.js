import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { getOne, insert, query } from '../db.js';
import { applyAuthCors } from '../_lib/auth.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';
import crypto from 'crypto';

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

    const ALLOWED_ROLES = ['frontdesk', 'consultant', 'dispenser', 'branch_manager', 'finance', 'hr_manager', 'gm', 'director', 'mis', 'stock', 'warehouse', 'distributor', 'training', 'trainer', 'cleaner', 'security_guard', 'support_staff'];
    const BRANCH_REQUIRED_ROLES = new Set(['frontdesk', 'consultant', 'dispenser', 'branch_manager']);

    const user = await __qd_executePlan(getOne, __qd_registeredPlan("api/admin/approve-registration.js:33:0"),

    [userId]);

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
        const meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata || '{}') : user.metadata || {};
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

    // Activate the user account
    if (resolvedBranch) {
      await __qd_executePlan(query, __qd_registeredPlan("api/admin/approve-registration.js:68:1"),

      [resolvedBranch, userId]);

    } else {
      await __qd_executePlan(query, __qd_registeredPlan("api/admin/approve-registration.js:73:2"),

      [userId]);

    }

    // Update employees record status if this was a staff registration
    if (user.role !== 'distributor') {
      await __qd_executePlan(query, __qd_registeredPlan("api/admin/approve-registration.js:81:3"),

      [userId]).
      catch((err) => console.warn('Employee status update (non-critical):', err.message));
    }

    // --- Send approval notification so user sees it immediately on first login ---
    const isDistributor = user.role === 'distributor';
    const recipientType = isDistributor ? 'distributor' : 'staff';
    // Distributors use their NB number (uppercase username), staff use lowercase username
    const recipientId = isDistributor ?
    (user.username || '').toUpperCase() :
    (user.username || '').toLowerCase();

    const roleLabel = {
      distributor: 'Distributor Portal',
      frontdesk: 'Front Desk Portal',
      consultant: 'Consultant Portal',
      dispenser: 'Dispenser Portal',
      branch_manager: 'Branch Manager Portal',
      finance: 'Finance Portal',
      hr_manager: 'HR Portal',
      gm: 'GM Portal',
      director: 'Director Portal',
      mis: 'MIS Portal',
      stock: 'Stock Portal',
      warehouse: 'Warehouse Portal',
      training: 'Training Portal',
      trainer: 'Training Portal'
    }[user.role] || 'Portal';

    const approvedByName = req.user?.full_name || req.user?.name || req.user?.username || 'Admin';

    try {
      await insert('notifications', {
        id: crypto.randomUUID(),
        recipient_type: recipientType,
        recipient_id: recipientId,
        title: '✅ Your Account Has Been Approved!',
        message: isDistributor ?
        `Welcome to the Dynapharm Distributor Portal, ${user.full_name}! Your sign-up request has been approved. You can now log in using your NB number (${(user.username || '').toUpperCase()}) and your password. If you have any questions, please visit your nearest Dynapharm branch.` :
        `Welcome, ${user.full_name}! Your staff account has been approved and you now have access to the ${roleLabel}. Please log in with your username and password. If you have not yet changed your password, please do so on first login.`,
        type: 'account_approved',
        is_read: false,
        metadata: JSON.stringify({
          approved_by: approvedByName,
          approved_at: new Date().toISOString(),
          role: user.role,
          branch: resolvedBranch || null
        })
      });
    } catch (notifErr) {
      console.warn('Approval notification (non-critical):', notifErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Registration approved — notification sent to user'
    });
  } catch (error) {
    console.error('Approve registration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
