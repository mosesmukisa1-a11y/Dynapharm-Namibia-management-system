import { getStockCostProjection } from '../../services/stockCostReporting.js';
import { inferLocationType } from '../../services/stockEngine.js';
import { getStockAlertPolicy } from '../../services/stockAlertPolicy.js';
export default async function handler(req,res) {
  if (!req.user) return res.status(401).json({success:false,error:'Authentication required'});
  if (req.method!=='GET') return res.status(405).json({success:false,error:'Method not allowed'});
  try {
    const params=new URL(req.url,'http://internal').searchParams;
    const alertPolicy=await getStockAlertPolicy();
    const days=params.has('days') ? Number(params.get('days')) : alertPolicy.expiryWarningDays,location=params.get('location');
    if (!Number.isSafeInteger(days) || days<0 || days>3650) return res.status(422).json({success:false,error:'Invalid expiry window'});
    const today=new Date().toLocaleDateString('en-CA'),threshold=new Date(Date.now()+days*86400000).toLocaleDateString('en-CA');
    const rows=(await getStockCostProjection()).filter(r=>r.expiryDate && r.expiryDate<=threshold && (!location || r.location.toLowerCase().includes(location.toLowerCase())));
    const map=r=>({...r,type:inferLocationType(r.location),valueAtRisk:r.qty*(r.unitDPC ?? 0),daysUntilExpiry:Math.ceil((new Date(r.expiryDate)-new Date(today))/86400000)});
    const expired=rows.filter(r=>r.expiryDate<today).map(map),expiring=rows.filter(r=>r.expiryDate>=today).map(map);
    res.json({success:true,alertPolicy,days,expired,expiringSoon:expiring.filter(r=>r.type!=='branch'),branchExpiringSoon:expiring.filter(r=>r.type==='branch'),
      summary:{expiringSoonCount:expiring.length,expiredCount:expired.length,
        missingCostQuantity:rows.reduce((sum,r)=>sum+r.missingDPCQuantity,0),valuationComplete:rows.every(r=>!r.missingDPCQuantity)}});
  } catch (err) {res.status(500).json({success:false,error:err.message});}
}
