import { it, expect, vi } from 'vitest';
import { branchBatchEvidence } from './branchBatchEvidence';
import { cleanStockStatus, presentStockStatus, stockStatusConflict } from '../../../shared/stockStatus';
import { STOCK_READ_ERROR, reportStockReadError } from './stockReadErrors';
import { traceDocumentEvents } from '../../../api/services/stockTracePresentation';
it('normalizes legacy display values without editing history and disables contradictory decisions',()=>{
  expect(cleanStockStatus('$delivered')).toBe('Delivered');
  expect(cleanStockStatus(' $received ')).toBe('Received');
  expect(cleanStockStatus('$approved')).toBe('Approved');
  const record={status:'$approved',gm_status:'rejected'};
  expect(stockStatusConflict(record)).toBe(true);
  expect(presentStockStatus(record).status).toBe('status_conflict');
  expect(record.status).toBe('$approved');
  expect(stockStatusConflict({status:'received',gm_status:'approved'})).toBe(false);
  expect(presentStockStatus({status:'rejected',status_conflict:true}).status_conflict).toBe(true);
});
it('calculates recorded branch batch movement net without replacing physical balances or double counting mirrors',()=>{
  const row={product_name:'TEST',batch_no:'LOT',quantity:23};
  const movement=(id,type,quantity,status='posted')=>({id,product_name:'TEST',batch_no:'LOT',movement_type:type,quantity,status});
  const rows=[movement('receive','received',30),movement('sale','sale',8),movement('return','saleable_return',2),
    movement('writeoff','write_off',1),movement('pending','write_off',20,'pending_approval'),
    {...movement('mirror','sale',8),metadata:{sale_evidence:{movement_id:'sale'}}}];
  expect(branchBatchEvidence(row,rows)).toMatchObject({received:30,sold:8,returned:2,writtenOff:1,ledgerRemaining:23,physicalRemaining:23,difference:0});
  expect(branchBatchEvidence(row,[movement('sale','sale',8)]).difference).toBe(31);
  expect(row.quantity).toBe(23);
});
it('only surfaces read failures on stock routes, never posts or unrelated login/notification errors',()=>{
  const listener=vi.fn();window.addEventListener(STOCK_READ_ERROR,listener);
  reportStockReadError('/stock/valuation','GET','/stock?view=valuation',Object.assign(Error('Unavailable'),{status:500}));
  expect(listener).toHaveBeenCalledTimes(1);
  reportStockReadError('/stock/transfers','POST','/stock?view=transfers',Error('Rejected write'));
  reportStockReadError('/notifications','GET','/stock?view=inventory',Error('Denied'));
  reportStockReadError('/stock/valuation','GET','/finance',Error('Unavailable'));
  expect(listener).toHaveBeenCalledTimes(1);window.removeEventListener(STOCK_READ_ERROR,listener);
});
it('shows only recorded document event timestamps and does not fabricate approval or receipt events',()=>{
  const record={id:'QA-TRANSFER',to_branch:'tsumeb',status:'received',created_at:'2026-10-14T08:00:00Z',
    gm_approved_at:'2026-10-14T09:00:00Z',dispatched_at:'2026-10-14T10:00:00Z',received_at:'2026-10-14T11:00:00Z'};
  expect(traceDocumentEvents('transfer',record).map(e=>e.type)).toEqual(['transfer created','GM approval','warehouse dispatch','branch receipt']);
  expect(traceDocumentEvents('transfer',{id:'UNKNOWN',status:'received'}).map(e=>e.type)).toEqual(['transfer created']);
  expect(traceDocumentEvents('supplier_import',{id:'IMPORT',created_at:'2026-10-14',destination_warehouse:'country_stock',date_received:'2026-10-14'})).toHaveLength(2);
});
