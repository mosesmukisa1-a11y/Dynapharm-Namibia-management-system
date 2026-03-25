/**
 * GET /api/director/profit-loss?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Director P&L overview.
 */
import { getDateRange, getAllBranchesSalesRevenue } from '../services/gmFinanceMisEngine.js';
import { getMany, getOne } from '../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);

  const [salesRevenue] = await Promise.all([getAllBranchesSalesRevenue(start, end)]);
  const totalRevenueDP = salesRevenue.totalSales;

  const cifRows = await getMany(
    `SELECT sm.product_name, SUM(sm.quantity) as total_qty, pp.cif
     FROM stock_movements sm
     LEFT JOIN product_prices pp ON sm.product_name = pp.description
     WHERE sm.status = 'posted'
       AND sm.movement_type IN ('walkin_sale','walkin_member_sale','walkin_non_member_sale',
         'walk_in_member_sale','walk_in_non_member_sale','sale','online_order_fulfilment','prescription_dispense')
       AND sm.created_at >= $1::date
       AND sm.created_at <= ($2 || 'T23:59:59')::timestamp
     GROUP BY sm.product_name, pp.cif`,
    [start, end]
  );
  let cifCost = 0;
  for (const r of cifRows) cifCost += Number(r.total_qty || 0) * Number(r.cif || 0);
  const grossProfit = totalRevenueDP - cifCost;

  const depositSum = await getOne(
    `SELECT COALESCE(SUM(amount),0) as total FROM branch_bank_deposits WHERE status='confirmed' AND date >= $1::date AND date <= $2::date`,
    [start, end]
  );
  const depositsReceived = Number(depositSum?.total || 0);
  const remittanceStatusAmount = Math.max(0, cifCost - depositsReceived);

  const bonusRow = await getOne(
    `SELECT COALESCE(SUM(amount),0) as total FROM branch_expenses WHERE LOWER(category) LIKE '%bonus%' AND date >= $1::date AND date <= $2::date`,
    [start, end]
  );
  const bonusPayout = Number(bonusRow?.total || 0);

  return res.json({
    success: true,
    period: { start, end },
    totalRevenueDP,
    cifCost,
    grossProfit,
    depositsReceived,
    remittanceStatusAmount,
    bonusPayout,
  });
}
