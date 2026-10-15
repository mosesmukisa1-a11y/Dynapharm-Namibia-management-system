// Never divide original charged-revenue profit by DP revenue or catalogue estimates.
export function originalChargedMargin(finance) {
  if(finance?.financialComplete!==true || finance.grossProfitAfterReturns==null || finance.netSalesRevenue==null)return null;
  const profit=Number(finance.grossProfitAfterReturns),revenue=Number(finance.netSalesRevenue);
  return Number.isFinite(profit)&&Number.isFinite(revenue)&&revenue>0 ? profit/revenue*100 : null;
}
