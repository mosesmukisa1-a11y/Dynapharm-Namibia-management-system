import { getStockCostProjection } from '../../services/stockCostReporting.js';
import { stockAsOfDate, expiryDays } from '../../../client/src/lib/expiryWindows.js';
import { canReadCompanyStock } from '../../services/stockReportFreshness.js';
import { inferLocationType } from '../../services/stockEngine.js';
import { getStockAlertPolicy } from '../../services/stockAlertPolicy.js';
export default async function handler(req,res) {
  if (!req.user) return res.status(401).json({success:false,error:'Authentication required'});
  if (!canReadCompanyStock(req.user)) return res.status(403).json({success:false,error:'Company stock reporting access denied'});
  if (req.method!=='GET') return res.status(405).json({success:false,error:'Method not allowed'});
  try {
    const params=new URL(req.url,'http://internal').searchParams;
    const alertPolicy=await getStockAlertPolicy();
    const days=params.has('days') ? Number(params.get('days')) : alertPolicy.expiryWarningDays,location=params.get('location');
    if (!Number.isSafeInteger(days) || days<0 || days>3650) return res.status(422).json({success:false,error:'Invalid expiry window'});
    const today=stockAsOfDate();
    const projection=await getStockCostProjection();
    const matching=projection.filter(r=>r.qty>0 && (!location || r.location.toLowerCase().includes(location.toLowerCase())));
    const rows=matching.filter(r=>{const remaining=expiryDays(r.expiryDate,today);return remaining!==null && remaining<=days;});
    const map=r=>({...r,type:r.locationType || inferLocationType(r.location),
      valueAtRisk:r.missingDPCQuantity>0 || r.unitDPC==null ? null : r.qty*r.unitDPC,
      daysUntilExpiry:expiryDays(r.expiryDate,today)});
    const expired=rows.filter(r=>r.expiryDate<today).map(map),expiring=rows.filter(r=>r.expiryDate>=today).map(map);
    res.json({success:true,alertPolicy,days,expired,expiringSoon:expiring.filter(r=>r.type!=='branch'),branchExpiringSoon:expiring.filter(r=>r.type==='branch'),
      asOf:today,summary:{missingExpiryQuantity:matching.filter(r=>expiryDays(r.expiryDate,today)===null).reduce((sum,r)=>sum+r.qty,0),expiringSoonCount:expiring.length,expiredCount:expired.length,
        missingCostQuantity:rows.reduce((sum,r)=>sum+r.missingDPCQuantity,0),valuationComplete:rows.every(r=>!r.missingDPCQuantity)}});
  } catch (err) {res.status(500).json({success:false,error:err.message});}
}
