/**
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
    getOne(
      `SELECT COALESCE(SUM(sm.quantity * COALESCE(sm.unit_cif, pp.cif, 0)), 0) AS cif_cost
       FROM stock_movements sm
       LEFT JOIN product_prices pp
         ON LOWER(TRIM(sm.product_name)) = LOWER(TRIM(pp.description))
       WHERE sm.status = 'posted'
         AND sm.movement_type IN ('walkin_sale','walkin_member_sale','walkin_non_member_sale',
           'walk_in_member_sale','walk_in_non_member_sale','sale','online_order_fulfilment','prescription_dispense')
         AND sm.created_at >= $1::date
         AND sm.created_at <= ($2 || 'T23:59:59')::timestamp`,
      [start, end]
    ),

    // Deposits confirmed in this period
    getOne(
      `SELECT COALESCE(SUM(amount),0) as total
       FROM branch_bank_deposits
       WHERE status='confirmed' AND date >= $1::date AND date <= $2::date`,
      [start, end]
    ),

    // Bonus payouts
    getOne(
      `SELECT COALESCE(SUM(amount),0) as total
       FROM branch_expenses
       WHERE LOWER(category) LIKE '%bonus%' AND date >= $1::date AND date <= $2::date`,
      [start, end]
    ),

    // Salary expense from salary_ledger (sum of active employee total salaries = monthly payroll)
    getOne(
      `SELECT COALESCE(SUM(total_salary), 0) AS monthly_total
       FROM salary_ledger
       WHERE status = 'active' OR status IS NULL`
    ),

    // Rent expense from branch_rent_payments — static monthly lease obligations per branch
    getOne(
      `SELECT COALESCE(SUM(rent_amount), 0) AS total
       FROM branch_rent_payments`
    ),

    // Misc branch operating expenses (excluding rent and bonus)
    getOne(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM branch_expenses
       WHERE LOWER(category) NOT LIKE '%rent%'
         AND LOWER(category) NOT LIKE '%bonus%'
         AND date >= $1::date AND date <= $2::date`,
      [start, end]
    ),
  ]);

  const totalRevenueDP    = salesRevenue.totalSales;
  const cifCost           = Number(cifRow?.cif_cost || 0);
  const grossProfit       = totalRevenueDP - cifCost;
  const depositsReceived  = Number(depositSum?.total || 0);
  const remittanceStatusAmount = Math.max(0, cifCost - depositsReceived);
  const bonusPayout       = Number(bonusRow?.total || 0);
  const salaryExpense     = Number(salaryRow?.monthly_total || 0);
  const rentExpense       = Number(rentRow?.total || 0);
  const miscExpense       = Number(miscRow?.total || 0);
  const totalOperatingExpenses = salaryExpense + rentExpense + bonusPayout + miscExpense;
  const netProfit         = grossProfit - totalOperatingExpenses;

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
      salary:  salaryExpense,
      rent:    rentExpense,
      bonus:   bonusPayout,
      misc:    miscExpense,
      total:   totalOperatingExpenses,
    },
    netProfit,
  });
}
