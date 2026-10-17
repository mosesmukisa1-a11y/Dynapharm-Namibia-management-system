import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js"; /**
 * GET /api/finance/income-statement?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Aggregates all operating-expense sources:
 *   • salary_ledger       — fixed monthly payroll (active employees)
 *   • branch_rent_payments — fixed monthly rent/lease
 *   • branch_expenses     — branch-level cash expenses in period
 *   • dept_expenses       — department / HQ expenses in period
 *   • petty_cash_transactions — petty-cash spend (type='expense') in period
 *
 * Returns pre-calculated totals so the frontend does no guessing.
 */
import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne } from '../db.js';

const ALLOWED_ROLES = new Set(['admin', 'finance', 'hr', 'gm', 'director']);

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (!ALLOWED_ROLES.has(req.user.role)) return res.status(403).json({ success: false, error: 'Access denied' });

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const startDate = url.searchParams.get('startDate') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const endDate = url.searchParams.get('endDate') || new Date().toISOString().slice(0, 10);

    // ── 1. Salary — current active payroll schedule (not period-filtered; it's a monthly fixed cost) ──
    const salaryRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/income-statement.js:32:0"), []);





    const monthlySalaryTotal = salaryRows.reduce((s, e) => s + Number(e.total_salary || 0), 0);
    const salaryCount = salaryRows.length;

    // ── 2. Rent — current active lease schedule (monthly fixed cost) ──
    const rentRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/income-statement.js:42:1"), []);





    const monthlyRentTotal = rentRows.reduce((s, r) => s + Number(r.total_payable || r.rent_amount || 0), 0);
    const rentCount = rentRows.length;

    // ── 3. Branch expenses in period ──
    const branchExpRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/income-statement.js:52:2"),





    [startDate, endDate]);

    const branchExpTotal = branchExpRows.reduce((s, e) => s + Number(e.amount || 0), 0);
    const branchExpByCategory = {};
    for (const e of branchExpRows) {
      const cat = e.category || 'Branch Expenses';
      branchExpByCategory[cat] = (branchExpByCategory[cat] || 0) + Number(e.amount || 0);
    }

    // ── 4. Department / HQ expenses in period ──
    const deptExpRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/income-statement.js:68:3"),





    [startDate, endDate]);

    const deptExpTotal = deptExpRows.reduce((s, e) => s + Number(e.amount || 0), 0);
    const deptExpByCategory = {};
    for (const e of deptExpRows) {
      const cat = e.category || e.department || 'Dept Expenses';
      deptExpByCategory[cat] = (deptExpByCategory[cat] || 0) + Number(e.amount || 0);
    }

    // ── 5. Petty cash spend in period ──
    const pettyRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/income-statement.js:84:4"),





    [startDate, endDate]);

    const pettyTotal = pettyRows.reduce((s, e) => s + Number(e.amount || 0), 0);
    const pettyByCategory = {};
    for (const e of pettyRows) {
      const cat = e.category || 'Petty Cash';
      pettyByCategory[cat] = (pettyByCategory[cat] || 0) + Number(e.amount || 0);
    }

    // ── 6. Bonus payouts from branch_expenses in period ──
    const bonusRow = await __qd_executePlan(getOne, __qd_registeredPlan("api/finance/income-statement.js:100:5"),




    [startDate, endDate]);

    const bonusPayout = Number(bonusRow?.total || 0);

    // ── 7. Payment Vouchers (Head Office expenses entered by Finance) ──
    // Exclude:
    //   supplier_remittance — procurement/COGS, not an operating expense
    //   rent               — already captured in branch_rent_payments (would double-count)
    const VOUCHER_LABEL_MAP = {
      cash_request: 'HQ Cash Request Payout',
      salary: 'HQ Salary / Wage Payment',
      bonus: 'HQ Bonus Payout',
      expense_reimbursement: 'HQ Expense Reimbursement',
      ad_hoc: 'HQ Ad-Hoc Payment'
    };
    const voucherRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/income-statement.js:120:6"),








    [startDate, endDate]);

    const voucherByCategory = {};
    let voucherTotal = 0;
    for (const row of voucherRows) {
      const label = VOUCHER_LABEL_MAP[row.payment_type] || `HQ: ${row.payment_type}`;
      voucherByCategory[label] = (voucherByCategory[label] || 0) + Number(row.total || 0);
      voucherTotal += Number(row.total || 0);
    }

    // Merge misc category maps (branch + dept + petty + vouchers)
    const expByCategory = { ...branchExpByCategory };
    for (const [cat, val] of Object.entries(deptExpByCategory)) {
      expByCategory[cat] = (expByCategory[cat] || 0) + val;
    }
    for (const [cat, val] of Object.entries(pettyByCategory)) {
      expByCategory[cat] = (expByCategory[cat] || 0) + val;
    }
    for (const [cat, val] of Object.entries(voucherByCategory)) {
      expByCategory[cat] = (expByCategory[cat] || 0) + val;
    }
    const miscTotal = branchExpTotal + deptExpTotal + pettyTotal + voucherTotal;

    res.json({
      success: true,
      period: { start: startDate, end: endDate },
      salary: {
        monthly_total: monthlySalaryTotal,
        count: salaryCount
      },
      rent: {
        monthly_total: monthlyRentTotal,
        count: rentCount
      },
      misc_expenses: {
        total: miscTotal,
        by_category: expByCategory
      },
      bonus_payout: bonusPayout
    });
  } catch (err) {
    console.error('[finance/income-statement]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
