import { applyAuthCors } from '../../_lib/auth.js';
import { getStockCostProjection } from '../../services/stockCostReporting.js';
import { getStockAlertPolicy } from '../../services/stockAlertPolicy.js';
import { canReadCompanyStock } from '../../services/stockReportFreshness.js';
import { normalizeBranchSlug } from '../../_lib/branchUtils.js';
import { validateStockAlertPolicy } from '../../../shared/stockAlertPolicy.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (!canReadCompanyStock(req.user)) return res.status(403).json({ success: false, error: 'Company stock reporting access denied' });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const params = new URL(req.url, 'http://internal').searchParams;
    const alertPolicy = await getStockAlertPolicy();
    const threshold = params.has('threshold') ? Number(params.get('threshold')) : alertPolicy.lowStockThreshold;
    try { validateStockAlertPolicy({ ...alertPolicy, lowStockThreshold: threshold }); }
    catch (error) { return res.status(422).json({ success: false, error: error.message }); }
    const location = params.get('location')?.trim().toLowerCase();
    const groups = new Map();
    for (const row of await getStockCostProjection()) {
      if (row.locationType === 'in_transit') continue;
      const owner = row.locationType === 'branch' ? normalizeBranchSlug(row.location) : row.location;
      if (location && !owner.toLowerCase().includes(location) &&
          !(row.locationType === 'branch' && normalizeBranchSlug(location) === owner)) continue;
      const key = JSON.stringify([row.locationType, owner, row.productName.trim().toLowerCase()]);
      if (!groups.has(key)) groups.set(key, {type:row.locationType,location:owner,
        productName:row.productName,currentQty:0,physicalQty:0,threshold});
      const item = groups.get(key);
      item.currentQty += row.availableQty;
      item.physicalQty += row.qty;
    }
    const items = [...groups.values()].filter(item => item.currentQty < threshold)
      .map(item => ({...item,urgency:item.currentQty <= 0 ? 'out_of_stock' : item.currentQty < 3 ? 'critical' : 'low'}))
      .sort((a,b) => a.currentQty-b.currentQty);
    return res.status(200).json({success:true,alertPolicy,threshold,items,
      quantityBasis:'Available source-layer units; expired, reserved and held stock excluded',
      summary:{totalLowStock:items.length,outOfStock:items.filter(i=>i.urgency==='out_of_stock').length,
        critical:items.filter(i=>i.urgency==='critical').length,low:items.filter(i=>i.urgency==='low').length}});
  } catch (error) {
    return res.status(500).json({success:false,error:error.message});
  }
}
