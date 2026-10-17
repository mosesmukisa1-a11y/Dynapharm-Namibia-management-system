import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";import { getMany } from '../db.js';
import { salesEvidenceSql } from './stockCostReporting.js';
import { validateBusinessDates } from './businessDates.js';

// Keep inventory losses separate from COGS and gross profit. Never substitute
// today's catalogue cost for a write-off's frozen received cost.
export async function getWriteOffExpenseSummary({ aliases, from, to, productName } = {}, read = getMany) {
  validateBusinessDates(from, to);
  const [row] = await __qd_executePlan(read, __qd_registeredPlan("api/services/stockFinancialReports.js:9:0"),










  [aliases || null, from || null, to || null, productName || null]);
  return { ...row, writeOffCostComplete: Number(row.missingWriteOffCostQuantity) === 0,
    writeOffBasis: 'Separate inventory expense at frozen original cost; movement posting date; unknown costs excluded and disclosed' };
}

// DP is distributor selling price, NOT received CIF cost or consumer receipts.
// Preserve NUMERIC totals as strings in downloadable financial reconciliation.
export async function getSalesReturnsSummary({ aliases, from, to, productName } = {}, read = getMany) {
  validateBusinessDates(from, to);
  const [result] = await __qd_executePlan(read, __qd_registeredPlan("api/services/stockFinancialReports.js:29:1"),


























































  [aliases?.map((v) => String(v).toLowerCase().trim()) || null, from || null, to || null, productName || null]);
  const unmatched = Number(result.unmatchedSaleRecords) > 0;
  return { ...result, grossProfitAfterReturns: unmatched ? null : result.grossProfitAfterReturns,
    revenueBasis: 'Matched original amounts charged; approved refunds recognised on approval date; unmatched receipts disclosed separately',
    dpDefinition: 'DP = distributor selling price after the original recorded discount; separate from customer receipts and received CIF cost',
    timezone: 'Africa/Windhoek', financialComplete: !unmatched && Number(result.missingFinancialCostQuantity) === 0 &&
    Number(result.missingFinancialRevenueQuantity) === 0,
    dpComplete: Number(result.missingFinancialDPQuantity) === 0 };
}

export async function getLegacyDPRevenue(aliases, start, end, read = getMany) {
  validateBusinessDates(start, end);
  const params = [aliases?.map((v) => String(v).toLowerCase().trim()) || null, start || null, end || null];
  const [sales, refunds, rx] = await Promise.all([__qd_executePlan(
    read, __qd_registeredPlan("api/services/stockFinancialReports.js:102:2"),






    params), __qd_executePlan(
    read, __qd_registeredPlan("api/services/stockFinancialReports.js:110:3"),





    params), __qd_executePlan(
    read, __qd_registeredPlan("api/services/stockFinancialReports.js:117:4"),


    params)]
  );
  const out = { walkinSales: 0, memberSales: 0, nonMemberSales: 0, onlineSales: 0, prescriptionSales: 0,
    cashTotal: 0, swipeTotal: 0, eftTotal: 0, grossWalkinSalesDP: 0, refundsDP: 0,
    grossCustomerReceipts: 0, customerRefunds: 0, missingDPRecords: 0, revenueBasis: 'Distributor price (DP); frozen original evidence' };
  const category = (ct) => String(ct || '').toLowerCase().includes('online') ? 'onlineSales' :
  String(ct || '').toLowerCase().includes('member') && !String(ct).toLowerCase().includes('non') ? 'memberSales' : 'nonMemberSales';
  const discountFactor = (data) => {
    try {if (typeof data === 'string') data = JSON.parse(data);} catch {return NaN;}
    const percent = Number(data?.discount_pct || 0);
    return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? 1 - percent / 100 : NaN;
  };
  for (const sale of sales) {
    let dp = sale.dp == null ? null : Number(sale.dp);
    // New commercial snapshots already include the recorded discount. Never
    // replace them with receipt cash or apply the campaign discount twice.
    if (dp == null && Number(sale.missing_dp || 0) === 0) {
      let items = sale.items;
      try {if (typeof items === 'string') items = JSON.parse(items);} catch {items = null;}
      let data = sale.data;
      try {if (typeof data === 'string') data = JSON.parse(data);} catch {data = null;}
      if (Array.isArray(items) && items.length && items.every((i) => (i.dpPrice ?? i.dp) != null && (i.quantity ?? i.qty) != null))
      dp = items.reduce((n, i) => n + Number(i.dpPrice ?? i.dp) * Number(i.quantity ?? i.qty), 0) *
      discountFactor(data);
    }
    out.grossCustomerReceipts += Number(sale.total || 0);
    if (dp == null || !Number.isFinite(dp)) {out.missingDPRecords++;continue;}
    out.walkinSales += dp;out[category(sale.customer_type)] += dp;out.grossWalkinSalesDP += dp;
    const key = { cash: 'cashTotal', card: 'swipeTotal', swipe: 'swipeTotal', eft: 'eftTotal' }[sale.payment_method];
    if (key) out[key] += dp;
  }
  for (const refund of refunds) {
    out.customerRefunds += Number(refund.refund_amount || 0);
    const unit = refund.snapshot?.financial_dp_unit;
    // A reversal carries the original NET commercial DP. Cash refunded is a
    // separate basis; neither customer type nor campaign metadata reprices it.
    const dp = unit != null ? Number(unit) * Number(refund.quantity) : null;
    if (dp == null || !Number.isFinite(dp)) {out.missingDPRecords++;continue;}
    out.refundsDP += dp;
    if (refund.original_type === 'prescription_dispense') out.prescriptionSales -= dp;else
    {out.walkinSales -= dp;out[category(refund.customer_type || refund.original_type)] -= dp;}
  }
  for (const row of rx) {if (row.product_total_dp == null) out.missingDPRecords++;else out.prescriptionSales += Number(row.product_total_dp);}
  return { ...out, totalSales: out.walkinSales + out.prescriptionSales,
    netCustomerReceipts: out.grossCustomerReceipts - out.customerRefunds,
    dpComplete: out.missingDPRecords === 0, paymentTotalsBasis: 'Gross walk-in DP, before refunds' };
}
