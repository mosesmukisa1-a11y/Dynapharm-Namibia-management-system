import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import StockMovementLedger from './StockMovementLedger';
import BranchBatchLedger from './BranchBatchLedger';
import StockViewBoundary from './StockViewBoundary';
import { api } from '../../lib/api';
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
  api.stock.movements.mockRejectedValue(Error('Synthetic failed ledger'));
  await render(<StockMovementLedger branch="townshop" />);
  expect(host.querySelector('[role=alert]').textContent).toContain('Synthetic failed ledger');
  expect(host.textContent).not.toContain('No matching recorded movements');
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
