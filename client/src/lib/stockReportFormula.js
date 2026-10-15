// Quantity conservation only. A matching formula does not certify source history.
export function stockFormulaReview(f) {
  const fields=['opening','issued','salesQty','dispensed','writeoffs','transferredOut','returns','adjusted','closing'];
  if(fields.some(k=>!Number.isFinite(Number(f[k] ?? 0))))
    return {status:'unavailable',expected:null,difference:null};
  const n=k=>Number(f[k] ?? 0);
  const expected=n('opening')+n('issued')-n('salesQty')-n('dispensed')-n('writeoffs')-n('transferredOut')+n('returns')+n('adjusted');
  const difference=n('closing')-expected;
  return {status:Math.abs(difference)<0.000001?'reconciled':'review',expected,difference};
}
