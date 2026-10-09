// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeAll,afterAll,beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import Review,{HistoricalRefundLinkForm} from '../client/src/components/HistoricalRefundEvidence';
const mocks=vi.hoisted(()=>({listRefundRequests:vi.fn(),proposeRefundEvidence:vi.fn(),reviewRefundEvidence:vi.fn()}));
vi.mock('../client/src/lib/api',()=>({api:{stock:mocks}}));
const previous=globalThis.React;
let root,host;
beforeAll(()=>{globalThis.React=React;globalThis.IS_REACT_ACT_ENVIRONMENT=true;});
afterAll(()=>{globalThis.React=previous;globalThis.IS_REACT_ACT_ENVIRONMENT=false;});
beforeEach(()=>{vi.clearAllMocks();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const render=component=>act(async()=>root.render(component));
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const click=text=>act(async()=>button(text).click());
const fill=(label,value)=>act(async()=>{
  const node=[...host.querySelectorAll('label')].find(l=>l.textContent.includes(label)).querySelector('input,textarea');
  Object.getOwnPropertyDescriptor(node.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype,'value').set.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
const request={id:'old',sale_reference:'sale-original',status:'pending',quantity:2,reason:'Historical goods returned'};
const allocation={movement_id:'allocation-original',sale_reference:'sale-original',branch_id:'townshop',product_name:'Product',
  batch_no:'LOT',expiry_date:null,quantity:'4',snapshot:{revenue_unit:'12.50',cost_layers:[{quantity:4,source:null}]}};
describe('historical evidence screens',()=>{
  it('blocks ambiguous matches without guessed allocations',async()=>{
    mocks.listRefundRequests.mockResolvedValue({ambiguous:true,candidates:[allocation,{...allocation,movement_id:'other'}]});
    await render(<HistoricalRefundLinkForm refund={request}/>);
    await click('Find frozen sale evidence');
    expect(host.textContent).toContain('Ambiguous original sale allocations');
    expect(button('Submit evidence to GM')).toBeUndefined();
    expect(mocks.proposeRefundEvidence).not.toHaveBeenCalled();
  });
  it('shows unknowns, surfaces stale evidence errors and sends only evidence for GM review',async()=>{
    mocks.listRefundRequests.mockResolvedValue({ambiguous:false,candidates:[allocation]});
    mocks.proposeRefundEvidence.mockRejectedValueOnce(new Error('Original sale evidence changed')).mockResolvedValueOnce({success:true});
    const onChange=vi.fn();await render(<HistoricalRefundLinkForm refund={request} onChange={onChange}/>);
    await click('Find frozen sale evidence');
    expect(button('Submit evidence to GM').disabled).toBe(true);
    expect(host.textContent).toContain('supplier/import Unknown / Unknown');
    await fill('Archived document / receipt reference','Archive document 12');
    await fill('Why this evidence belongs to this request','Compared receipt line');
    await click('Submit evidence to GM');
    expect(host.textContent).toContain('Original sale evidence changed');
    await click('Submit evidence to GM');
    expect(host.textContent).toContain('Evidence proposed for GM review');
    expect(mocks.proposeRefundEvidence).toHaveBeenLastCalledWith('old',{
      sale_reference:'sale-original',allocation_id:'allocation-original',evidence_reference:'Archive document 12',
      proposal_reason:'Compared receipt line',
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it('requires GM notes, separates link approval from physical refund and shows immutable history',async()=>{
    const proposal={id:'proposal',refund_id:'old',status:'proposed',request_snapshot:request,allocation_snapshot:allocation,
      proposed_at:'2026-10-09T00:00:00Z',proposed_by:'stock-actor',evidence_reference:'Old receipt 12',proposal_reason:'Original receipt matched'};
    mocks.listRefundRequests.mockResolvedValueOnce({requests:[request],evidenceHistory:[proposal]}).mockResolvedValue({
      requests:[request],evidenceHistory:[{...proposal,status:'approved',reviewed_by:'gm-actor',review_reason:'Checked original document'}],
    });
    mocks.reviewRefundEvidence.mockResolvedValue({success:true,message:'Linked evidence only'});
    await render(<Review/>);
    expect(button('Approve evidence link only').disabled).toBe(true);
    expect(button('Reject evidence link').disabled).toBe(true);
    await fill('GM review notes','Checked original document');
    await click('Approve evidence link only');
    expect(mocks.reviewRefundEvidence).toHaveBeenCalledWith('old',{proposal_id:'proposal',review_reason:'Checked original document'},true);
    expect(host.textContent).toContain('No historical evidence proposals await GM review.');
    await click('Show immutable review history');
    expect(host.textContent).toContain('reviewer gm-actor');
  });
});
