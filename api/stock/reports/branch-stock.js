import { getStockCostProjection } from '../../services/stockCostReporting.js';
import { inferLocationType } from '../../services/stockEngine.js';
import { branchSearchTerms,normalizeBranchSlug } from '../../_lib/branchUtils.js';
export default async function handler(req,res) {
  if (!req.user) return res.status(401).json({success:false,error:'Authentication required'});
  if (req.method!=='GET') return res.status(405).json({success:false,error:'Method not allowed'});
  try {
    const branch=new URL(req.url,'http://internal').searchParams.get('branchId');
    const aliases=branch && branch!=='all' ? branchSearchTerms(normalizeBranchSlug(branch)) : null;
    const rows=(await getStockCostProjection()).filter(r=>inferLocationType(r.location)==='branch' && (!aliases || aliases.includes(r.location)));
    const groups=new Map();
    for (const row of rows) {
      if (!groups.has(row.location)) groups.set(row.location,{branchId:row.location,branchName:row.location.replace(/_/g,' '),items:[],totalQty:0,totalValueDPC:0,missingCostQuantity:0});
      const group=groups.get(row.location);
      group.items.push({...row,closingQty:row.qty,stockValueDPC:row.qty*(row.unitDPC ?? 0)});
      group.totalQty+=row.qty;group.totalValueDPC+=row.qty*(row.unitDPC ?? 0);group.missingCostQuantity+=row.missingDPCQuantity;
    }
    res.json({success:true,branches:[...groups.values()].map(r=>({...r,totalValueDPC:Number(r.totalValueDPC.toFixed(2)),valuationComplete:!r.missingCostQuantity})),total:rows.length,
      missingCostQuantity:rows.reduce((sum,r)=>sum+r.missingDPCQuantity,0),valuationComplete:rows.every(r=>!r.missingDPCQuantity)});
  } catch (err) {res.status(500).json({success:false,error:err.message});}
}
