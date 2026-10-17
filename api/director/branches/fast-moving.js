import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js"; /**
 * GET /api/director/branches/fast-moving?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Branches ranked by sales units, revenue, and gross profit.
 */
import { getDateRange, getAllBranchLocations, normalizeBranchName } from '../../services/gmFinanceMisEngine.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);

  const [branchLocations, salesRows, cifRows] = await Promise.all([
  getAllBranchLocations(), __qd_executePlan(
    getMany, __qd_registeredPlan("api/director/branches/fast-moving.js:16:0"),





    [start, end]), __qd_executePlan(

    getMany, __qd_registeredPlan("api/director/branches/fast-moving.js:24:1"),











    [start, end])]

  );

  const branchNameMap = new Map(branchLocations.map((l) => [l.locationId, l.locationName]));
  const salesMap = new Map(salesRows.map((r) => [r.branch_id, Number(r.revenue)]));
  const cifMap = new Map(cifRows.map((r) => [r.branch_id, { units: Number(r.units_sold || 0), cif: Number(r.cif_cost || 0) }]));

  const allBranchIds = new Set([
  ...branchLocations.map((l) => l.locationId),
  ...salesRows.map((r) => r.branch_id),
  ...cifRows.map((r) => r.branch_id)]
  );

  const result = [...allBranchIds].map((branchId) => {
    const salesRevenue = salesMap.get(branchId) || 0;
    const stats = cifMap.get(branchId) || { units: 0, cif: 0 };
    const grossProfit = salesRevenue - stats.cif;
    return {
      branchId,
      branchName: branchNameMap.get(branchId) || normalizeBranchName(branchId),
      salesUnits: stats.units,
      salesRevenue,
      grossProfit
    };
  });

  result.sort((a, b) => b.salesRevenue - a.salesRevenue);

  return res.json({ success: true, period: { start, end }, branches: result });
}
