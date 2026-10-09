// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import ControlledStockOperations from '../client/src/components/ControlledStockOperations.jsx';
import { api } from '../client/src/lib/api.js';

vi.mock('../client/src/lib/api.js',()=>({api:{get:vi.fn(),patch:vi.fn(),post:vi.fn()}}));
vi.mock('../client/src/contexts/AuthContext.jsx',()=>({useAuth:()=>({user:{id:'test-finance',role:'finance'}})}));
const operation={id:'test-return',kind:'supplier_return',status:'dispatched',reason:'Supplier return fixture',
  created_by:'test-stock',created_at:'2026-10-09T08:00:00Z',
  lines:[{id:'test-line',status:'approved',quantity:5,approved_quantity:3,dispatched_quantity:3,
    snapshot:{product_name:'Test product',batch_no:'Test batch',unit_cost:4.25,location:'test_warehouse'}}]};
const credit={operation_id:'test-return',supplier_import_id:'test-import',supplier_name:'Test supplier',
  expected_amount:12.75,credited_amount:null,credit_reference:null,status:'awaiting_credit'};
let container,root;
async function render(data,mode='finance') {
  api.get.mockResolvedValue(data);
  await act(async()=>{root.render(<ControlledStockOperations mode={mode}/>);});
}
async function change(input,value) {
  expect(input,'The requested input should be visible').toBeDefined();
  const setter=Object.getOwnPropertyDescriptor(input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,'value').set;
  await act(async()=>{setter.call(input,value);input.dispatchEvent(new Event(input instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});
}
function button(text) {return [...container.querySelectorAll('button')].find(b=>b.textContent.includes(text));}
function field(label) {return [...container.querySelectorAll('label')].find(l=>l.textContent.includes(label))?.querySelector('input,select');}
describe('controlled-stock credit and partial dispatch UI contract',()=>{
  beforeEach(()=>{
    globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    vi.clearAllMocks();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  });
  afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
  it('shows actual awaiting-credit records and submits the selected original-import credit',async()=>{
    const data={operations:[operation],credits:[credit],batches:[],segregated:[],locations:[],financial_entries:[]};
    await render(data);
    expect(button('Record supplier credit')).toBeDefined();
    expect(container.querySelectorAll('select')).toHaveLength(1);
    const ledger=[...container.querySelectorAll('section')].find(s=>s.textContent.includes('Supplier credit ledger'));
    expect(ledger.textContent).toContain('12.75');expect(ledger.textContent).toContain('—');
    await change(field('Supplier import to credit'),'test-import');
    await change(field('Credit reference'),'TEST-CREDIT');
    await change(field('Credited amount'),'12.50');
    api.patch.mockResolvedValue({operation:{...operation,status:'credited'}});
    api.get.mockResolvedValue({...data,operations:[{...operation,status:'credited'}],credits:[{...credit,status:'credited',credited_amount:12.5}]});
    await act(async()=>button('Record supplier credit').click());
    expect(api.patch).toHaveBeenCalledWith('/stock/controlled-operations',{
      id:'test-return',action:'credit',supplier_import_id:'test-import',credit_reference:'TEST-CREDIT',credited_amount:12.5,
    });
    expect(button('Record supplier credit')).toBeUndefined();
  });
  it('requires an explicit credit amount instead of silently recording a blank as zero',async()=>{
    await render({operations:[operation],credits:[credit],batches:[],segregated:[],locations:[],financial_entries:[]});
    await change(field('Supplier import to credit'),'test-import');
    await change(field('Credit reference'),'TEST-CREDIT');
    await act(async()=>button('Record supplier credit').click());
    expect(api.patch).not.toHaveBeenCalled();
    expect(container.querySelector('[role=alert]').textContent).toContain('credited amount');
  });
  it('resets entered dispatch quantities to the newly remaining approval after a partial dispatch',async()=>{
    const partial={...operation,status:'approved',lines:[{...operation.lines[0],dispatched_quantity:0}]};
    const data={operations:[partial],credits:[],batches:[],segregated:[],locations:[],financial_entries:[]};
    await render(data,'stock');
    await change(field('Dispatch (0 to skip'),'2');
    await change(field('Dispatch reference'),'TEST-SHIPMENT');
    const result={...partial,status:'partially_dispatched',lines:[{...partial.lines[0],dispatched_quantity:2}]};
    api.patch.mockResolvedValue({operation:result});
    api.get.mockResolvedValue({...data,operations:[result]});
    await act(async()=>button('Dispatch selected quantities').click());
    expect(field('Dispatch (0 to skip').value).toBe('1');
    expect(field('Dispatch (0 to skip').max).toBe('1');
  });
  it('shows recorded debit and credit account names rather than expecting invented amount fields',async()=>{
    await render({operations:[],credits:[],batches:[],segregated:[],locations:[],financial_entries:[
      {id:'test-entry',event:'supplier_credit_variance',debit_account:'return_loss',
        credit_account:'supplier_return_receivable',amount:0.25,reference:'TEST-CN'},
    ]});
    const ledger=[...container.querySelectorAll('section')].find(s=>s.textContent.includes('Supplier return financial entries'));
    expect(ledger.textContent).toContain('return_loss');
    expect(ledger.textContent).toContain('supplier_return_receivable');
    expect(ledger.textContent).toContain('0.25');
  });
});
