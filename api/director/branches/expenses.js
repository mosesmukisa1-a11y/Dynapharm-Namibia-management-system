import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js"; /**
 * GET /api/director/branches/expenses?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Rent, overheads, and bonus per branch.
 */
import { getDateRange, getAllBranchLocations, normalizeBranchName } from '../../services/gmFinanceMisEngine.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);

  const [branchLocations, expRows] = await Promise.all([
  getAllBranchLocations(), __qd_executePlan(
    getMany, __qd_registeredPlan("api/director/branches/expenses.js:16:0"),







    [start, end])]

  );

  const expMap = new Map(expRows.map((r) => [r.branch_id, {
    rent: Number(r.rent), overheads: Number(r.overheads), bonus: Number(r.bonus)
  }]));

  const branchNameMap = new Map(branchLocations.map((l) => [l.locationId, l.locationName]));

  const allBranchIds = new Set([
  ...branchLocations.map((l) => l.locationId),
  ...expRows.map((r) => r.branch_id)]
  );

  const result = [...allBranchIds].map((branchId) => {
    const exp = expMap.get(branchId) || { rent: 0, overheads: 0, bonus: 0 };
    return {
      branchId,
      branchName: branchNameMap.get(branchId) || normalizeBranchName(branchId),
      rentExpense: exp.rent,
      monthlyOverheads: exp.overheads,
      bonusPayout: exp.bonus
    };
  });

  result.sort((a, b) => a.branchName.localeCompare(b.branchName));

  return res.json({ success: true, period: { start, end }, branches: result });
}
