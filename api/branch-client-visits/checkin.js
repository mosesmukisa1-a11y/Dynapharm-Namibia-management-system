import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany } from '../db.js';

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => raw += c);
    req.on('end', () => {try {resolve(raw ? JSON.parse(raw) : {});} catch {reject(new Error('Invalid JSON'));}});
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const { branch_id, client_name, client_phone, nb_number, visit_type, checkin_time, served_by, notes } = body;

      if (!branch_id) return res.status(400).json({ success: false, error: 'branch_id required' });

      const id = `BCV-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const checkin = checkin_time || new Date().toISOString();

      await __qd_executePlan(query, __qd_registeredPlan("api/branch-client-visits/checkin.js:29:0"),


      [id, branch_id, client_name || 'Walk-in', client_phone || null, nb_number || null, visit_type || 'walk_in', checkin, served_by || null, notes || null, new Date()]);


      return res.status(201).json({
        success: true,
        visit_id: id,
        message: 'Client checked in successfully',
        checkin_time: checkin
      });
    }

    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const branchId = url.searchParams.get('branch_id') || '';
      const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

      const conds = [__qd_registeredPlan("api/branch-client-visits/checkin.js:47:1")];
      const params = [date];
      if (branchId) {conds.push(__qd_registeredPlan("api/branch-client-visits/checkin.js:49:2", [params.length + 1]));params.push(branchId);}

      const visits = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch-client-visits/checkin.js:52:3", [__qd_joinPlans(
        conds, "and")]),
      params);


      return res.status(200).json({
        success: true,
        date,
        visits,
        summary: {
          total: visits.length,
          byType: visits.reduce((acc, v) => {acc[v.visit_type] = (acc[v.visit_type] || 0) + 1;return acc;}, {})
        }
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('branch-client-visits/checkin error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
