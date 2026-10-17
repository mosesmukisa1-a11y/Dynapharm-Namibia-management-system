import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { query, getMany, getOne } from '../db.js';

function safeJson(v, fb) {
  if (!v) return fb;
  if (typeof v === 'object') return v;
  try {return JSON.parse(v);} catch {return fb;}
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, `http://localhost`);
  const pathParts = url.pathname.replace(/^\/api\/branch\/distributor-profit/, '').split('/').filter(Boolean);

  /* ── GET /api/branch/distributor-profit/referred-sales?distributor_nb=NB ── */
  if (pathParts[0] === 'referred-sales' && req.method === 'GET') {
    const nb = url.searchParams.get('distributor_nb');
    if (!nb) return res.status(400).json({ error: 'distributor_nb required' });
    const nbUpper = nb.toUpperCase();

    // Four-part UNION for complete coverage.  All arms share the same 15 columns.
    //
    // Part A — BDP entries whose sale_id points to branch_walkin_sales (walk-in profits).
    //   Uses LEFT JOIN so orphaned BDP rows (sale deleted) still appear.
    //   Excludes prescription BDP entries (those go to Part B).
    //
    // Part B — BDP entries whose sale_id is a prescription report (RPT-…).
    //   JOINs branch_activity_transactions on form_reference_id to get customer/total data.
    //   Previously these showed as ghost rows with NULL customer name and total.
    //
    // Part C — branch_walkin_sales rows with referral_nb = NB that have no BDP entry.
    //   Fallback for historical records / missed profit writes.
    //
    // Part D — branch_activity_transactions prescription rows with referral_nb = NB
    //   that have no BDP entry (profit write failed edge case).
    //   profit_amount derived from product_total_cp − product_total_dp.
    const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/distributor-profit.js:40:0"),













































































































    [nbUpper]);

    return res.json({ success: true, sales: rows });
  }

  /* ── PATCH /api/branch/distributor-profit/:id/pay  (mark single as paid) ── */
  if (pathParts.length >= 2 && pathParts[1] === 'pay' && req.method === 'PATCH') {
    const id = pathParts[0];
    const body = safeJson(req.body, {});
    const { payment_method = 'cash', paid_by, note } = body;
    await __qd_executePlan(query, __qd_registeredPlan("api/branch/distributor-profit.js:160:1"),

    [paid_by || 'branch', payment_method, note || null, id]);

    return res.json({ success: true });
  }

  /* ── POST /api/branch/distributor-profit/pay-all  (bulk pay by distributor) ── */
  if (pathParts[0] === 'pay-all' && req.method === 'POST') {
    const body = safeJson(req.body, {});
    const { branch_id, distributor_nb, payment_method = 'cash', paid_by, note } = body;
    if (!branch_id || !distributor_nb) return res.status(400).json({ error: 'branch_id and distributor_nb required' });

    const result = await __qd_executePlan(query, __qd_registeredPlan("api/branch/distributor-profit.js:173:2"),



    [paid_by || 'branch', payment_method, note || null, branch_id, distributor_nb]);

    return res.json({ success: true, updated: result.rowCount });
  }

  /* ── GET /api/branch/distributor-profit ── */
  if (req.method === 'GET') {
    const branchId = url.searchParams.get('branch_id');
    const distributorNb = url.searchParams.get('distributor_nb');
    const status = url.searchParams.get('status');
    const grouped = url.searchParams.get('grouped') === 'true';

    const conditions = [];
    const params = [];

    if (branchId) {conditions.push(__qd_registeredPlan("api/branch/distributor-profit.js:191:3", [params.length + 1]));params.push(branchId);}
    if (distributorNb) {conditions.push(__qd_registeredPlan("api/branch/distributor-profit.js:192:4", [params.length + 1]));params.push(distributorNb);}
    if (status) {conditions.push(__qd_registeredPlan("api/branch/distributor-profit.js:193:5", [params.length + 1]));params.push(status);}

    const where = conditions.length ? __qd_registeredPlan("api/branch/distributor-profit.js:195:6", [__qd_joinPlans(conditions, "and")]) : __qd_registeredPlan("api/branch/distributor-profit.js:195:7");
    const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/distributor-profit.js:197:8", [










    where]),
    params);


    if (grouped) {
      const map = {};
      for (const r of rows) {
        const key = r.distributor_nb;
        if (!map[key]) map[key] = { distributor_nb: r.distributor_nb, distributor_name: r.distributor_name, pending: 0, paid: 0, entries: [] };
        if (r.status === 'pending') map[key].pending += Number(r.profit_amount);else
        map[key].paid += Number(r.profit_amount);
        map[key].entries.push(r);
      }
      return res.json({ success: true, groups: Object.values(map) });
    }

    return res.json({ success: true, entries: rows });
  }

  /* ── POST /api/branch/distributor-profit  (manual entry) ── */
  if (req.method === 'POST') {
    const body = safeJson(req.body, {});
    const { branch_id, distributor_nb, distributor_name, sale_id, sale_receipt, sale_date, profit_amount } = body;
    if (!branch_id || !distributor_nb || !profit_amount) return res.status(400).json({ error: 'branch_id, distributor_nb, profit_amount required' });
    const id = 'BDP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    await __qd_executePlan(query, __qd_registeredPlan("api/branch/distributor-profit.js:233:9"),


    [id, branch_id, distributor_nb, distributor_name || null, sale_id || null, sale_receipt || null, sale_date || new Date().toISOString(), Number(profit_amount)]);

    return res.status(201).json({ success: true, id });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
