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

    // MIS sales lines with distributor info (from encoded/MIS drafts)
    const misRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/mis/distributors/sales.js:16:0"),










    [start, end]);


    // Live distributor-linked sales from branch_walkin_sales
    // customer_type = 'member' indicates member/distributor sales
    const liveRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/mis/distributors/sales.js:32:1"),













    [start, end]);


    // Build encoded map keyed by distributor_code + branch_id
    const encodedMap = new Map();
    for (const r of misRows) {
      const key = `${r.distributor_code || ''}|${r.branch_id}`;
      encodedMap.set(key, {
        distributorNb: r.distributor_code,
        distributorName: r.distributor_name || r.distributor_code,
        branchId: r.branch_id,
        branchName: normalizeBranchName(r.branch_id),
        salesQty: Number(r.sales_qty || 0),
        encodedValue: Number(r.encoded_value || 0)
      });
    }

    // Build live map
    const liveMap = new Map();
    for (const r of liveRows) {
      const nb = r.distributor_nb || '';
      const key = `${nb}|${r.branch_id}`;
      liveMap.set(key, { salesValue: Number(r.live_value || 0), distributorName: r.distributor_name });
    }

    const allKeys = new Set([...encodedMap.keys(), ...liveMap.keys()]);
    const results = [];

    for (const key of allKeys) {
      const encoded = encodedMap.get(key) || {};
      const live = liveMap.get(key) || {};
      const [nb, branchId] = key.split('|');
      results.push({
        distributorNb: encoded.distributorNb || nb,
        distributorName: encoded.distributorName || live.distributorName || nb,
        branchName: encoded.branchName || normalizeBranchName(branchId),
        salesQty: encoded.salesQty || 0,
        salesValue: live.salesValue || 0,
        encodedValue: encoded.encodedValue || 0,
        difference: (live.salesValue || 0) - (encoded.encodedValue || 0)
      });
    }

    results.sort((a, b) => (a.distributorNb || '').localeCompare(b.distributorNb || ''));
    res.json({ success: true, period: { start, end }, distributorSales: results });
  } catch (err) {
    console.error('[mis/distributors/sales]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
