export function stockValuationEvidence(rows, prices = []) {
  const result = { originalDP:0, originalCIF:0, missingDP:0, missingCIF:0,
    estimatedDP:0, estimatedCIF:0, unpricedDP:0, unpricedCIF:0 };
  const key = value => String(value || '').trim().toLowerCase();
  for (const row of rows) {
    const qty = Number(row.qty);
    const approvedZero=row.zeroCostApproved === true || row.metadata?.zeroCostApproved === true;
    const valid=value=>value!=null && value!=='' && Number.isFinite(Number(value)) &&
      (Number(value)>0 || (Number(value)===0 && approvedZero));
    const missingDP = valid(row.unitDPC) ? Number(row.missingDPCQuantity ?? 0) : qty;
    const missingCIF = valid(row.unitCIF) ? Number(row.missingCostQuantity ?? 0) : qty;
    result.missingDP += missingDP; result.missingCIF += missingCIF;
    if(qty>missingDP)result.originalDP += (qty - missingDP) * Number(row.unitDPC);
    if(qty>missingCIF)result.originalCIF += (qty - missingCIF) * Number(row.unitCIF);
    // Estimates only for exact unique catalogue identities; never historical originals.
    const matches = prices.filter(price => [price.description, ...(price.aliases || [])]
      .some(name => key(name) === key(row.productName)));
    const price = matches.length === 1 ? matches[0] : null;
    if (price?.dp != null && Number(price.dp) > 0) result.estimatedDP += missingDP * Number(price.dp);
    else result.unpricedDP += missingDP;
    if (price?.cif != null && Number(price.cif) > 0) result.estimatedCIF += missingCIF * Number(price.cif);
    else result.unpricedCIF += missingCIF;
  }
  return result;
}
