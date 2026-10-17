import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { query, getOne, insert } from '../db.js';
import { buildEmployeeRecord } from '../employees.js';

const GM_ROLES = new Set(['gm', 'admin', 'director']);
const HR_ROLES = new Set(['hr_manager', 'hr', 'admin', 'gm', 'director']);
const ALL_STAFF = new Set(['*']); // any authenticated user

import { atomicStockRequest } from '../_lib/atomicStockRequest.js';
async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const role = req.user?.role || '';
  const actor = req.user?.fullName || req.user?.full_name || req.user?.username || role;

  try {
    if (req.method === 'GET') {
      if (!HR_ROLES.has(role)) return res.status(403).json({ error: 'Access denied' });
      const sp = new URL(req.url, 'http://localhost').searchParams;
      const status = sp.get('status');
      let sql = __qd_registeredPlan("api/hr/staff-change-requests.js:22:0");
      const params = [];
      if (status) {params.push(status);sql = __qd_joinPlans([sql, __qd_registeredPlan("api/hr/staff-change-requests.js:24:1", [params.length])], "empty");}
      sql = __qd_joinPlans([sql, __qd_registeredPlan("api/hr/staff-change-requests.js:25:2")], "empty");
      const result = await __qd_executePlan(query, sql, params);
      return res.json({ success: true, requests: result.rows });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { request_type, full_name, employee_row_id, position, department, branch,
        hire_date, phone, email, reason, profile_changes, user_id } = body;

      if (!request_type || !full_name) {
        return res.status(400).json({ error: 'request_type and full_name are required' });
      }
      if (!['add', 'remove', 'profile_update'].includes(request_type)) {
        return res.status(400).json({ error: 'request_type must be add, remove, or profile_update' });
      }

      // profile_update can be submitted by any authenticated user (self-service)
      if (request_type !== 'profile_update' && !HR_ROLES.has(role)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const result = await __qd_executePlan(query, __qd_registeredPlan("api/hr/staff-change-requests.js:48:3"),






      [request_type, full_name, employee_row_id || null, position || null,
      department || null, branch || null, hire_date || null,
      phone || null, email || null, reason || null,
      profile_changes ? JSON.stringify(profile_changes) : null,
      user_id || null, actor]);

      return res.status(201).json({ success: true, request: result.rows[0] });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const sp = new URL(req.url, 'http://localhost').searchParams;
      const id = sp.get('id') || (req.body || {}).id;
      if (!id) return res.status(400).json({ error: 'id is required' });

      const body = req.body || {};
      const { status, gm_note } = body;
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'status must be approved or rejected' });
      }

      const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/hr/staff-change-requests.js:74:4"), [id]);
      if (!existing) return res.status(404).json({ error: 'Request not found' });
      if (existing.status !== 'pending') return res.status(409).json({ error: 'Request already processed' });

      // profile_update can be approved by HR; add/remove requires GM
      const isProfileUpdate = existing.request_type === 'profile_update';
      if (isProfileUpdate && !HR_ROLES.has(role)) {
        return res.status(403).json({ error: 'Only HR, Admin, or GM can approve profile updates' });
      }
      if (!isProfileUpdate && !GM_ROLES.has(role)) {
        return res.status(403).json({ error: 'Only GM, Admin, or Director can approve/reject staff changes' });
      }

      await __qd_executePlan(query, __qd_registeredPlan("api/hr/staff-change-requests.js:88:5"),

      [status, actor, gm_note || null, id]);


      if (status === 'approved') {
        if (existing.request_type === 'add') {
          const created = await insert('employees', buildEmployeeRecord({
            full_name: existing.full_name, position: existing.position || '', department: existing.department || '',
            branch: existing.branch || '', hire_date: existing.hire_date || null,
            phone: existing.phone || null, email: existing.email || null, employment_status: 'active'
          }));
          await __qd_executePlan(query, __qd_registeredPlan("api/hr/staff-change-requests.js:99:6"), [id, created.id]);
        } else if (existing.request_type === 'remove' && existing.employee_row_id) {
          await __qd_executePlan(query, __qd_registeredPlan("api/hr/staff-change-requests.js:102:7"),

          [existing.employee_row_id]);

        } else if (existing.request_type === 'profile_update' && existing.profile_changes) {
          // Apply the approved sensitive field changes to the users table
          const changes = typeof existing.profile_changes === 'string' ?
          JSON.parse(existing.profile_changes) :
          existing.profile_changes;

          const ALLOWED = ['national_id', 'bank_name', 'bank_account_no'];
          const toApply = {};
          for (const [k, v] of Object.entries(changes)) {
            if (ALLOWED.includes(k)) toApply[k] = v || null;
          }

          if (Object.keys(toApply).length > 0) {
            const vals = [existing.user_id || existing.full_name, JSON.stringify(toApply)];
            await __qd_executePlan(query, __qd_registeredPlan("api/hr/staff-change-requests.js:120:8"),






            vals);

          }
        }
      }

      const updated = await __qd_executePlan(getOne, __qd_registeredPlan("api/hr/staff-change-requests.js:132:9"), [id]);
      return res.json({ success: true, request: updated });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[hr/staff-change-requests]', err);
    return res.status(500).json({ error: err.message });
  }
}
export default atomicStockRequest(handler);
