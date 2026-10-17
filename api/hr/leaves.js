import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { query } from '../db.js';
import { atomicStockRequest } from '../_lib/atomicStockRequest.js';

function workingDays(startDate, endDate) {
  let count = 0;
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const sp = new URL(req.url, `http://localhost`).searchParams;
      const status = sp.get('status');
      const employee_name = sp.get('employee_name');

      let sql = __qd_registeredPlan("api/hr/leaves.js:27:0");






























      const params = [];
      if (status) {params.push(status);sql = __qd_joinPlans([sql, __qd_registeredPlan("api/hr/leaves.js:59:1", [params.length])], "empty");}
      if (employee_name) {params.push(`%${employee_name}%`);sql = __qd_joinPlans([sql, __qd_registeredPlan("api/hr/leaves.js:60:2", [params.length])], "empty");}
      sql = __qd_joinPlans([sql, __qd_registeredPlan("api/hr/leaves.js:61:3")], "empty");

      const result = await __qd_executePlan(query, sql, params);
      const leaves = result.rows;

      const pendingLeaves = leaves.filter((l) => l.status === 'pending');
      await Promise.all(
        pendingLeaves.map(async (leaf) => {
          if (!leaf.emp_position || !leaf.emp_branch) return;

          const covResult = await __qd_executePlan(query, __qd_registeredPlan("api/hr/leaves.js:72:4"),













          [leaf.emp_position, leaf.emp_branch, leaf.employee_name, leaf.start_date, leaf.end_date]);

          leaf.coverage_staff = covResult.rows;
          leaf.working_days = workingDays(leaf.start_date, leaf.end_date);
        })
      );

      for (const leaf of leaves.filter((l) => l.status !== 'pending')) {
        leaf.working_days = workingDays(leaf.start_date, leaf.end_date);
      }

      return res.json({ success: true, leaves });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { employee_name, employee_id, leave_type, start_date, end_date, reason, urgent } = body;

      if (!employee_name || !start_date || !end_date) {
        return res.status(400).json({ success: false, error: 'Employee name, start date, and end date are required' });
      }

      const result = await __qd_executePlan(query, __qd_registeredPlan("api/hr/leaves.js:108:5"),




      [
      employee_name,
      employee_id || null,
      leave_type || 'Annual',
      start_date,
      end_date,
      reason || null,
      urgent === true || urgent === 'true' ? true : false,
      req.user?.full_name || req.user?.username || null]);



      return res.status(201).json({ success: true, leave: result.rows[0] });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const url = new URL(req.url, `http://localhost`);
      const id = url.searchParams.get('id') || (req.body || {}).id;
      const body = req.body || {};

      if (!id) return res.status(400).json({ success: false, error: 'id is required' });

      if (!req.user) return res.status(401).json({ error: 'Authentication required' });
      if (!['gm', 'admin', 'director', 'finance'].includes(req.user.role)) return res.status(403).json({ error: 'Leave review access required' });
      const { status, notes, rejection_reason } = body;
      if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status must be approved or rejected' });
      const prior = (await __qd_executePlan(query, __qd_registeredPlan("api/hr/leaves.js:138:6"), [id])).rows[0];
      if (!prior) return res.status(404).json({ error: 'Leave request not found' });
      if (prior.status === status) return res.json({ success: true, leave: prior });
      if (prior.status !== 'pending') return res.status(409).json({ error: 'Leave request is already reviewed' });
      const approved_by = req.user.sub || req.user.id || req.user.username;
      const result = await __qd_executePlan(query, __qd_registeredPlan("api/hr/leaves.js:144:7"),









      [status || null, approved_by || null, notes || null, id, rejection_reason || null]);


      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Leave request not found' });
      }

      return res.json({ success: true, leave: result.rows[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[hr/leaves]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
export default atomicStockRequest(handler);
