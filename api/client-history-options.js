import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./services/queryDescriptors.js";import { getMany } from './db.js';
import { historyAccess } from './services/clientHistoryAccess.js';
export default async function handler(req, res) {
  try {
    const branch = new URL(req.url, 'http://local').searchParams.get('branch');
    historyAccess(req.user, branch);
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const all = await __qd_executePlan(getMany, __qd_registeredPlan("api/client-history-options.js:8:0"), []);
    const consultants = all.filter((u) => {try {historyAccess(u, branch);return true;} catch {return false;}}).
    map(({ id, full_name }) => ({ id, name: full_name }));
    const products = await __qd_executePlan(getMany, __qd_registeredPlan("api/client-history-options.js:11:1"), []);
    return res.json({ consultants, products });
  } catch (e) {return res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Options unavailable' });}
}
