import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { query } from '../db.js';

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const branchParam = searchParams.get('branch');
    const startParam = searchParams.get('startDate');
    const endParam = searchParams.get('endDate');

    const params = [];

    // ── Walk-in tab condition ─────────────────────────────────────────────────
    // CSI tracks member/distributor activity:
    //   1. Member's own purchase: customer_type='member', distributor_nb = their own NB
    //   2. Non-member referral sale: referral_nb = the referring member's NB
    //      → attributed to the referring member (show their NB + their name from distributors table)
    const baseCondition = `(
      (s.customer_type = 'member' AND s.distributor_nb IS NOT NULL AND TRIM(s.distributor_nb) != '')
      OR (
        (s.referral_nb IS NOT NULL AND TRIM(s.referral_nb) != '')
        AND (s.customer_type IS DISTINCT FROM 'member')
      )
    )`;

    const where = [__qd_registeredPlan("api/mis/csi-entries.js:43:0")];

    if (branchParam && branchParam !== 'all' && branchParam !== '') {
      params.push(branchParam);
      where.push(__qd_registeredPlan("api/mis/csi-entries.js:47:1", [params.length]));
    }

    const start = parseDate(startParam);
    const end = parseDate(endParam);

    if (start) {
      params.push(start.toISOString().slice(0, 10));
      where.push(__qd_registeredPlan("api/mis/csi-entries.js:55:2", [params.length]));
    }

    if (end) {
      const endOfDay = new Date(end);
      endOfDay.setHours(23, 59, 59, 999);
      params.push(endOfDay.toISOString().slice(0, 10));
      where.push(__qd_registeredPlan("api/mis/csi-entries.js:62:3", [params.length]));
    }

    const walkinWhereClause = `WHERE ${where.join(' AND ')}`;

    // ── Prescription tab date/branch params (same values, new param indices) ──
    // We re-use the same $1..$N values from the walkin query by appending more.
    const rxWhere = [];

    if (branchParam && branchParam !== 'all' && branchParam !== '') {
      // Re-use param already added (it's the first one if set)
      const branchIdx = where.findIndex((w) => w.includes('branch_id'));
      if (branchIdx >= 0) {
        // Find its param index by counting previous params
        // Easiest: just push a new param for the prescription subquery
        params.push(branchParam);
        rxWhere.push(__qd_registeredPlan("api/mis/csi-entries.js:78:4", [params.length]));
      }
    }

    if (start) {
      params.push(start.toISOString().slice(0, 10));
      rxWhere.push(__qd_registeredPlan("api/mis/csi-entries.js:84:5", [params.length]));
    }

    if (end) {
      params.push(end.toISOString().slice(0, 10));
      rxWhere.push(__qd_registeredPlan("api/mis/csi-entries.js:89:6", [params.length]));
    }

    const rxWhereClause = rxWhere.length > 0 ? __qd_registeredPlan("api/mis/csi-entries.js:92:7", [__qd_joinPlans(rxWhere, "and")]) : __qd_registeredPlan("api/mis/csi-entries.js:92:8");

    // ── Combined query: walk-in items UNION prescription items ───────────────
    const sql = __qd_registeredPlan("api/mis/csi-entries.js:95:9", [__qd_joinPlans(




































































































      where, "and"),





















































































    rxWhereClause]);





    const { rows } = await __qd_executePlan(query, sql, params);

    return res.status(200).json({
      success: true,
      entries: rows,
      total: rows.length
    });
  } catch (error) {
    console.error('MIS csi-entries API error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error'
    });
  }
}
