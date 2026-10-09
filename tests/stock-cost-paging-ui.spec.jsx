// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
vi.mock('../client/src/lib/api',()=>({api:{stock:{costReport:vi.fn(),costAudit:vi.fn()}}}));
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
it('downloads complete evidence with the loaded scope, retains decimal strings and retries download errors',async()=>{
  const previousReact=globalThis.React;globalThis.React=React;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  api.stock.costReport.mockReset();api.stock.costAudit.mockReset();
  api.stock.costReport.mockResolvedValue({stock:[],sales:[],summary:{},pagination:{stock:{page:1,pages:1},sales:{page:1,pages:1}}});
  const content='{"exact_received_unit_cif":"0.123456789012345678901"}';
  api.stock.costAudit.mockRejectedValueOnce(new Error('Narrow the date filters')).mockResolvedValueOnce({
    content,mimeType:'application/json',filename:'audit.json',metadata:{saleCount:1,sourceLayerCount:2},
  });
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
  URL.createObjectURL=vi.fn(()=>'blob:audit');URL.revokeObjectURL=vi.fn();
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{
    await act(async()=>root.render(<StockCostReport branchId="townshop"/>));
    const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
    expect(button('Download sale audit').disabled).toBe(true);
    await act(async()=>button('Load report').click());
    await act(async()=>button('Download sale audit').click());
    expect(host.textContent).toContain('Narrow the date filters');
    await act(async()=>button('Retry download').click());
    expect(api.stock.costReport).toHaveBeenCalledTimes(1);
    expect(api.stock.costAudit).toHaveBeenLastCalledWith(expect.objectContaining({branchId:'townshop',productName:''}),'json');
    expect(host.textContent).toContain('Downloaded evidence for 1 sales and 2 source layers.');
    const blob=URL.createObjectURL.mock.calls[0][0];
    const text=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(blob);});
    expect(text).toBe(content);expect(click).toHaveBeenCalledTimes(1);
  }finally{
    await act(async()=>root.unmount());host.remove();click.mockRestore();globalThis.React=previousReact;
    URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;
  }
});
