import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js";import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';
import { getDateRange, normalizeBranchName } from '../../services/gmFinanceMisEngine.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { start, end } = getDateRange(req.query);

    // Live sales from branch_walkin_sales (completed)
    const liveRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/mis/reconciliation/sales.js:16:0"),






    [start, end]);


    // Encoded sales from MIS drafts (submitted/posted status)
    const encodedRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/mis/reconciliation/sales.js:27:1"),









    [start, end]);


    // Build a map of encoded values
    const encodedMap = new Map();
    for (const e of encodedRows) {
      const key = `${e.branch_id}|${e.category}`;
      encodedMap.set(key, Number(e.encoded_value || 0));
    }

    // Normalize customer_type to category
    const catMap = {
      member: 'member_sale', 'non-member': 'non_member_sale',
      customer: 'non_member_sale', online: 'online_order_sale'
    };
    const normalize = (ct) => {
      const lc = (ct || '').toLowerCase();
      if (lc.includes('member') && !lc.includes('non')) return 'member_sale';
      if (lc.includes('non')) return 'non_member_sale';
      if (lc.includes('online')) return 'online_order_sale';
      return 'non_member_sale';
    };

    // Aggregate live sales by branch + category
    const liveMap = new Map();
    for (const r of liveRows) {
      const cat = normalize(r.customer_type);
      const key = `${r.branch_id}|${cat}`;
      liveMap.set(key, (liveMap.get(key) || 0) + Number(r.total_value || 0));
    }

    // Build all unique (branch, category) combos
    const allKeys = new Set([...liveMap.keys(), ...encodedMap.keys()]);
    const results = [];

    for (const key of allKeys) {
      const [branchId, category] = key.split('|');
      const liveSalesValue = liveMap.get(key) || 0;
      const encodedSalesValue = encodedMap.get(key) || 0;
      const difference = liveSalesValue - encodedSalesValue;
      results.push({
        branchId,
        branchName: normalizeBranchName(branchId),
        category,
        liveSalesValue,
        encodedSalesValue,
        difference,
        status: Math.abs(difference) < 0.01 ? 'ok' : difference > 0 ? 'under_encoded' : 'over_encoded'
      });
    }

    results.sort((a, b) => a.branchId.localeCompare(b.branchId));
    res.json({ success: true, period: { start, end }, salesReconciliation: results });
  } catch (err) {
    console.error('[mis/reconciliation/sales]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
