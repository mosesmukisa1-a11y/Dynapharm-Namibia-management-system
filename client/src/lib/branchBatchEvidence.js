// Never substitute incomplete movement history for physical stock custody.
export function branchBatchEvidence(row, movements) {
  const matching = movements.filter(m => m.product_name === row.product_name && m.batch_no === row.batch_no);
  const seen = new Set();
  const posted = matching.filter(m => {
    if (['pending','pending_approval','pending_gm','rejected','cancelled'].includes(String(m.status || '').replace(/^\$/,''))) return false;
    const identity=m.metadata?.sale_evidence?.movement_id || m.id;
    if (identity && seen.has(identity)) return false;
    if (identity) seen.add(identity);
    return true;
  });
  const total = types => posted.filter(m=>types(m.movement_type))
    .reduce((sum,m)=>sum+Math.abs(Number(m.quantity || 0)),0);
  const received=total(type=>['received','transfer_in','warehouse_receipt','branch_receipt'].includes(type));
  const returned=total(type=>['return','refund_approved','saleable_return','restored'].includes(type));
  const sold=total(type=>/sale|dispense/.test(type) && !/return|refund/.test(type));
  const writtenOff=total(type=>type==='write_off');
  const transferredOut=total(type=>['transfer_out','dispatched'].includes(type));
  const adjustment=posted.filter(m=>['adjustment','stock_count_adjustment'].includes(m.movement_type))
    .reduce((sum,m)=>sum+Number(m.quantity || 0),0);
  const ledgerRemaining=received+returned-sold-writtenOff-transferredOut+adjustment;
  return {received,returned,sold,writtenOff,transferredOut,adjustment,ledgerRemaining,
    physicalRemaining:Number(row.quantity),difference:Number(row.quantity)-ledgerRemaining,
    matchedLines:posted.length};
}
