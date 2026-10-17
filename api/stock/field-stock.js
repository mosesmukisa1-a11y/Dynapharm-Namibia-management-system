import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const search = url.searchParams.get('search') || '';
    const status = url.searchParams.get('status') || '';
    const branchId = url.searchParams.get('branchId') || '';

    const conditions = [__qd_registeredPlan("api/stock/field-stock.js:15:0")];
    const params = [];
    if (status) {conditions.push(__qd_registeredPlan("api/stock/field-stock.js:17:1", [params.length + 1]));params.push(status);}
    if (branchId) {conditions.push(__qd_registeredPlan("api/stock/field-stock.js:18:2", [params.length + 1]));params.push(branchId);}

    let records = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/field-stock.js:21:3", [__qd_joinPlans(
      conditions, "and")]),
    params);


    if (search) records = records.filter((r) => (r.description || r.product_name || '').toLowerCase().includes(search.toLowerCase()) || (r.recipient_name || '').toLowerCase().includes(search.toLowerCase()));

    res.status(200).json({ success: true, records, total: records.length });
  } catch (err) {
    console.error('Field stock error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
