import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import {
  getDateRange,
  getCompanyStockSummary,
  getAllBranchesSalesRevenue } from
'../services/gmFinanceMisEngine.js';
import { getOne } from '../db.js';
import { getSalesReturnsSummary } from '../services/stockFinancialReports.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (!['gm', 'general_manager', 'director', 'admin', 'superadmin', 'super_admin', 'finance', 'finance_manager', 'mis', 'stock'].includes(String(req.user.role).toLowerCase()))
  return res.status(403).json({ success: false, error: 'Company reporting access required' });

  try {
    const { start, end } = getDateRange(req.query);

    const [companyStock, sales, financial] = await Promise.all([
    getCompanyStockSummary(),
    getAllBranchesSalesRevenue(start, end),
    getSalesReturnsSummary({ from: start, to: end })]
    );

    // Consultation fees: BAT rows for non-dispensing paid activities (walk-in and member check-ups).
    // Excludes prescription_dispensing (already counted in prescriptionSales).
    const consultRow = await __qd_executePlan(getOne, __qd_registeredPlan("api/gm/summary.js:30:0"),







    [start, end]);

    const consultationFees = Number(consultRow?.total || 0);

    // Actual paid revenue and returned original CIF are a different basis
    // from DP dashboard totals. Never substitute today's catalogue CIF.
    const cifCostOfSales = Number(financial.netCostOfGoodsSold);
    const grossProfit = financial.grossProfitAfterReturns == null ? null : Number(financial.grossProfitAfterReturns);

    // Verified bank deposits in the period (status='approved' is set by Finance verifyDeposit)
    const depositRow = await __qd_executePlan(getOne, __qd_registeredPlan("api/gm/summary.js:48:1"),


    [start, end]);

    const totalDeposits = Number(depositRow?.total || 0);

    // Actual remittance payments already sent to supplier in the period
    const remittedRow = await __qd_executePlan(getOne, __qd_registeredPlan("api/gm/summary.js:56:2"),

    [start, end]);

    const totalRemitted = Number(remittedRow?.total || 0);
    const remittanceDue = Math.max(0, cifCostOfSales - totalDeposits - totalRemitted);

    // Total walkin transaction count
    const txnRow = await __qd_executePlan(getOne, __qd_registeredPlan("api/gm/summary.js:64:3"),


    [start, end]);

    const totalTransactions = Number(txnRow?.cnt || 0);

    // Total BV points from walkin sale items
    const bvRow = await __qd_executePlan(getOne, __qd_registeredPlan("api/gm/summary.js:72:4"),






    [start, end]);

    const totalBV = Number(bvRow?.total_bv || 0);

    // Active branch count
    const branchRow = await __qd_executePlan(getOne, __qd_registeredPlan("api/gm/summary.js:83:5"), []);
    const activeBranches = Number(branchRow?.cnt || 0);

    // Product range count
    const productRow = await __qd_executePlan(getOne, __qd_registeredPlan("api/gm/summary.js:87:6"), []);
    const productCount = Number(productRow?.cnt || 0);

    res.json({
      success: true,
      period: { start, end },
      companyStock: {
        totalQty: companyStock.totalQty,
        totalValueDP: companyStock.totalValueDP,
        countryQty: companyStock.countryQty,
        warehouseQty: companyStock.warehouseQty,
        branchQty: companyStock.branchQty,
        inTransitQty: companyStock.inTransitQty,
        lowStockCount: companyStock.lowStockCount,
        expiringCount: companyStock.expiringCount
      },
      sales: {
        ...sales,
        consultationFees,
        walkinSales: sales.walkinSales,
        memberSales: sales.memberSales,
        nonMemberSales: sales.nonMemberSales,
        onlineSales: sales.onlineSales,
        prescriptionSales: sales.prescriptionSales,
        totalSales: sales.totalSales,
        totalTransactions,
        totalBV
      },
      finance: {
        ...financial,
        cifCostOfSales,
        grossProfit,
        totalDeposits,
        totalRemitted,
        remittanceDue
      },
      network: {
        activeBranches,
        productCount
      }
    });
  } catch (err) {
    console.error('[gm/summary]', err);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
}
