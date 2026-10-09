import { getStockCostProjection } from '../../services/stockCostReporting.js';
import { inferLocationType } from '../../services/stockEngine.js';
import { normalizeBranchName } from '../../services/gmFinanceMisEngine.js';
export default async function handler(req,res) {
  if (!req.user) return res.status(401).json({success:false,error:'Authentication required'});
  if (req.method!=='GET') return res.status(405).json({success:false,error:'Method not allowed'});
  try {
    const rows=await getStockCostProjection(),groups=new Map();
    for (const row of rows) {
      if (!groups.has(row.location)) groups.set(row.location,{locationId:row.location,
        locationName:normalizeBranchName(row.location),locationType:inferLocationType(row.location),
        totalValueDP:0,totalValueCIF:0,missingCostQuantity:0,missingCIFQuantity:0,items:[]});
      const group=groups.get(row.location);
      group.totalValueDP+=row.qty*(row.unitDPC ?? 0);group.totalValueCIF+=row.qty*(row.unitCIF ?? 0);
      group.missingCostQuantity+=row.missingDPCQuantity;group.missingCIFQuantity+=row.missingCostQuantity;
      group.items.push({...row,closingQty:row.qty,unitDP:row.unitDPC,stockValueDP:row.qty*(row.unitDPC ?? 0)});
    }
    const locations=[...groups.values()],warehouses=locations.filter(r=>r.locationType==='warehouse').map(r=>({...r,warehouseId:r.locationId,warehouseName:r.locationName}));
    const branches=locations.filter(r=>r.locationType==='branch').map(r=>({...r,branchId:r.locationId,branchName:r.locationName}));
    const companyValueDP=locations.reduce((sum,r)=>sum+r.totalValueDP,0);
    return res.json({success:true,asOfDate:new Date().toISOString().slice(0,10),warehouses,branches,locations,
      companyValueDP,totalCompanyValueDP:companyValueDP,
      warehouseValueDP:warehouses.reduce((sum,r)=>sum+r.totalValueDP,0),branchValueDP:branches.reduce((sum,r)=>sum+r.totalValueDP,0),
      missingCostQuantity:locations.reduce((sum,r)=>sum+r.missingCostQuantity,0),
      missingCIFQuantity:locations.reduce((sum,r)=>sum+r.missingCIFQuantity,0),
      valuationComplete:locations.every(r=>!r.missingCostQuantity && !r.missingCIFQuantity)});
  } catch (err) { return res.status(500).json({success:false,error:err.message}); }
}
