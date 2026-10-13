// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('../client/src/lib/api', () => ({ api:{get:vi.fn(),post:vi.fn()} }));
import { api } from '../client/src/lib/api';
import BranchStockClearance from '../client/src/components/BranchStockClearance';
let host,root,previousReact;
const draft={id:'CLEARANCE-SAVED',status:'draft',branch_ids:['townshop'],all_branches:false,reason:'GM-directed branch stock clearance; historical records retained',
  total_units:10,protected_units:28,missing_cost_units:0,blocked_rows:0,reserved_transfers:[],
  rows:[{id:'ROW',type:'branch',branch_id:'townshop',product_name:'TEST-ITEM',quantity:10,stock_unit:'unit',
    flags:[],cost:{known_cost:'20',missing_qty:'0'}}],protected_rows:[]};
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes(text));
const change=async(el,value)=>{
  await act(async()=>{
    const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);
    el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));
  });
};
beforeEach(()=>{
  previousReact=globalThis.React;globalThis.React=React;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  api.get.mockReset();api.post.mockReset();
  api.get.mockResolvedValue({branches:[{id:'townshop',name:'Windhoek CBD'}],history:[]});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());host.remove();globalThis.React=previousReact;delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
it('previews only, uses exact branch IDs and requires explicit confirmation before posting',async()=>{
  api.post.mockResolvedValueOnce(draft).mockResolvedValueOnce({...draft,status:'approved'});
  await act(async()=>root.render(<BranchStockClearance/>));
  await change(host.querySelector('select'),'townshop');
  await act(async()=>button('Preview branch clearance').click());
  expect(api.post).toHaveBeenCalledExactlyOnceWith('/stock/branch-clearance',{action:'preview',branch_ids:['townshop']});
  expect(button('Confirm GM branch clearance').disabled).toBe(true);
  await act(async()=>host.querySelector('input[type=checkbox]').click());
  await change(host.querySelector('input[aria-label="Clearance confirmation"]'),'WRITE OFF BRANCH STOCK');
  expect(button('Confirm GM branch clearance').disabled).toBe(false);
  await act(async()=>button('Confirm GM branch clearance').click());
  expect(api.post).toHaveBeenLastCalledWith('/stock/branch-clearance',expect.objectContaining({
    action:'execute',id:draft.id,backup_verified:true,confirmation:'WRITE OFF BRANCH STOCK',
  }));
  expect(host.textContent).toContain('Physical disposal is still separate');
});
it('does not enable execution with blockers even after the operator confirms',async()=>{
  api.post.mockResolvedValue({...draft,blocked_rows:1,rows:[{...draft.rows[0],flags:['Stock status out_of_stock']}]});
  await act(async()=>root.render(<BranchStockClearance/>));
  await act(async()=>button('Preview branch clearance').click());
  await act(async()=>host.querySelector('input[type=checkbox]').click());
  await change(host.querySelector('input[aria-label="Clearance confirmation"]'),'WRITE OFF BRANCH STOCK');
  expect(button('Confirm GM branch clearance').disabled).toBe(true);
  expect(host.textContent).toContain('Execution blocked');
  const readiness=host.querySelector('[aria-label="Clearance execution readiness"]');
  expect(readiness.textContent).toContain('1 blocked batches');
  expect(readiness.textContent).toContain('townshop — 1 affected batches: Stock status out_of_stock');
  expect(readiness.textContent).not.toContain('confirmation text must match');
  expect(readiness.textContent).not.toContain('Confirm the recoverable-backup');
  expect(api.post).toHaveBeenCalledTimes(1);
});
it('keeps row-level safeguards even if a malformed summary undercounts blockers',async()=>{
  api.post.mockResolvedValue({...draft,blocked_rows:0,rows:[{...draft.rows[0],flags:['Pending write-off MOV-TEST']}]});
  await act(async()=>root.render(<BranchStockClearance/>));
  await act(async()=>button('Preview branch clearance').click());
  await act(async()=>host.querySelector('input[type=checkbox]').click());
  await change(host.querySelector('input[aria-label="Clearance confirmation"]'),'WRITE OFF BRANCH STOCK');
  expect(button('Confirm GM branch clearance').disabled).toBe(true);
  expect(host.querySelector('[aria-label="Clearance execution readiness"]').textContent).toContain('MOV-TEST');
  expect(api.post).toHaveBeenCalledTimes(1);
});
it('shows reserved transfer IDs next to confirmation without bypassing the block',async()=>{
  api.post.mockResolvedValue({...draft,reserved_transfers:['TRANSFER-TEST']});
  await act(async()=>root.render(<BranchStockClearance/>));
  await act(async()=>button('Preview branch clearance').click());
  await act(async()=>host.querySelector('input[type=checkbox]').click());
  await change(host.querySelector('input[aria-label="Clearance confirmation"]'),'WRITE OFF BRANCH STOCK');
  expect(button('Confirm GM branch clearance').disabled).toBe(true);
  expect(host.querySelector('[aria-label="Clearance execution readiness"]').textContent).toContain('Reserved transfer IDs: TRANSFER-TEST');
});
it('does not require a missing-cost checkbox for a numeric-string zero',async()=>{
  api.post.mockResolvedValue({...draft,missing_cost_units:'0'});
  await act(async()=>root.render(<BranchStockClearance/>));
  await act(async()=>button('Preview branch clearance').click());
  expect(host.querySelectorAll('input[type=checkbox]')).toHaveLength(1);
  await act(async()=>host.querySelector('input[type=checkbox]').click());
  await change(host.querySelector('input[aria-label="Clearance confirmation"]'),'WRITE OFF BRANCH STOCK');
  expect(button('Confirm GM branch clearance').disabled).toBe(false);
  expect(host.querySelector('[aria-label="Clearance execution readiness"]').textContent).toContain('Ready for GM confirmation');
});
it('synchronizes the selector and explicit stored scope when reopening a saved clearance',async()=>{
  api.get.mockResolvedValueOnce({branches:[{id:'townshop',name:'Windhoek CBD'}],history:[{id:draft.id,status:'approved'}]})
    .mockResolvedValueOnce({...draft,status:'approved'});
  await act(async()=>root.render(<BranchStockClearance/>));
  expect(host.querySelector('select').value).toBe('');
  await act(async()=>button('Open saved clearance').click());
  expect(host.querySelector('select').value).toBe('townshop');
  expect(host.textContent).toContain('Saved execution scope: townshop');
  expect(button('Confirm GM branch clearance')).toBeUndefined();
});
it('requires missing-cost acknowledgment and retries an uncertain response with the same preview ID',async()=>{
  api.post.mockResolvedValueOnce({...draft,missing_cost_units:2}).mockRejectedValueOnce(Error('Connection interrupted'))
    .mockResolvedValueOnce({...draft,status:'approved',unchanged:true});
  await act(async()=>root.render(<BranchStockClearance/>));
  await act(async()=>button('Preview branch clearance').click());
  await act(async()=>host.querySelectorAll('input[type=checkbox]')[0].click());
  await change(host.querySelector('input[aria-label="Clearance confirmation"]'),'WRITE OFF BRANCH STOCK');
  expect(button('Confirm GM branch clearance').disabled).toBe(true);
  await act(async()=>host.querySelectorAll('input[type=checkbox]')[1].click());
  await act(async()=>button('Confirm GM branch clearance').click());
  expect(host.textContent).toContain('Connection interrupted');
  await act(async()=>button('Confirm GM branch clearance').click());
  const executions=api.post.mock.calls.filter(([url,data])=>data.action==='execute');
  expect(executions).toHaveLength(2);expect(executions.every(([url,data])=>data.id===draft.id)).toBe(true);
  expect(host.textContent).toContain('No additional stock was deducted');
});
