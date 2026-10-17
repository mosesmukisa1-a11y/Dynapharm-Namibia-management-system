import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js"; /**
 * GET /api/director/branches/performance?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Full branch performance with CIF, profit, expenses, registrations.
 */
import {
  getDateRange, getAllBranchLocations, getLocationStockSummary,
  getBranchSalesRevenue, normalizeBranchName } from
'../../services/gmFinanceMisEngine.js';
import { getMany, getOne } from '../../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);

  const [branchLocations, allBranchSales, refundRows] = await Promise.all([
  getAllBranchLocations(), __qd_executePlan(
    getMany, __qd_registeredPlan("api/director/branches/performance.js:19:0"),





    [start, end]), __qd_executePlan(

    getMany, __qd_registeredPlan("api/director/branches/performance.js:27:1"),






    [start, end])]

  );

  // Refund deduction map (keyed by normalised branch_id)
  const refundMap = new Map(refundRows.map((r) => [
  (r.branch_id || '').toLowerCase().replace(/ /g, '_'),
  Number(r.refund_total || 0)]
  ));

  const salesByBranch = new Map(
    allBranchSales.map((r) => {
      const refund = refundMap.get((r.branch_id || '').toLowerCase().replace(/ /g, '_')) || 0;
      return [r.branch_id, {
        revenue: Math.max(0, Number(r.revenue) - refund),
        txns: Number(r.txns)
      }];
    })
  );

  // Total company revenue for contribution %
  const totalRevenue = [...salesByBranch.values()].reduce((s, b) => s + b.revenue, 0);

  // CIF cost per branch from stock_movements
  const cifRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/director/branches/performance.js:58:2"),












  [start, end]);

  const cifByBranch = new Map(cifRows.map((r) => [r.branch_id, {
    cifCost: Number(r.cif_cost || 0),
    salesUnits: Number(r.sales_units || 0)
  }]));

  // Expenses per branch
  const expRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/director/branches/performance.js:79:3"),







  [start, end]);

  const expByBranch = new Map(expRows.map((r) => [r.branch_id, {
    rent: Number(r.rent), overheads: Number(r.overheads), bonus: Number(r.bonus)
  }]));

  // Registrations per branch
  const [clientRegs, distRegs] = await Promise.all([__qd_executePlan(
    getMany, __qd_registeredPlan("api/director/branches/performance.js:95:4"),

    [start, end]), __qd_executePlan(

    getMany, __qd_registeredPlan("api/director/branches/performance.js:99:5"),

    [start, end])]

  );
  const regByBranch = new Map();
  for (const r of [...clientRegs, ...distRegs]) {
    regByBranch.set(r.branch_id, (regByBranch.get(r.branch_id) || 0) + Number(r.cnt));
  }

  const result = branchLocations.map((loc) => {
    const sales = salesByBranch.get(loc.locationId) || { revenue: 0, txns: 0 };
    const salesRevenue = sales.revenue;
    const transactions = sales.txns;
    const cifEntry = cifByBranch.get(loc.locationId) || { cifCost: 0, salesUnits: 0 };
    const cifCost = cifEntry.cifCost;
    const salesUnits = cifEntry.salesUnits;
    const grossProfit = salesRevenue - cifCost;
    const exp = expByBranch.get(loc.locationId) || { rent: 0, overheads: 0, bonus: 0 };
    const netContributionAfterExpenses = grossProfit - exp.rent - exp.overheads - exp.bonus;
    const revenueContributionPercent = totalRevenue > 0 ?
    Number((salesRevenue / totalRevenue * 100).toFixed(2)) :
    0;

    return {
      branchId: loc.locationId,
      branchName: loc.locationName,
      salesRevenue,
      salesUnits,
      cifCost,
      grossProfit,
      transactions,
      revenueContributionPercent,
      registrationsCount: regByBranch.get(loc.locationId) || 0,
      rentExpense: exp.rent,
      monthlyOverheads: exp.overheads,
      bonusPayout: exp.bonus,
      netContributionAfterExpenses
    };
  });

  result.sort((a, b) => b.salesRevenue - a.salesRevenue);

  return res.json({ success: true, period: { start, end }, branches: result });
}
