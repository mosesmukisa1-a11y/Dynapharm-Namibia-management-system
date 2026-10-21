import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('../client/src/lib/api',()=>({api:{get:vi.fn(),prices:{list:vi.fn()},stock:Object.fromEntries(['batches','movements','transfers','supplierImports','fieldStock','countryStock'].map(k=>[k,vi.fn()])),branch:{stockSummary:vi.fn()}}}));
vi.mock('../client/src/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'TEST',role:'stock'}})}));
vi.mock('../client/src/components/StockAlertPolicyProvider',()=>({default:({children})=>children,useStockAlertPolicy:()=>({lowStockThreshold:10,expiryWarningDays:90})}));
vi.mock('../client/src/hooks/useStockRealtime',()=>({useStockRealtime:()=>{}}));
import {SmartReorderTab,OverviewTab} from '../client/src/pages/portals/StockPortal.jsx';
import {api} from '../client/src/lib/api';
let root,host;
const render=async(branch='townshop')=>act(async()=>root.render(<SmartReorderTab branch={branch}/>));
const reply=(name,qty=2)=>({success:true,suggestions:[{productName:name,currentQty:qty,avgDailyUsage:0,daysRemaining:999,recommendedReorderQty:null}]});
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);api.get.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it('shows a failed read as an error with retry instead of healthy or empty inventory',async()=>{
 api.get.mockRejectedValue(new Error('Evidence unavailable'));await render();
 expect(host.querySelector('[role="alert"]').textContent).toContain('Evidence unavailable');
 expect(host.textContent).not.toContain('No products');
 api.get.mockResolvedValue(reply('TEST-RECOVERY'));
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Retry').click());
 expect(host.querySelector('[role="alert"]')).toBeNull();
});
it('never lets an old branch response replace the currently selected branch evidence',async()=>{
 let resolve;api.get.mockReturnValueOnce(new Promise(r=>resolve=r)).mockResolvedValueOnce(reply('NEW-BRANCH',0));
 await render('townshop');await render('rundu');
 expect(host.textContent).toContain('NEW-BRANCH');
 await act(async()=>resolve(reply('OLD-BRANCH',0)));
 expect(host.textContent).not.toContain('OLD-BRANCH');
 expect(api.get).toHaveBeenLastCalledWith('/stock/ai-reorder?branchId=rundu');
});
it('requires a manually entered order quantity for zero-demand out-of-stock products',async()=>{
 api.get.mockResolvedValue(reply('TEST-ZERO-DEMAND',0));await render();
 expect(host.textContent).toContain('Manual review');
 const order=[...host.querySelectorAll('button')].find(b=>/Order from Supplier/.test(b.textContent));
 expect(order).toBeTruthy();await act(async()=>order.click());
 const input=host.querySelector('input[type="number"]');expect(input.value).toBe('');
 expect(host.textContent).not.toContain('covers 6 months');
});

it('uses original-cost projection in overview cards and shows failed reads instead of zero balances',async()=>{
 api.prices.list.mockResolvedValue([]);
 Object.values(api.stock).forEach(fn=>fn.mockResolvedValue([]));
 api.branch.stockSummary.mockResolvedValue({branches:[]});
 api.get.mockResolvedValue({summary:{totalQtyUnits:7,totalValueCIF:14,totalValueDP:49,missingCostQuantity:1,missingDPQuantity:1},products:[]});
 await act(async()=>root.render(<OverviewTab branch="all"/>));
 expect(host.textContent).toContain('Known original CIF subtotal');
 expect(host.textContent).toContain('Known original DP subtotal');
 api.get.mockRejectedValue(new Error('Projection unavailable'));
 await act(async()=>root.render(<OverviewTab key="fresh" branch="all"/>));
 expect(host.querySelector('[role="alert"]').textContent).toContain('Projection unavailable');
 expect(host.textContent).not.toContain('Total Stock Units');
});
