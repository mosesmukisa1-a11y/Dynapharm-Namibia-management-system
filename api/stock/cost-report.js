import { getBranchScope } from '../_lib/auth.js';
import { branchSearchTerms, normalizeBranchSlug } from '../_lib/branchUtils.js';
import { getStockCostProjection, getSalesCostPage } from '../services/stockCostReporting.js';
import { withTransaction } from '../db.js';
import {getStockCostAudit} from '../services/stockCostAudit.js';
import {getSalesReturnsSummary} from '../services/stockFinancialReports.js';
import {validateBusinessDates} from '../services/businessDates.js';
import {csvCell} from '../services/stockCostAudit.js';
import {getSlowMovingStock} from '../services/slowMovingStock.js';

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
    validateBusinessDates(params.get('from'),params.get('to'));
    // Map recognized branch-role aliases to an enforced scope; the general
    // scope helper deliberately treats unknown roles as unrestricted.
    const branch=params.get('branchId'),scope=getBranchScope(branchScoped ? {...req.user,role:'branch_manager'} : req.user);
    if (branchScoped && (!scope.enforced || !scope.branches?.length))
      return res.status(403).json({success:false,error:'An assigned branch is required'});
    const allowed=scope.enforced ? scope.branches.map(b=>normalizeBranchSlug(b) || b) : null;
    if (allowed && (!branch || !allowed.includes(normalizeBranchSlug(branch) || branch)))
      return res.status(403).json({success:false,error:'Select an authorized branch'});
    const aliases=branch ? branchSearchTerms(branch).map(b=>b.toLowerCase().trim()) : null;
    const audit=params.get('audit');
    if(audit && !['csv','json','financial_csv','financial_json'].includes(audit))
      return res.status(422).json({success:false,error:'Unsupported audit format'});
    const size=Number(params.get('pageSize') || 100),stockPage=Number(params.get('stockPage') || 1),salesPage=Number(params.get('salesPage') || 1);
    if(!Number.isSafeInteger(size)||size<1||size>500 ||
      ![stockPage,salesPage].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=1000000))
      return res.status(422).json({success:false,error:'Invalid report pagination'});
    const productName=params.get('productName') || null;
    const locations=aliases || (params.get('location') ? [params.get('location').toLowerCase().trim()] : null);
    const report=await withTransaction(async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const read=async(sql,values)=>(await client.query(sql,values)).rows;
    const financial=await getSalesReturnsSummary({aliases:locations,productName,from:params.get('from'),to:params.get('to')},read);
    if(audit?.startsWith('financial_')){
      const format=audit.slice('financial_'.length);
      return {success:true,filename:`sales-returns-reconciliation.${format}`,
        content:format==='json'?JSON.stringify(financial,null,2):
          'Measure,Value\r\n'+Object.entries(financial).map(([key,value])=>[key,value].map(csvCell).join(',')).join('\r\n'),
        mimeType:format==='csv'?'text/csv;charset=utf-8':'application/json',
        metadata:{financial,saleCount:Number(financial.grossSoldQuantity),sourceLayerCount:0}};
    }
    if(audit){
      const evidence=await getStockCostAudit({aliases:locations,productName,from:params.get('from'),to:params.get('to')},read);
      const filename=`stock-cost-audit-${evidence.generatedAt.slice(0,10)}.${audit}`;
      const {csv,...data}=evidence;
      return {success:true,filename,content:audit==='csv' ? csv : JSON.stringify(data,null,2),
         mimeType:audit==='csv' ? 'text/csv;charset=utf-8' : 'application/json',metadata:{...data,records:undefined,financial}};
    }
    const stock=(await getStockCostProjection({locations,productName,branchOnly:branchScoped},read)).filter(r=>!locations || locations.includes(String(r.location).toLowerCase().trim()));
    const slowMoving=await getSlowMovingStock(stock,{locations,productName,
      inactivityDays:Number(params.get('inactivityDays') || 90)},read);
    stock.sort((a,b)=>JSON.stringify([a.location,a.productName,a.batchNo,a.expiryDate,String(a.id)]).localeCompare(
      JSON.stringify([b.location,b.productName,b.batchNo,b.expiryDate,String(b.id)])));
    const result=await getSalesCostPage({aliases:locations,productName,from:params.get('from'),to:params.get('to'),
      limit:size,offset:(salesPage-1)*size},read);
    const meta=(total,page)=>({total,page,pageSize:size,pages:Math.ceil(total/size)});
    return {success:true,stock:stock.slice((stockPage-1)*size,stockPage*size),sales:result.rows,slowMoving,
      pagination:{stock:meta(stock.length,stockPage),sales:meta(result.total,salesPage)},summary:{
      knownStockCost:stock.reduce((sum,r)=>sum+r.qty*(r.unitCIF ?? 0),0),
      missingStockCostQuantity:stock.reduce((sum,r)=>sum+r.missingCostQuantity,0),
        ...result.summary,...financial,
     }};
    });
    return res.json(report);
  } catch (err) {
    return res.status(err.statusCode || 500).json({success:false,error:err.message});
  }
}
