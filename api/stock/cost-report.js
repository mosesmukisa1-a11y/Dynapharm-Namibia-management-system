import { getBranchScope } from '../_lib/auth.js';
import { branchSearchTerms, normalizeBranchSlug } from '../_lib/branchUtils.js';
import { getStockCostProjection, getSalesCostReport } from '../services/stockCostReporting.js';

const COMPANY_REPORT_ROLES=new Set(['stock','finance','finance_manager','mis','gm','general_manager',
  'director','admin','superadmin','super_admin']);
const BRANCH_REPORT_ROLES=new Set(['branch','branch_manager','branch_staff','branch_sales',
  'dispenser','consultant','frontdesk','stock_manager']);

export default async function handler(req,res) {
  if (!req.user) return res.status(401).json({success:false,error:'Authentication required'});
  if (req.method!=='GET') return res.status(405).json({success:false,error:'Method not allowed'});
  const role=String(req.user.role || '').trim().toLowerCase();
  const branchScoped=BRANCH_REPORT_ROLES.has(role);
  if (!branchScoped && !COMPANY_REPORT_ROLES.has(role))
    return res.status(403).json({success:false,error:'Original-cost reporting access required'});
  try {
    const params=new URL(req.url,'http://internal').searchParams;
    // Map recognized branch-role aliases to an enforced scope; the general
    // scope helper deliberately treats unknown roles as unrestricted.
    const branch=params.get('branchId'),scope=getBranchScope(branchScoped ? {...req.user,role:'branch_manager'} : req.user);
    if (branchScoped && (!scope.enforced || !scope.branches?.length))
      return res.status(403).json({success:false,error:'An assigned branch is required'});
    const allowed=scope.enforced ? scope.branches.map(b=>normalizeBranchSlug(b) || b) : null;
    if (allowed && (!branch || !allowed.includes(normalizeBranchSlug(branch) || branch)))
      return res.status(403).json({success:false,error:'Select an authorized branch'});
    const aliases=branch ? branchSearchTerms(branch).map(b=>b.toLowerCase().trim()) : null;
    const stock=(await getStockCostProjection()).filter(r=>!aliases || aliases.includes(String(r.location).toLowerCase().trim()));
    const sales=await getSalesCostReport({aliases,from:params.get('from'),to:params.get('to')});
    return res.json({success:true,stock,sales,summary:{
      knownStockCost:stock.reduce((sum,r)=>sum+r.qty*(r.unitCIF ?? 0),0),
      missingStockCostQuantity:stock.reduce((sum,r)=>sum+r.missingCostQuantity,0),
      knownSalesCost:sales.reduce((sum,r)=>sum+r.knownCost,0),
      missingSalesCostQuantity:sales.reduce((sum,r)=>sum+r.missingCostQuantity,0),
      knownSalesRevenue:sales.reduce((sum,r)=>sum+(r.revenue ?? 0),0),
      missingSalesRevenueQuantity:sales.reduce((sum,r)=>sum+r.missingRevenueQuantity,0),
      grossProfit:sales.some(r=>r.grossProfit==null) ? null : sales.reduce((sum,r)=>sum+r.grossProfit,0),
    }});
  } catch (err) {
    return res.status(err.statusCode || 500).json({success:false,error:err.message});
  }
}
