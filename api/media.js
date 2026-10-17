import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "./services/queryDescriptors.js";import { applyAuthCors } from './_lib/auth.js';
import { getMany } from './db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      const { upload_type } = req.query || {};
      let query = __qd_registeredPlan("api/media.js:14:0");
      const params = [];
      if (upload_type) {
        query = __qd_joinPlans([query, __qd_registeredPlan("api/media.js:17:1")], "empty");
        params.push(upload_type);
      }
      query = __qd_joinPlans([query, __qd_registeredPlan("api/media.js:20:2")], "empty");
      const rows = await __qd_executePlan(getMany, query, params);
      return res.json(rows);
    } catch (error) {
      console.error('Media API error:', error);
      return res.json([]);
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
