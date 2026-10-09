/**
 * GET /api/director/summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Executive summary for Director portal.
 */
import {
  getDateRange, getCompanyStockSummary, getAllBranchesSalesRevenue, getStockAlerts, getWriteOffs,
} from '../services/gmFinanceMisEngine.js';
import { getMany, getOne } from '../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);

  const [stock, salesRevenue, alerts, branchCount, distributorCount, productCount,
    clientRegs, distRegs, writeOffRows, salesUnitsRow] = await Promise.all([
    getCompanyStockSummary(),
    getAllBranchesSalesRevenue(start, end),
    getStockAlerts(90),
    getOne(`SELECT COUNT(*) as cnt FROM branches WHERE status = 'active'`),
    getOne(`SELECT COUNT(*) as cnt FROM distributors WHERE status = 'active' OR status IS NULL`),
    getOne(`SELECT COUNT(DISTINCT description) as cnt FROM live_product_prices WHERE catalogue_entry`),
    getOne(`SELECT COUNT(*) as cnt FROM clients WHERE created_at >= $1::date AND created_at <= ($2 || 'T23:59:59')::timestamp`, [start, end]),
    getOne(`SELECT COUNT(*) as cnt FROM distributors WHERE created_at >= $1::date AND created_at <= ($2 || 'T23:59:59')::timestamp`, [start, end]),
    getWriteOffs(start, end),
    getOne(
      `SELECT COALESCE(SUM(sm.quantity), 0) as units
       FROM stock_movements sm
       WHERE sm.status = 'posted'
         AND sm.movement_type IN (
           'walk_in_member_sale','walk_in_non_member_sale','sale',
           'walkin_sale','walkin_member_sale','walkin_non_member_sale',
           'prescription_dispense','online_order_sale','online_order_fulfilment'
         )
         AND sm.created_at >= $1::date
         AND sm.created_at <= ($2 || 'T23:59:59')::timestamp`,
      [start, end]
    ),
  ]);

  const totalSalesUnits = Number(salesUnitsRow?.units || 0);
  const totalWriteOffQty = writeOffRows.reduce((s, r) => s + Number(r.qty || 0), 0);
  const totalWriteOffValueDP = writeOffRows.reduce((s, r) => s + Number(r.valueDP || 0), 0);

  const totalSalesRevenue = salesRevenue.totalSales;
  const totalOrders = await getOne(
    `SELECT COUNT(*) as cnt FROM branch_walkin_sales WHERE status='completed' AND sale_date >= $1::date AND sale_date <= ($2 || 'T23:59:59')::timestamp`,
    [start, end]
  );
  const walkinCount = Number(totalOrders?.cnt || 0);
  const avgOrderValue = walkinCount > 0 ? totalSalesRevenue / walkinCount : 0;

  // CIF cost of sales: use actual batch unit_cif from stock_movements, fallback to product_prices.cif
  const cifRow = await getOne(
    `SELECT COALESCE(SUM(sm.quantity * COALESCE(sm.unit_cif, pp.cif, 0)), 0) as cif_cost
     FROM stock_movements sm
     LEFT JOIN live_product_prices pp ON LOWER(TRIM(sm.product_name)) = LOWER(TRIM(pp.description))
     WHERE sm.status = 'posted'
       AND sm.movement_type IN (
         'walkin_sale','walkin_member_sale','walkin_non_member_sale',
         'walk_in_member_sale','walk_in_non_member_sale','sale',
         'online_order_fulfilment','online_order_sale','prescription_dispense'
       )
       AND sm.created_at >= $1::date
       AND sm.created_at <= ($2 || 'T23:59:59')::timestamp`,
    [start, end]
  );
  const cifCostOfSales = Number(cifRow?.cif_cost || 0);

  const grossProfit = totalSalesRevenue - cifCostOfSales;

  // Deposits (confirmed)
  const depositSum = await getOne(
    `SELECT COALESCE(SUM(amount),0) as total FROM branch_bank_deposits WHERE status IN ('confirmed','approved') AND date >= $1::date AND date <= $2::date`,
    [start, end]
  );
  const totalDeposits = Number(depositSum?.total || 0);

  // Actual remittance payments already sent to supplier in the period
  const remittedSum = await getOne(
    `SELECT COALESCE(SUM(amount),0) as total FROM finance_remittances WHERE status = 'completed' AND payment_date >= $1 AND payment_date <= $2`,
    [start, end]
  );
  const totalRemitted = Number(remittedSum?.total || 0);
  const remittanceDue = Math.max(0, cifCostOfSales - totalDeposits - totalRemitted);

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
      totalSalesUnits,
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
      totalWriteOffQty,
      totalWriteOffValueDP,
      lowStockCount: alerts.lowStock.length,
      expiringCount: alerts.expiring.length,
    },
    finance: {
      cifCostOfSales,
      grossProfit,
      totalDeposits,
      totalRemitted,
      remittanceDue,
      bonusPayout,
      consultationFees: salesRevenue.consultationFees || 0,
    },
    network: {
      activeBranches: Number(branchCount?.cnt || 0),
      totalDistributors: Number(distributorCount?.cnt || 0),
      productRange: Number(productCount?.cnt || 0),
      registrationsCountrywide,
    },
  });
}
