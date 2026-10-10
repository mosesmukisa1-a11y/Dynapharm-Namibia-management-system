export function stockOverviewLocation(data,location='all'){
  if(!data?.summary || !Array.isArray(data.products))return null;
  if(!location || location==='all')return data.summary;
  const rows=data.products.flatMap(p=>p.locations || []).filter(r=>r.locationId===location);
  const totals={totalQtyUnits:0,totalValueDP:0,totalValueCIF:0,availableQty:0,reservedQty:0,quarantinedQty:0,inTransitQty:0,missingCostQuantity:0,missingDPQuantity:0};
  for(const r of rows){
    totals.totalQtyUnits+=Number(r.qty || 0);
    totals.totalValueDP+=Number(r.valueDP || 0);
    totals.totalValueCIF+=Number(r.valueCIF || 0);
    for(const k of ['availableQty','reservedQty','quarantinedQty','inTransitQty','missingCostQuantity','missingDPQuantity'])
      totals[k]+=Number(r[k] || 0);
  }
  totals.valuationComplete=!totals.missingCostQuantity&&!totals.missingDPQuantity;
  return totals;
}
