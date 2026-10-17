import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan, trimPlan as __qd_trimPlan } from "../../services/queryDescriptors.js";import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const month = url.searchParams.get('month') || null;

    let params = [];
    let dateWhere = __qd_registeredPlan("api/stock/monthly-sales/branches.js:14:0");
    if (month) {
      const [yr, mo] = month.split('-');
      const start = `${yr}-${mo}-01`;
      const end = new Date(Number(yr), Number(mo), 0).toISOString().slice(0, 10);
      dateWhere = __qd_registeredPlan("api/stock/monthly-sales/branches.js:19:1");
      params = [start, end + 'T23:59:59'];
    }

    const sales = await __qd_executePlan(getMany, __qd_trimPlan(__qd_registeredPlan("api/stock/monthly-sales/branches.js:24:2", [
    dateWhere])),
    params);


    const branches = sales.map((s) => ({
      branchId: s.branch_id,
      branchName: (s.branch_id || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      totalRevenue: parseFloat(Number(s.total_revenue || 0).toFixed(2)),
      transactionCount: Number(s.transaction_count || 0)
    }));

    res.status(200).json({ success: true, branches, period: month || 'all' });
  } catch (err) {
    console.error('Monthly sales branches error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
