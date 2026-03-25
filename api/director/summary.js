/**
 * GET /api/director/summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Executive summary for Director portal.
 */
import {
  getDateRange, getCompanyStockSummary, getAllBranchesSalesRevenue, getStockAlerts,
} from '../services/gmFinanceMisEngine.js';
import { getMany, getOne } from '../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);

  const [stock, salesRevenue, alerts, branchCount, distributorCount, productCount,
    clientRegs, distRegs] = await Promise.all([
    getCompanyStockSummary(),
    getAllBranchesSalesRevenue(start, end),
    getStockAlerts(90),
    getOne(`SELECT COUNT(*) as cnt FROM branches WHERE status = 'active'`),
    getOne(`SELECT COUNT(*) as cnt FROM distributors WHERE status = 'active' OR status IS NULL`),
    getOne(`SELECT COUNT(DISTINCT description) as cnt FROM product_prices`),
    getOne(`SELECT COUNT(*) as cnt FROM clients WHERE created_at >= $1::date AND created_at <= ($2 || 'T23:59:59')::timestamp`, [start, end]),
    getOne(`SELECT COUNT(*) as cnt FROM distributors WHERE created_at >= $1::date AND created_at <= ($2 || 'T23:59:59')::timestamp`, [start, end]),
  ]);

  const totalSalesRevenue = salesRevenue.totalSales;
  const totalOrders = await getOne(
    `SELECT COUNT(*) as cnt FROM branch_walkin_sales WHERE status='completed' AND sale_date >= $1::date AND sale_date <= ($2 || 'T23:59:59')::timestamp`,
    [start, end]
  );
  const walkinCount = Number(totalOrders?.cnt || 0);
  const avgOrderValue = walkinCount > 0 ? totalSalesRevenue / walkinCount : 0;

  // CIF cost of sales: sold/dispensed movements × unit_cif from product_prices
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
  let cifCostOfSales = 0;
  for (const r of cifRows) cifCostOfSales += Number(r.total_qty || 0) * Number(r.cif || 0);

  const grossProfit = totalSalesRevenue - cifCostOfSales;

  // Deposits (confirmed)
  const depositSum = await getOne(
    `SELECT COALESCE(SUM(amount),0) as total FROM branch_bank_deposits WHERE status='confirmed' AND date >= $1::date AND date <= $2::date`,
    [start, end]
  );
  const totalDeposits = Number(depositSum?.total || 0);
  const remittanceDue = Math.max(0, cifCostOfSales - totalDeposits);

  // Bonus payout from branch_expenses where category='bonus'
  const bonusRow = await getOne(
    `SELECT COALESCE(SUM(amount),0) as total FROM branch_expenses WHERE LOWER(category) LIKE '%bonus%' AND date >= $1::date AND date <= $2::date`,
    [start, end]
  );
  const bonusPayout = Number(bonusRow?.total || 0);

  const registrationsCountrywide = Number(clientRegs?.cnt || 0) + Number(distRegs?.cnt || 0);

  return res.json({
    success: true,
    period: { start, end },
    sales: {
      totalSalesRevenue,
      monthlyRevenue: totalSalesRevenue,
      totalSalesUnits: 0,
      totalOrders: walkinCount,
      walkinSalesCount: walkinCount,
      avgOrderValue,
    },
    stock: {
      totalCompanyStockQty: stock.totalQty,
      totalCompanyStockValueDP: stock.totalValueDP,
      totalWarehouseStockQty: stock.warehouseQty,
      totalBranchStockQty: stock.branchQty,
      totalInTransitQty: stock.inTransitQty,
      totalWriteOffQty: 0,
      totalWriteOffValueDP: 0,
      lowStockCount: alerts.lowStock.length,
      expiringCount: alerts.expiring.length,
    },
    finance: {
      cifCostOfSales,
      grossProfit,
      totalDeposits,
      remittanceDue,
      bonusPayout,
    },
    network: {
      activeBranches: Number(branchCount?.cnt || 0),
      totalDistributors: Number(distributorCount?.cnt || 0),
      productRange: Number(productCount?.cnt || 0),
      registrationsCountrywide,
    },
  });
}
