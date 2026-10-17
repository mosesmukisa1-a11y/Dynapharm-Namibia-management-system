import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js"; /**
 * GET /api/stock/reports/precomputed
 * Returns the latest pre-computed stock summary for a given period type and key.
 * Query params:
 *   period_type: 'daily' | 'weekly' | 'monthly'
 *   period_key:  e.g. '2025-01-15', '2025-W03', '2025-01'
 *   branch_id:   optional branch filter
 */
import { applyAuthCors } from '../../_lib/auth.js';
import { getOne, getMany } from '../../db.js';
import { canReadCompanyStock, storedFreshness } from '../../services/stockReportFreshness.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (!canReadCompanyStock(req.user)) return res.status(403).json({ success: false, error: 'Company stock reporting access denied' });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const periodType = url.searchParams.get('period_type') || 'daily';
    const periodKey = url.searchParams.get('period_key') || null;
    const branchId = url.searchParams.get('branch_id') || null;

    if (periodKey) {
      // Fetch specific summary
      const row = await __qd_executePlan(getOne, __qd_registeredPlan("api/stock/reports/precomputed.js:29:0"),


      [periodType, periodKey, branchId || '']);


      if (!row) {
        return res.status(404).json({ success: false, error: 'No pre-computed summary found', period_type: periodType, period_key: periodKey });
      }

      const data = typeof row.report_data === 'string' ? JSON.parse(row.report_data) : row.report_data;
      const freshness = storedFreshness(row.computed_at);
      if (freshness.state === 'unavailable') return res.status(503).json({ success: false, error: freshness.reason, freshness });
      return res.json({ success: true, source: 'precomputed', period_type: periodType, period_key: periodKey, computed_at: row.computed_at, data, freshness });
    }

    // Fetch latest summaries for the given period type
    const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/reports/precomputed.js:46:1", [


    branchId ? 'AND branch_id = $2' : 'AND branch_id IS NULL']),

    branchId ? [periodType, branchId] : [periodType]);


    const summaries = rows.map((r) => ({
      period_key: r.period_key,
      branch_id: r.branch_id,
      computed_at: r.computed_at,
      freshness: storedFreshness(r.computed_at),
      data: typeof r.report_data === 'string' ? JSON.parse(r.report_data) : r.report_data
    }));

    if (!summaries.length || summaries.some((s) => s.freshness.state === 'unavailable'))
    return res.status(503).json({ success: false, error: 'Stored summaries unavailable', freshness: { state: 'unavailable' } });
    return res.json({ success: true, source: 'precomputed', period_type: periodType, summaries });
  } catch (err) {
    console.error('precomputed summary error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
