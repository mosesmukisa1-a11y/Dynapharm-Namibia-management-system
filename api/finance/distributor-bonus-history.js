import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

const FINANCE_ROLES = new Set(['admin', 'gm', 'director', 'finance']);

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const role = req.user.role || '';
  if (!FINANCE_ROLES.has(role)) {
    return res.status(403).json({ success: false, error: 'Finance access required' });
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const search = url.searchParams.get('search') || '';
    const nb = url.searchParams.get('nb') || '';
    const period = url.searchParams.get('period') || '';
    const status = url.searchParams.get('status') || '';

    const params = [];
    const where = [];

    if (nb) {
      params.push(nb.toUpperCase());
      where.push(__qd_registeredPlan("api/finance/distributor-bonus-history.js:32:0", [params.length]));
    } else if (search) {
      params.push(`%${search}%`);
      where.push(__qd_registeredPlan("api/finance/distributor-bonus-history.js:35:1", [params.length, params.length]));
    }

    if (period) {
      params.push(period);
      where.push(__qd_registeredPlan("api/finance/distributor-bonus-history.js:40:2", [params.length]));
    }

    if (status) {
      params.push(status);
      where.push(__qd_registeredPlan("api/finance/distributor-bonus-history.js:45:3", [params.length]));
    }

    const whereClause = where.length ? __qd_registeredPlan("api/finance/distributor-bonus-history.js:48:4", [__qd_joinPlans(where, "and")]) : __qd_registeredPlan("api/finance/distributor-bonus-history.js:48:5");

    const bonuses = await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/distributor-bonus-history.js:51:6", [





    whereClause]),

    params);


    if (bonuses.length === 0) {
      return res.json({ success: true, history: [], total: 0 });
    }

    const bonusIds = bonuses.map((b) => b.id);
    const payments = await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/distributor-bonus-history.js:67:7"),





    [bonusIds]);


    const payMap = {};
    for (const p of payments) {
      if (!payMap[p.bonus_id]) payMap[p.bonus_id] = [];
      payMap[p.bonus_id].push(p);
    }

    const history = bonuses.map((b) => ({
      ...b,
      outstanding: Number(b.amount_earned) - Number(b.amount_paid),
      payments: payMap[b.id] || []
    }));

    return res.json({ success: true, history, total: history.length });
  } catch (err) {
    console.error('[finance/distributor-bonus-history]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
