import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js";import { applyAuthCors, getBranchScope } from '../../_lib/auth.js';
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
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const status = url.searchParams.get('status') || '';

    const conditions = [__qd_registeredPlan("api/stock/distribution/requests.js:20:0")];
    const params = [];
    if (status) {conditions.push(__qd_registeredPlan("api/stock/distribution/requests.js:22:1", [params.length + 1]));params.push(status);}
    if (branchScope.enforced) {
      const terms = branchSearchTermsForMany(branchScope.branches);
      params.push(terms);
      conditions.push(__qd_registeredPlan("api/stock/distribution/requests.js:26:2", [params.length]));
    }

    const requests = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/distribution/requests.js:30:3", [__qd_joinPlans(
      conditions, "and")]),
    params);


    const formatted = requests.map((r) => {
      let items = [];
      try {items = typeof r.items === 'string' ? JSON.parse(r.items || '[]') : r.items || [];} catch {}
      return {
        requestId: r.id,
        branchId: r.requesting_branch || r.branch_id,
        branchName: (r.requesting_branch || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        status: r.status,
        priority: r.priority || 'normal',
        items,
        notes: r.notes,
        requestedBy: r.requested_by || r.created_by,
        createdAt: r.created_at
      };
    });

    return res.status(200).json({ success: true, requests: formatted, total: formatted.length });
  } catch (err) {
    console.error('Distribution requests error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
