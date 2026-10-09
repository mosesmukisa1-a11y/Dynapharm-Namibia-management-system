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
function serve(data) {
  api.get.mockImplementation(async url=>{
    const params=new URLSearchParams(url.split('?')[1]);
    if(params.has('operation_id')) return {
      operation:data.operations.find(op=>op.id===params.get('operation_id')),credits:data.credits || [],financial_entries:data.financial_entries || [],
    };
    return {...data,operations:(data.operations || []).map(({lines,...op})=>({...op,line_count:lines.length}))};
  });
}
async function render(data,mode='finance',open=true) {
  serve(data);
  await act(async()=>{root.render(<ControlledStockOperations mode={mode}/>);});
  if(open && data.operations?.length) await act(async()=>button(`#${data.operations[0].id}`).click());
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
    expect(container.querySelectorAll('select')).toHaveLength(3);
    const ledger=[...container.querySelectorAll('section')].find(s=>s.textContent.includes('Supplier credit ledger'));
    expect(ledger.textContent).toContain('12.75');expect(ledger.textContent).toContain('—');
    await change(field('Supplier import to credit'),'test-import');
    await change(field('Credit reference'),'TEST-CREDIT');
    await change(field('Credited amount'),'12.50');
    api.patch.mockResolvedValue({operation:{...operation,status:'credited'}});
    serve({...data,operations:[{...operation,status:'credited'}],credits:[{...credit,status:'credited',credited_amount:12.5}]});
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
    serve({...data,operations:[result]});
    await act(async()=>button('Dispatch selected quantities').click());
    expect(field('Dispatch (0 to skip').value).toBe('1');
    expect(field('Dispatch (0 to skip').max).toBe('1');
  });
  it('shows recorded debit and credit account names rather than expecting invented amount fields',async()=>{
    await render({operations:[operation],credits:[],batches:[],segregated:[],locations:[],financial_entries:[
      {id:'test-entry',event:'supplier_credit_variance',debit_account:'return_loss',
        credit_account:'supplier_return_receivable',amount:0.25,reference:'TEST-CN'},
    ]});
    const ledger=[...container.querySelectorAll('section')].find(s=>s.textContent.includes('Supplier return financial entries'));
    expect(ledger.textContent).toContain('return_loss');
    expect(ledger.textContent).toContain('supplier_return_receivable');
    expect(ledger.textContent).toContain('0.25');
  });

  it('keeps selected zero-quantity count lines visible and submits them after a search returns no results',async()=>{
    const batch={id:'zero',batch_type:'branch',location:'townshop',product_name:'Zero product',batch_no:'ZERO-LOT',
      quantity:0,available_quantity:0,condition:'saleable',expiry_date:'2030-01-01'};
    const data={operations:[],batches:[batch],segregated:[],locations:['townshop'],
      batch_pagination:{page:1,page_size:1,total:2,total_pages:2}};
    await render(data,'stock',false);
    await act(async()=>container.querySelector('input[type=checkbox]').click());
    await change(field('Session reason'),'Monthly count');
    serve({...data,batches:[],batch_pagination:{page:1,page_size:1,total:0,total_pages:0}});
    await change(field('Batch search'),'No matching product');
    await act(async()=>button('Apply batch filters').click());
    const pinned=container.querySelector('[aria-label="Selected session lines"]');
    expect(pinned.textContent).toContain('Zero product');
    expect(pinned.querySelector('input[type=checkbox]').checked).toBe(true);
    expect(button('Save count cutoff draft').disabled).toBe(false);
    api.post.mockResolvedValue({operation:{id:'new-count'}});
    await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(api.post).toHaveBeenCalledWith('/stock/controlled-operations',{
      kind:'count',reason:'Monthly count',lines:[{batch_type:'branch',batch_id:'zero'}],
    });
  });

  it('does not request credit or journal detail until a register card is opened',async()=>{
    await render({operations:[operation],batches:[],segregated:[],locations:[],credits:[credit]},'finance',false);
    expect(api.get.mock.calls.every(([url])=>!url.includes('operation_id='))).toBe(true);
    expect(button('Record supplier credit')).toBeUndefined();
    await act(async()=>button('#test-return').click());
    expect(api.get).toHaveBeenCalledWith('/stock/controlled-operations?operation_id=test-return');
    expect(button('Record supplier credit')).toBeDefined();
  });

  it('uses independent operation search, status and page controls',async()=>{
    const data={operations:[operation],batches:[],segregated:[],locations:['test_warehouse'],
      operation_pagination:{page:1,page_size:1,total:2,total_pages:2}};
    await render(data,'finance',false);
    await change(field('Operation search'),'Test product');
    await change(field('Operation status'),'partially_reviewed');
    await change(field('Operation location'),'test_warehouse');
    await act(async()=>button('Apply operation filters').click());
    const filtered=api.get.mock.calls.map(([url])=>url).find(url=>url.includes('operation_search=Test+product'));
    expect(filtered).toContain('operation_status=partially_reviewed');
    expect(filtered).toContain('location=test_warehouse');
    await act(async()=>button('Next operations page').click());
    expect(api.get.mock.calls.at(-1)[0]).toContain('operation_page=2');
  });

  it('offers partial-review and partial-dispatch actions only after their lines load',async()=>{
    const partial={...operation,status:'partially_reviewed',lines:[
      {...operation.lines[0],dispatched_quantity:1},
      {...operation.lines[0],id:'pending-line',status:'pending',approved_quantity:null,dispatched_quantity:0},
    ]};
    await render({operations:[partial],batches:[],segregated:[],locations:[]},'gm',false);
    expect(button('Approve line')).toBeUndefined();
    expect(button('Dispatch selected quantities')).toBeUndefined();
    await act(async()=>button('#test-return').click());
    expect(button('Approve line')).toBeDefined();
    expect(field('Dispatch (0 to skip').max).toBe('2');
    expect(button('Dispatch selected quantities')).toBeDefined();
  });

  it('shows detail failures with a retry rather than acting on missing evidence',async()=>{
    const data={operations:[operation],batches:[],segregated:[],locations:[]};
    await render(data,'finance',false);
    api.get.mockRejectedValueOnce(new Error('Detail unavailable'));
    await act(async()=>button('#test-return').click());
    expect(container.querySelector('[role=alert]').textContent).toContain('Detail unavailable');
    expect(button('Record supplier credit')).toBeUndefined();
    serve({...data,credits:[credit]});
    await act(async()=>button('Retry operation detail').click());
    expect(button('Record supplier credit')).toBeDefined();
  });

  it('retains selected line quantities and reasons across locations and batch pages',async()=>{
    const batch={id:'positive',batch_type:'warehouse',location:'test_warehouse',product_name:'Selected product',batch_no:'LOT',
      quantity:10,available_quantity:10,condition:'saleable',expiry_date:'2030-01-01',supplier_name:'Supplier',unit_cost:4.25,source_batch_id:'source'};
    const data={operations:[],batches:[batch],segregated:[],locations:['test_warehouse','other_warehouse'],
      batch_pagination:{page:1,page_size:1,total:2,total_pages:2}};
    await render(data,'stock',false);
    await act(async()=>button('Supplier return').click());
    await act(async()=>container.querySelector('input[type=checkbox]').click());
    await change(field('Quantity (base units)'),'3');
    await change(field('Line reason'),'Damaged packaging');
    serve({...data,batches:[],batch_pagination:{page:2,page_size:1,total:2,total_pages:2}});
    await act(async()=>button('Next batches page').click());
    expect(field('Quantity (base units)').value).toBe('3');
    expect(field('Line reason').value).toBe('Damaged packaging');
    await change(field('Batch location'),'other_warehouse');
    await act(async()=>button('Apply batch filters').click());
    expect(field('Quantity (base units)').value).toBe('3');
    expect(container.querySelector('[aria-label="Selected session lines"]').textContent).toContain('Selected product');
    await act(async()=>container.querySelector('[aria-label="Selected session lines"] input[type=checkbox]').click());
    expect(container.querySelector('[aria-label="Selected session lines"]')).toBeNull();
  });

  it('ignores an older search response that arrives after the current search page',async()=>{
    const data={operations:[],batches:[],segregated:[],locations:[]};
    await render(data,'stock',false);
    let releaseOldBatch,releaseOldOperations;
    api.get.mockImplementationOnce(()=>new Promise(resolve=>{releaseOldBatch=resolve;}))
      .mockImplementationOnce(()=>new Promise(resolve=>{releaseOldOperations=resolve;}));
    await change(field('Batch search'),'Old search');
    await act(async()=>button('Apply batch filters').click());
    serve({...data,batches:[{id:'new',batch_type:'warehouse',product_name:'Newest result',quantity:0,condition:'saleable'}]});
    await change(field('Batch search'),'New search');
    await act(async()=>button('Apply batch filters').click());
    await act(async()=>{
      releaseOldBatch({...data,batches:[{id:'old',batch_type:'warehouse',product_name:'Stale result',quantity:0,condition:'saleable'}]});
      releaseOldOperations(data);
    });
    expect(container.textContent).toContain('Newest result');
    expect(container.textContent).not.toContain('Stale result');
  });
});
