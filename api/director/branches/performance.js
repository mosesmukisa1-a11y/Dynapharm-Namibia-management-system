/**
 * GET /api/director/branches/performance?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Full branch performance with CIF, profit, expenses, registrations.
 */
import {
  getDateRange, getAllBranchLocations, getLocationStockSummary,
  getBranchSalesRevenue, normalizeBranchName,
} from '../../services/gmFinanceMisEngine.js';
import { getMany, getOne } from '../../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);

  const [branchLocations, allBranchSales, refundRows] = await Promise.all([
    getAllBranchLocations(),
    getMany(
      `SELECT branch_id, COALESCE(SUM(total),0) as revenue, COUNT(*) as txns
       FROM branch_walkin_sales
       WHERE status='completed'
         AND sale_date >= $1::date AND sale_date <= ($2 || 'T23:59:59')::timestamp
       GROUP BY branch_id`,
      [start, end]
    ),
    getMany(
      `SELECT branch_id, COALESCE(SUM(refund_amount), 0) AS refund_total
       FROM branch_refund_requests
       WHERE status = 'approved'
         AND processed_at::date >= $1::date
         AND processed_at::date <= $2::date
       GROUP BY branch_id`,
      [start, end]
    ),
  ]);

  // Refund deduction map (keyed by normalised branch_id)
  const refundMap = new Map(refundRows.map(r => [
    (r.branch_id || '').toLowerCase().replace(/ /g, '_'),
    Number(r.refund_total || 0),
  ]));

  const salesByBranch = new Map(
    allBranchSales.map(r => {
      const refund = refundMap.get((r.branch_id || '').toLowerCase().replace(/ /g, '_')) || 0;
      return [r.branch_id, {
        revenue: Math.max(0, Number(r.revenue) - refund),
        txns: Number(r.txns),
      }];
    })
  );

  // Total company revenue for contribution %
  const totalRevenue = [...salesByBranch.values()].reduce((s, b) => s + b.revenue, 0);

  // CIF cost per branch from stock_movements
  const cifRows = await getMany(
    `SELECT sm.source_location as branch_id,
            SUM(sm.quantity * COALESCE(sm.unit_cif, pp.cif, 0)) as cif_cost,
            SUM(sm.quantity) as sales_units
     FROM stock_movements sm
     LEFT JOIN product_prices pp
       ON LOWER(TRIM(sm.product_name)) = LOWER(TRIM(pp.description))
     WHERE sm.status = 'posted'
       AND sm.movement_type IN ('walkin_sale','walkin_member_sale','walkin_non_member_sale',
         'walk_in_member_sale','walk_in_non_member_sale','sale','prescription_dispense')
       AND sm.created_at >= $1::date
       AND sm.created_at <= ($2 || 'T23:59:59')::timestamp
     GROUP BY sm.source_location`,
    [start, end]
  );
  const cifByBranch = new Map(cifRows.map(r => [r.branch_id, {
    cifCost:    Number(r.cif_cost    || 0),
    salesUnits: Number(r.sales_units || 0),
  }]));

  // Expenses per branch
  const expRows = await getMany(
    `SELECT branch_id,
       COALESCE(SUM(CASE WHEN LOWER(category) LIKE '%rent%' THEN amount ELSE 0 END), 0) as rent,
       COALESCE(SUM(CASE WHEN LOWER(category) NOT LIKE '%rent%' AND LOWER(category) NOT LIKE '%bonus%' THEN amount ELSE 0 END), 0) as overheads,
       COALESCE(SUM(CASE WHEN LOWER(category) LIKE '%bonus%' THEN amount ELSE 0 END), 0) as bonus
     FROM branch_expenses
     WHERE date >= $1::date AND date <= $2::date
     GROUP BY branch_id`,
    [start, end]
  );
  const expByBranch = new Map(expRows.map(r => [r.branch_id, {
    rent: Number(r.rent), overheads: Number(r.overheads), bonus: Number(r.bonus),
  }]));

  // Registrations per branch
  const [clientRegs, distRegs] = await Promise.all([
    getMany(
      `SELECT COALESCE(branch,'unassigned') as branch_id, COUNT(*) as cnt FROM clients WHERE created_at >= $1::date AND created_at <= ($2 || 'T23:59:59')::timestamp GROUP BY branch`,
      [start, end]
    ),
    getMany(
      `SELECT COALESCE(branch,'unassigned') as branch_id, COUNT(*) as cnt FROM distributors WHERE created_at >= $1::date AND created_at <= ($2 || 'T23:59:59')::timestamp GROUP BY branch`,
      [start, end]
    ),
  ]);
  const regByBranch = new Map();
  for (const r of [...clientRegs, ...distRegs]) {
    regByBranch.set(r.branch_id, (regByBranch.get(r.branch_id) || 0) + Number(r.cnt));
  }

  const result = branchLocations.map(loc => {
    const sales = salesByBranch.get(loc.locationId) || { revenue: 0, txns: 0 };
    const salesRevenue = sales.revenue;
    const transactions = sales.txns;
    const cifEntry = cifByBranch.get(loc.locationId) || { cifCost: 0, salesUnits: 0 };
    const cifCost = cifEntry.cifCost;
    const salesUnits = cifEntry.salesUnits;
    const grossProfit = salesRevenue - cifCost;
    const exp = expByBranch.get(loc.locationId) || { rent: 0, overheads: 0, bonus: 0 };
    const netContributionAfterExpenses = grossProfit - exp.rent - exp.overheads - exp.bonus;
    const revenueContributionPercent = totalRevenue > 0
      ? Number(((salesRevenue / totalRevenue) * 100).toFixed(2))
      : 0;

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
      netContributionAfterExpenses,
    };
  });

  result.sort((a, b) => b.salesRevenue - a.salesRevenue);

  return res.json({ success: true, period: { start, end }, branches: result });
}
