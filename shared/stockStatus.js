const labels = {
  pending:'Pending',pending_gm:'Pending GM',pending_approval:'Pending GM',approved:'Approved',
  dispatched:'Dispatched',in_transit:'In Transit',received:'Received',delivered:'Delivered',
  partially_received:'Partially Received',rejected:'Rejected',returned:'Returned',cancelled:'Cancelled',completed:'Completed',
  status_conflict:'Status conflict detected',
};
export const normalizedStockStatus = value => String(value || '').trim().replace(/^\$+/, '').trim().toLowerCase();
export const cleanStockStatus = value => labels[normalizedStockStatus(value)] ||
  normalizedStockStatus(value).replace(/_/g,' ') || 'Not recorded';
export function stockStatusConflict(record) {
  if(record.status_conflict === true)return true;
  const signals = [record.status,record.approval_status,record.gm_status,record.metadata?.approval_status,record.metadata?.gm_status]
    .map(normalizedStockStatus).filter(Boolean);
  return signals.some(status => ['rejected','cancelled'].includes(status)) &&
    signals.some(status => ['approved','dispatched','in_transit','received','delivered','partially_received','completed'].includes(status));
}
export const presentStockStatus = record => ({...record,raw_status:record.raw_status ?? record.status,
  recorded_status:normalizedStockStatus(record.recorded_status ?? record.status),
  status:stockStatusConflict(record) ? 'status_conflict' : normalizedStockStatus(record.status),status_conflict:stockStatusConflict(record)});
