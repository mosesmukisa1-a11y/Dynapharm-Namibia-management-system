import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js"; /**
 * GET /api/director/summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Executive summary for Director portal.
 */
import {
  getDateRange, getCompanyStockSummary, getAllBranchesSalesRevenue, getStockAlerts, getWriteOffs } from
'../services/gmFinanceMisEngine.js';
import { getMany, getOne } from '../db.js';
import { getSalesReturnsSummary } from '../services/stockFinancialReports.js';
import { COMPANY_REPORT_ROLES } from '../services/dailySales.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (!COMPANY_REPORT_ROLES.has(String(req.user.role).toLowerCase()))
  return res.status(403).json({ success: false, error: 'Company reporting access required' });

  const { start, end } = getDateRange(req.query);
  const originalEvidence = await getSalesReturnsSummary({ from: start, to: end });

  const [stock, salesRevenue, alerts, branchCount, distributorCount, productCount,
  clientRegs, distRegs, writeOffRows, salesUnitsRow] = await Promise.all([
  getCompanyStockSummary(),
  getAllBranchesSalesRevenue(start, end),
  getStockAlerts(), __qd_executePlan(
    getOne, __qd_registeredPlan("api/director/summary.js:26:0"), []), __qd_executePlan(
    getOne, __qd_registeredPlan("api/director/summary.js:27:1"), []), __qd_executePlan(
    getOne, __qd_registeredPlan("api/director/summary.js:28:2"), []), __qd_executePlan(
    getOne, __qd_registeredPlan("api/director/summary.js:29:3"), [start, end]), __qd_executePlan(
    getOne, __qd_registeredPlan("api/director/summary.js:30:4"), [start, end]),
  getWriteOffs(start, end), __qd_executePlan(
    getOne, __qd_registeredPlan("api/director/summary.js:33:5"),










    [start, end])]

  );

  const totalSalesUnits = Number(salesUnitsRow?.units || 0);
  const totalWriteOffQty = writeOffRows.reduce((s, r) => s + Number(r.qty || 0), 0);
  const totalWriteOffValueDP = writeOffRows.reduce((s, r) => s + Number(r.valueDP || 0), 0);

  const totalSalesRevenue = salesRevenue.totalSales;
  const totalOrders = await __qd_executePlan(getOne, __qd_registeredPlan("api/director/summary.js:53:6"),

  [start, end]);

  const walkinCount = Number(totalOrders?.cnt || 0);
  const avgOrderValue = walkinCount > 0 ? totalSalesRevenue / walkinCount : 0;

  // CIF cost of sales: use actual batch unit_cif from stock_movements, fallback to product_prices.cif
  const cifRow = await __qd_executePlan(getOne, __qd_registeredPlan("api/director/summary.js:61:7"),











  [start, end]);

  const cifCostOfSales = Number(cifRow?.cif_cost || 0);

  const grossProfit = totalSalesRevenue - cifCostOfSales;

  // Deposits (confirmed)
  const depositSum = await __qd_executePlan(getOne, __qd_registeredPlan("api/director/summary.js:80:8"),

  [start, end]);

  const totalDeposits = Number(depositSum?.total || 0);

  // Actual remittance payments already sent to supplier in the period
  const remittedSum = await __qd_executePlan(getOne, __qd_registeredPlan("api/director/summary.js:87:9"),

  [start, end]);

  const totalRemitted = Number(remittedSum?.total || 0);
  const remittanceDue = Math.max(0, cifCostOfSales - totalDeposits - totalRemitted);

  // Bonus payout from branch_expenses where category='bonus'
  const bonusRow = await __qd_executePlan(getOne, __qd_registeredPlan("api/director/summary.js:95:10"),

  [start, end]);

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
      avgOrderValue
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
      expiringCount: alerts.expiring.length
    },
    finance: {
      originalEvidence,
      estimateBasis: 'DP revenue minus movement CIF with current price-list fallback; not matched-original charged-revenue gross profit',
      estimatedCifCostOfSales: cifCostOfSales,
      estimatedDpMargin: grossProfit,
      cifCostOfSales,
      grossProfit,
      totalDeposits,
      totalRemitted,
      remittanceDue,
      bonusPayout,
      consultationFees: salesRevenue.consultationFees || 0
    },
    network: {
      activeBranches: Number(branchCount?.cnt || 0),
      totalDistributors: Number(distributorCount?.cnt || 0),
      productRange: Number(productCount?.cnt || 0),
      registrationsCountrywide
    }
  });
}
