import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js"; /**
 * GET /api/director/registrations/summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Countrywide and per-branch registrations (clients + distributors).
 */
import { getDateRange, normalizeBranchName } from '../../services/gmFinanceMisEngine.js';
import { getMany, getOne } from '../../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);

  const [clientRows, distRows, branchRows] = await Promise.all([__qd_executePlan(
    getMany, __qd_registeredPlan("api/director/registrations/summary.js:15:0"),




    [start, end]), __qd_executePlan(

    getMany, __qd_registeredPlan("api/director/registrations/summary.js:22:1"),




    [start, end]), __qd_executePlan(

    getMany, __qd_registeredPlan("api/director/registrations/summary.js:28:2"), [])]
  );

  const branchMap = new Map(branchRows.map((b) => [b.id, b.name]));

  const combined = new Map();
  for (const r of clientRows) {
    const id = r.branch_id;
    combined.set(id, (combined.get(id) || 0) + Number(r.cnt));
  }
  for (const r of distRows) {
    const id = r.branch_id;
    combined.set(id, (combined.get(id) || 0) + Number(r.cnt));
  }

  let countrywideRegistrations = 0;
  const branches = [];
  for (const [branchId, count] of combined.entries()) {
    countrywideRegistrations += count;
    branches.push({
      branchId,
      branchName: branchMap.get(branchId) || normalizeBranchName(branchId),
      registrationsCount: count
    });
  }
  branches.sort((a, b) => b.registrationsCount - a.registrationsCount);

  return res.json({
    success: true,
    period: { start, end },
    countrywideRegistrations,
    branches
  });
}
