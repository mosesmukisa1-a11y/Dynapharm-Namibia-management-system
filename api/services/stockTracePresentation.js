import { businessDay } from './businessDates.js';
import { cleanStockStatus, stockStatusConflict } from '../../shared/stockStatus.js';

export function traceDocumentEvents(kind, record) {
  const reference=record.import_reference || record.dispatch_reference || record.request_number || record.id;
  const conflict=stockStatusConflict(record);
  const base={source:kind,recordId:record.id,reference,product:record.product_name || null,batch:record.batch_no || null,
    location:record.to_branch || record.destination_warehouse || record.to_location || null,
    status:conflict ? 'Status conflict detected' : cleanStockStatus(record.status),statusConflict:conflict};
  const event=(type,at,actor)=>{
    const instant=at ? new Date(at) : null, valid=instant && Number.isFinite(instant.getTime());
    return {...base,id:`${kind}:${record.id}:${type}`,type,timestamp:valid ? at : null,
      timestampEvidence:valid ? 'recorded' : at ? 'invalid' : 'missing',
      businessDate:valid ? businessDay(instant) : null,actor:actor || 'Not recorded'};
  };
  if(kind==='supplier_import') {
    const events=[event('supplier import',record.created_at,record.created_by)];
    if(record.destination_warehouse==='country_stock' && record.date_received)
      events.push(event('country stock receipt',record.date_received,record.created_by));
    return events;
  }
  const events=[event('transfer created',record.created_at,record.created_by)];
  if(record.gm_approved_at)events.push(event('GM approval',record.gm_approved_at,record.gm_approved_by));
  if(record.gm_rejected_at || record.rejected_at)events.push(event('GM rejection',record.gm_rejected_at || record.rejected_at,record.rejected_by));
  if(record.dispatched_at)events.push(event('warehouse dispatch',record.dispatched_at,record.dispatched_by));
  if(record.received_at)events.push(event(String(base.location || '').includes('warehouse') ? 'warehouse receipt':'branch receipt',record.received_at,record.received_by));
  return events;
}
