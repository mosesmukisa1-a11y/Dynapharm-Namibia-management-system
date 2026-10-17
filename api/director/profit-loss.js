import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js"; /**
 * GET /api/director/profit-loss?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Director P&L overview — revenue, CIF cost, gross profit, and operating expenses.
 */
import { getDateRange, getAllBranchesSalesRevenue } from '../services/gmFinanceMisEngine.js';
import { getMany, getOne } from '../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);

  const [salesRevenue, cifRow, depositSum, bonusRow, salaryRow, rentRow, miscRow] = await Promise.all([
  getAllBranchesSalesRevenue(start, end),

  // CIF cost of sales from posted stock movements
  __qd_executePlan(getOne, __qd_registeredPlan("api/director/profit-loss.js:18:0"),









  [start, end]),


  // Deposits verified (approved) in this period
  __qd_executePlan(getOne, __qd_registeredPlan("api/director/profit-loss.js:32:1"),



  [start, end]),


  // Bonus payouts
  __qd_executePlan(getOne, __qd_registeredPlan("api/director/profit-loss.js:40:2"),



  [start, end]),


  // Salary expense from salary_ledger (sum of active employee total salaries = monthly payroll)
  __qd_executePlan(getOne, __qd_registeredPlan("api/director/profit-loss.js:48:3"), []),





  // Rent expense from branch_rent_payments — static monthly lease obligations per branch
  __qd_executePlan(getOne, __qd_registeredPlan("api/director/profit-loss.js:55:4"), []),




  // Misc branch operating expenses (excluding rent and bonus)
  __qd_executePlan(getOne, __qd_registeredPlan("api/director/profit-loss.js:61:5"),





  [start, end])]

  );

  const totalRevenueDP = salesRevenue.totalSales;
  const cifCost = Number(cifRow?.cif_cost || 0);
  const grossProfit = totalRevenueDP - cifCost;
  const depositsReceived = Number(depositSum?.total || 0);
  const remittanceStatusAmount = Math.max(0, cifCost - depositsReceived);
  const bonusPayout = Number(bonusRow?.total || 0);
  const salaryExpense = Number(salaryRow?.monthly_total || 0);
  const rentExpense = Number(rentRow?.total || 0);
  const miscExpense = Number(miscRow?.total || 0);
  const totalOperatingExpenses = salaryExpense + rentExpense + bonusPayout + miscExpense;
  const netProfit = grossProfit - totalOperatingExpenses;

  return res.json({
    success: true,
    period: { start, end },
    totalRevenueDP,
    cifCost,
    grossProfit,
    depositsReceived,
    remittanceStatusAmount,
    bonusPayout,
    expenses: {
      salary: salaryExpense,
      rent: rentExpense,
      bonus: bonusPayout,
      misc: miscExpense,
      total: totalOperatingExpenses
    },
    netProfit
  });
}
