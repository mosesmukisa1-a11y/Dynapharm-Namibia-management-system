import { normalizeBranchName } from '../services/gmFinanceMisEngine.js';
import { getStockCostProjection } from '../services/stockCostReporting.js';
import { inferLocationType } from '../services/stockEngine.js';

export default async function handler(req,res) {
  if (!req.user) return res.status(401).json({success:false,error:'Authentication required'});
  if (req.method!=='GET') return res.status(405).json({success:false,error:'Method not allowed'});
  try {
    const rows=(await getStockCostProjection()).map(row=>({...row,
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
