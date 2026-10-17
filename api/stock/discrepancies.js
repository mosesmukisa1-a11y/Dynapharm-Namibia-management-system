import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js"; /**
 * GET /api/stock/discrepancies
 * Returns stock transfers where discrepancy_flag = true,
 * so Finance and GM staff can review short-receipt incidents.
 * Accessible by: admin, gm, general_manager, finance, director
 */
import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Auth required' });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const ALLOWED = new Set(['admin', 'gm', 'general_manager', 'director', 'finance', 'finance_manager']);
  if (!ALLOWED.has((req.user?.role || '').toLowerCase())) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const branch = url.searchParams.get('branch') || null;
    const limit = Math.min(Number(url.searchParams.get('limit') || 100), 200);
    const offset = Number(url.searchParams.get('offset') || 0);

    const conditions = [__qd_registeredPlan("api/stock/discrepancies.js:27:0")];
    const params = [];

    if (branch) {
      params.push(branch);
      conditions.push(__qd_registeredPlan("api/stock/discrepancies.js:33:1", [
      params.length])
      );
    }

    const where = conditions.length > 0 ? __qd_registeredPlan("api/stock/discrepancies.js:37:2", [__qd_joinPlans(conditions, "and")]) : __qd_registeredPlan("api/stock/discrepancies.js:37:3");

    const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/discrepancies.js:40:4", [





























    where,


    params.length + 1, params.length + 2]),
    [...params, limit, offset]);


    return res.json({
      success: true,
      discrepancies: rows,
      count: rows.length,
      total: Number(rows[0]?.total_count ?? rows.length)
    });
  } catch (err) {
    console.error('[GET /api/stock/discrepancies]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
