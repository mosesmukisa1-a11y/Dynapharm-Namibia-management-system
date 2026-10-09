// @vitest-environment jsdom
import React, { act } from 'react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LinkedCustomerReturns, DispatchReturnsTab } from '../client/src/components/LinkedCustomerReturns.jsx';
import { api } from '../client/src/lib/api';

vi.mock('../client/src/lib/api',()=>({api:{get:vi.fn(),post:vi.fn(),stock:{transfers:vi.fn()}}}));
const sale={movement_id:'isolated-sale-allocation',sale_reference:'isolated-sale',product_name:'Isolated product',
  batch_no:'ORIGINAL',expiry_date:'2031-06-30',quantity:8,remaining_quantity:8,snapshot:{revenue_unit:12.5,unit_cost:2.345678,unit_dp:7.25}};
let root,container;
const field=id=>container.querySelector(`#${id}`);
const button=text=>[...container.querySelectorAll('button')].find(item=>item.textContent.trim()===text);
async function render(component) {await act(async()=>root.render(component));}
async function click(element) {expect(element).toBeTruthy();await act(async()=>element.click());}
async function change(element,value) {
  expect(element).toBeTruthy();
  const prototype=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:
    element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  const setter=Object.getOwnPropertyDescriptor(prototype,'value').set;
  await act(async()=>{setter.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));});
}
beforeEach(()=>{
  vi.stubGlobal('React',React); // Vitest's JSX transform is classic; Vite's browser transform is automatic.
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  vi.resetAllMocks();
  api.stock.transfers.mockResolvedValue([]);
  api.get.mockImplementation(async path=>path.includes('refund-allocations')?{allocations:[sale]}:[]);
  api.post.mockResolvedValue({success:true});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
async function findSale() {
  await change(field('linked-sale-ref'),sale.sale_reference);
  await click(button('Find sale'));
}
async function loadTransfer() {
  await change(field('dispatch-transfer-id'),'isolated-transfer');
  await click(button('Load transfer'));
}
describe('authorized linked cancellation and return forms',()=>{
  it('lets the signed-in admin role submit a physically confirmed linked return and retry with the same key',async()=>{
    api.post.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValue({success:true});
    await render(<LinkedCustomerReturns branchId="windhoek" userRole="admin"/>);
    await findSale();
    await change(field('refund-allocation'),sale.movement_id);
    await change(field('return-quantity'),'3');
    await change(field('return-reason'),'Customer physically returned goods');
    expect(button('Submit linked return').disabled).toBe(true);
    await click(container.querySelector('input[type=checkbox]'));
    await click(button('Submit linked return'));
    expect(container.querySelector('[role=alert]').textContent).toBe('Response lost');
    expect(api.post.mock.calls[0]).toEqual(['/branch/refund-requests',expect.objectContaining({
      allocation_id:sale.movement_id,quantity:3,physical_return_confirmed:true,operation_key:expect.any(String),
    })]);
    await click(button('Retry same linked return'));
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
    expect(field('return-quantity').value).toBe('');
  });
  it('does not expose a return submission form to a finance-only role',async()=>{
    await render(<LinkedCustomerReturns branchId="windhoek" userRole="finance"/>);
    await findSale();
    expect(container.textContent).toContain('not in the authorized branch-return role group');
    expect(field('return-quantity')).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });
  it('requires a reason to cancel an approved reservation and sends no physical-stock return',async()=>{
    let data={transfer:{id:'isolated-transfer',status:'approved'},allocations:[],returns:[]};
    api.get.mockImplementation(async()=>data);
    api.post.mockImplementation(async()=>{
      data={...data,transfer:{...data.transfer,status:'cancelled'}};
      return {success:true};
    });
    await render(<DispatchReturnsTab/>);
    await loadTransfer();
    const reason=field('reservation-cancel-reason');
    expect(button('Cancel approved reservation').disabled).toBe(true);
    await change(reason,'No shipment required');
    await click(button('Cancel approved reservation'));
    expect(api.post).toHaveBeenCalledWith('/stock/dispatch-returns',{
      action:'cancel_reservation',transfer_id:'isolated-transfer',reason:'No shipment required',
    });
    expect(container.textContent).toContain('This reservation is cancelled. No transit goods are available to return.');
    expect(container.querySelector('input[type=checkbox]')).toBeNull();
  });
});
