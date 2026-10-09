import { getBranchScope } from '../_lib/auth.js';
import { branchSearchTerms, normalizeBranchSlug } from '../_lib/branchUtils.js';
import { getStockCostProjection, getSalesCostPage } from '../services/stockCostReporting.js';
import { withTransaction } from '../db.js';

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
    const size=Number(params.get('pageSize') || 100),stockPage=Number(params.get('stockPage') || 1),salesPage=Number(params.get('salesPage') || 1);
    if(!Number.isSafeInteger(size)||size<1||size>500 ||
      ![stockPage,salesPage].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=1000000))
      return res.status(422).json({success:false,error:'Invalid report pagination'});
    const productName=params.get('productName') || null;
    const locations=aliases || (params.get('location') ? [params.get('location').toLowerCase().trim()] : null);
    const report=await withTransaction(async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const read=async(sql,values)=>(await client.query(sql,values)).rows;
    const stock=(await getStockCostProjection({locations,productName},read)).filter(r=>!locations || locations.includes(String(r.location).toLowerCase().trim()));
    stock.sort((a,b)=>JSON.stringify([a.location,a.productName,a.batchNo,a.expiryDate,String(a.id)]).localeCompare(
      JSON.stringify([b.location,b.productName,b.batchNo,b.expiryDate,String(b.id)])));
    const result=await getSalesCostPage({aliases:locations,productName,from:params.get('from'),to:params.get('to'),
      limit:size,offset:(salesPage-1)*size},read);
    const meta=(total,page)=>({total,page,pageSize:size,pages:Math.ceil(total/size)});
    return {success:true,stock:stock.slice((stockPage-1)*size,stockPage*size),sales:result.rows,
      pagination:{stock:meta(stock.length,stockPage),sales:meta(result.total,salesPage)},summary:{
      knownStockCost:stock.reduce((sum,r)=>sum+r.qty*(r.unitCIF ?? 0),0),
      missingStockCostQuantity:stock.reduce((sum,r)=>sum+r.missingCostQuantity,0),
       ...result.summary,
     }};
    });
    return res.json(report);
  } catch (err) {
    return res.status(err.statusCode || 500).json({success:false,error:err.message});
  }
}
