export function stockValuationDisclosure(summary={}){
  const missingCIF=Number(summary.missingCostQuantity || 0),missingDP=Number(summary.missingDPQuantity || 0);
  const incomplete=summary.valuationComplete!==true || missingCIF>0 || missingDP>0;
  return {incomplete,missingCIF,missingDP,
    cifLabel:incomplete?'Known CIF subtotal':'Total CIF value',
    dpLabel:incomplete?'Known DP subtotal':'Total DP value',
    notice:incomplete?`INCOMPLETE ORIGINAL SOURCE COSTS — KNOWN SUBTOTALS ONLY. ${missingCIF} units lack CIF; ${missingDP} units lack DP. These values are not complete stock valuations.`:'Original source-cost valuation complete.'};
}

export function buildStockOverviewCSV(data){
  const disclosure=stockValuationDisclosure(data.summary);
  const rows=[['Product','Total Qty',`${disclosure.cifLabel} (N$)`,`${disclosure.dpLabel} (N$)`,
    'Location Type','Location','Loc Qty','Loc CIF','Loc DP','Valuation status','Missing CIF units','Missing DP units']];
  const status=row=>Number(row.missingCostQuantity || 0)>0 || Number(row.missingDPQuantity || 0)>0?'Known subtotals only':'Complete';
  for(const p of data.products){
    rows.push([p.productName,p.totalQty,p.totalValueCIF,p.totalValueDP,'','','','','',status(p),p.missingCostQuantity || 0,p.missingDPQuantity || 0]);
    for(const l of p.locations)rows.push(['','','','',l.locationType,l.locationName,l.qty,l.valueCIF,l.valueDP,status(l),l.missingCostQuantity || 0,l.missingDPQuantity || 0]);
  }
  rows.push(['COMPANY SUMMARY',data.summary.totalQtyUnits,data.summary.totalValueCIF,data.summary.totalValueDP,
    '','','','','',disclosure.notice,disclosure.missingCIF,disclosure.missingDP]);
  return rows.map(row=>row.map(value=>`"${String(value ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
}
