import { normalizeBranchName } from '../services/gmFinanceMisEngine.js';
import { getStockCostProjection } from '../services/stockCostReporting.js';
import { inferLocationType } from '../services/stockEngine.js';
import { getBranchScope } from '../_lib/auth.js';
import { branchSearchTerms, normalizeBranchSlug } from '../_lib/branchUtils.js';

export default async function handler(req,res) {
  if (!req.user) return res.status(401).json({success:false,error:'Authentication required'});
  if (req.method!=='GET') return res.status(405).json({success:false,error:'Method not allowed'});
  const readers=['admin','super_admin','superadmin','gm','general_manager','director','finance','finance_manager',
    'mis','stock','stock_manager','warehouse','warehouse_manager','branch','branch_manager','branch_staff'];
  if(!readers.includes(String(req.user.role || '').toLowerCase()))
    return res.status(403).json({success:false,error:'Staff stock evidence access required'});
  const scope=getBranchScope(req.user);
  const params=new URL(req.url,'http://local').searchParams;
  const requested=params.get('branch') || params.get('location');
  if(scope.enforced && requested && !scope.branches.some(branch=>normalizeBranchSlug(branch)===normalizeBranchSlug(requested)))
    return res.status(403).json({success:false,error:'Access denied'});
  try {
    const rows=(await getStockCostProjection(scope.enforced ?
      {locations:(requested ? [requested] : scope.branches).flatMap(branchSearchTerms),branchOnly:true}
      : requested ? {locations:branchSearchTerms(requested)} : {})).map(row=>({...row,
      locationType:inferLocationType(row.location),locationId:row.location,
      locationName:normalizeBranchName(row.location) || row.location}));
    const summarize=list=>({
      totalQty:list.reduce((sum,r)=>sum+r.qty,0),
      totalValueCIF:Number(list.reduce((sum,r)=>sum+r.qty*(r.unitCIF ?? 0),0).toFixed(2)),
      totalValueDPC:Number(list.reduce((sum,r)=>sum+r.qty*(r.unitDPC ?? 0),0).toFixed(2)),
      missingCostQuantity:list.reduce((sum,r)=>sum+r.missingCostQuantity,0),
      missingDPCQuantity:list.reduce((sum,r)=>sum+r.missingDPCQuantity,0),
      valuationComplete:list.every(r=>!r.missingCostQuantity && !r.missingDPCQuantity),
    });
    const groups=key=> {
      const map=new Map();
      for (const row of rows) { const k=key(row);if (!map.has(k)) map.set(k,[]);map.get(k).push(row); }
      return [...map.values()];
    };
    return res.json({success:true,summary:summarize(rows),rows,
      locations:groups(r=>r.locationId).map(list=>({locationType:list[0].locationType,locationName:list[0].locationName,...summarize(list)})),
      products:groups(r=>r.productName.toLowerCase().trim()).map(list=>({productName:list[0].productName,...summarize(list)}))});
  } catch (err) { return res.status(err.statusCode || 500).json({success:false,error:err.message}); }
}
