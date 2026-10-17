import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { getMany } from '../db.js';
import { applyAuthCors } from '../_lib/auth.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/admin/pending-registrations.js:21:0"),




    []);


    return res.status(200).json({ success: true, registrations: rows });
  } catch (error) {
    console.error('Pending registrations error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
