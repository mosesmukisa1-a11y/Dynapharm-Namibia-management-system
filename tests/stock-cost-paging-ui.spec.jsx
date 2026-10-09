// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
vi.mock('../client/src/lib/api',()=>({api:{stock:{costReport:vi.fn()}}}));
import {api} from '../client/src/lib/api';
import StockCostReport from '../client/src/components/StockCostReport';

it('keeps full-scope warnings visible and requests independent detail pages',async()=>{
  const previousReact=globalThis.React;globalThis.React=React;
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const report={stock:[],sales:[],summary:{missingSalesCostQuantity:2,grossProfit:null},
    pagination:{stock:{page:1,pages:3,total:250},sales:{page:1,pages:2,total:150}}};
  api.stock.costReport.mockResolvedValueOnce(report).mockResolvedValueOnce({
    ...report,pagination:{...report.pagination,stock:{...report.pagination.stock,page:2}},
  });
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{
    await act(async()=>root.render(<StockCostReport branchId="townshop"/>));
    const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
    await act(async()=>button('Load report').click());
    expect(host.textContent).toContain('Incomplete revenue or costs');
    await act(async()=>button('Next stock').click());
    expect(api.stock.costReport).toHaveBeenLastCalledWith(expect.objectContaining({
      branchId:'townshop',stockPage:2,salesPage:1,pageSize:100,
    }));
    expect(host.textContent).toContain('Page 2 of 3');
    expect(host.textContent).toContain('Incomplete revenue or costs');
    expect(host.textContent).toContain('Totals and warnings cover all matching rows');
  }finally{await act(async()=>root.unmount());host.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    if(previousReact===undefined)delete globalThis.React;else globalThis.React=previousReact;}
});
