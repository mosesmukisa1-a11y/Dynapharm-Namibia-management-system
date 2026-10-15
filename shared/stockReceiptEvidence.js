// Only physically equivalent receipt event names may mirror one another.
// Stable reference, exact product/lot, branch identity and quantity still must
// match. Dispatch, reservation, returns and sales are deliberately not aliases.
export function receiptMirrorType(type){
  const value=String(type||'').toLowerCase();
  return ['branch_receipt','receive','received','stock_receipt','transfer_in','transit_receipt','import_received'].includes(value)?'physical_receipt':value;
}
