import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js";import { applyAuthCors, getBranchScope } from '../../_lib/auth.js';
import { getMany } from '../../db.js';
import { branchSearchTermsForMany } from '../../_lib/branchUtils.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const branchScope = getBranchScope(req.user);

  try {
    let requests;
    if (branchScope.enforced) {
      const terms = branchSearchTermsForMany(branchScope.branches);
      requests = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/distribution/pending.js:21:0"),

      [terms]);

    } else {
      requests = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/distribution/pending.js:26:1"), []);


    }

    const pending = requests.map((r) => {
      let items = [];
      try {items = typeof r.items === 'string' ? JSON.parse(r.items || '[]') : r.items || [];} catch {}
      return {
        requestId: r.id,
        branchId: r.requesting_branch || r.branch_id,
        branchName: (r.requesting_branch || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        status: r.status,
        priority: r.priority || 'normal',
        items,
        createdAt: r.created_at
      };
    });

    res.status(200).json({ success: true, pending, total: pending.length });
  } catch (err) {
    console.error('Pending distribution error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
