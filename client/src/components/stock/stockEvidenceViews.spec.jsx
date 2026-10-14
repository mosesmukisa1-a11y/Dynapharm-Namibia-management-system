import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import StockMovementLedger from './StockMovementLedger';
import BranchBatchLedger from './BranchBatchLedger';
import StockViewBoundary from './StockViewBoundary';
import { api } from '../../lib/api';
import { STOCK_READ_ERROR } from '../../lib/stockReadErrors';
vi.mock('../../lib/api', () => ({api:{stock:{movements:vi.fn(),branchInventory:vi.fn()}}}));
let host, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.clearAllMocks();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const render = async element => { await act(async () => { root.render(element); }); };
it('renders sale DP, charged, original cost and incomplete evidence separately with scoped business dates', async () => {
  api.stock.movements.mockResolvedValue({movements:[{id:'MOV-TEST',created_at:'2026-10-14T12:00:00Z',movement_type:'sale',
    reference_id:'WALK-TEST',receipt_no:'QA-RECEIPT',source_location:'townshop',product_name:'TEST',batch_no:'QA-LOT',
    signed_quantity:-1,dp_unit_price:7,dp_value:7,charged_value:9,branch_profit_value:2,
    original_received_cost:null,original_received_dpc:3,cost_evidence_status:'partial',created_by:'Synthetic staff'}]});
  await render(<StockMovementLedger branch="townshop" period={{from:'2026-10-14',to:'2026-10-14'}} />);
  const params=new URLSearchParams(api.stock.movements.mock.calls[0][0]);
  expect(params.get('branch')).toBe('townshop'); expect(params.get('date_to')).toBe('2026-10-14');
  expect(host.textContent).toContain('QA-RECEIPT'); expect(host.textContent).toContain('Missing evidence');
  expect(host.textContent).toContain('partial'); expect(host.textContent).toContain('Original CIF/unit');
});
it('shows failed ledger reads with retry instead of presenting zero movements as success', async () => {
  api.stock.movements.mockRejectedValueOnce(Error('Synthetic failed ledger')).mockResolvedValue({movements:[]});
  await render(<StockMovementLedger branch="townshop" />);
  expect(host.querySelector('[role=alert]').textContent).toContain('Synthetic failed ledger');
  expect(host.textContent).not.toContain('No matching recorded movements');
  await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Retry').click());
  expect(host.querySelector('[role=alert]')).toBeNull();
  expect(host.textContent).toContain('No matching recorded movements');
});
it('rejects an older successful ledger response after the selected branch changes',async()=>{
  let resolveEarlier;
  api.stock.movements.mockImplementation(query=>new URLSearchParams(query).get('branch')==='townshop'
    ? new Promise(resolve=>{resolveEarlier=resolve;})
    : Promise.resolve({movements:[{id:'CURRENT-BRANCH-MOV',created_at:'2026-10-14T08:00:00Z',
      movement_type:'sale',product_name:'CURRENT-BRANCH-PRODUCT',source_location:'swakopmund'}]}));
  await render(<StockMovementLedger branch="townshop" />);
  await render(<StockMovementLedger branch="swakopmund" />);
  expect(host.textContent).toContain('CURRENT-BRANCH-PRODUCT');
  await act(async()=>resolveEarlier({movements:[{id:'EARLIER-MOV',created_at:'2026-10-14T08:00:00Z',product_name:'EARLIER-PRODUCT'}]}));
  expect(host.textContent).toContain('CURRENT-BRANCH-PRODUCT');
  expect(host.textContent).not.toContain('EARLIER-PRODUCT');
});
it('reaches the next ledger page and resets its cursor when scope changes',async()=>{
  api.stock.movements.mockResolvedValue({movements:[],nextCursor:'synthetic-cursor'});
  await render(<StockMovementLedger branch="townshop" />);
  const next=[...host.querySelectorAll('button')].find(button=>button.textContent==='Next page');
  await act(async()=>next.click());
  expect(new URLSearchParams(api.stock.movements.mock.calls.at(-1)[0]).get('cursor')).toBe('synthetic-cursor');
  await render(<StockMovementLedger branch="swakopmund" />);
  const query=new URLSearchParams(api.stock.movements.mock.calls.at(-1)[0]);
  expect(query.get('branch')).toBe('swakopmund');expect(query.get('cursor')).toBeNull();
});
it('shows branch physical batches independently from warehouse editing with matched subtotals and unknown originals', async () => {
  api.stock.branchInventory.mockResolvedValue({inventory:[{id:'BIB-TEST',branch_id:'townshop',product_name:'TEST',
    batch_no:'LOT',expiry_date:'2035-12-31',quantity:23,status:'in_stock',stock_value_dp:69,stock_value_cif:0,
    missing_dpc_quantity:0,missing_cif_quantity:23}]});
  api.stock.movements.mockResolvedValue({movements:[{product_name:'TEST',batch_no:'LOT',quantity:8,movement_type:'sale',status:'posted'}]});
  await render(<BranchBatchLedger branch="townshop" />);
  expect(host.textContent).toContain('Branch-held batches — read-only');
  expect(host.textContent).toContain('Missing / partial');
  expect(host.textContent).toContain('Incomplete: DP 0, CIF 23 units');
  expect(host.querySelector('tbody').textContent).toContain('23');
  expect(api.stock.branchInventory.mock.calls[0][0]).toContain('branch=townshop');
});
it('keeps rendering failures visible within the Stock shell', async () => {
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  function BrokenView(){throw Error('Synthetic render failure');}
  await render(<StockViewBoundary view="Inventory"><BrokenView /></StockViewBoundary>);
  expect(host.querySelector('[role=alert]').textContent).toContain('Could not display Inventory');
  expect(host.textContent).toContain('Retry view'); log.mockRestore();
});
it('ignores a delayed failed read from an earlier location context',async()=>{
  const previous=window.location.pathname+window.location.search;
  window.history.replaceState({},'','/stock?view=inventory&branch=townshop');
  const oldContext=window.location.pathname+window.location.search;
  window.history.replaceState({},'','/stock?view=inventory&branch=swakopmund');
  await render(<StockViewBoundary view="Inventory"><p>Current branch evidence</p></StockViewBoundary>);
  await act(async()=>window.dispatchEvent(new CustomEvent(STOCK_READ_ERROR,{detail:{
    context:oldContext,endpoint:'/stock/inventory',status:500,message:'Old branch read failed'
  }})));
  expect(host.textContent).toContain('Current branch evidence');
  expect(host.querySelector('[role=alert]')).toBeNull();
  window.history.replaceState({},'',previous);
});
