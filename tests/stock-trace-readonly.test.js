import { beforeEach, it, expect, vi } from 'vitest';
import trace from '../api/stock/trace.js';
import { getMany, getOne } from '../api/db.js';
vi.mock('../api/db.js',()=>({getMany:vi.fn(),getOne:vi.fn()}));
const reply=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},setHeader:vi.fn(),end:vi.fn()});
beforeEach(()=>{
  vi.clearAllMocks();
  getOne.mockResolvedValue({name:'available'});
  getMany.mockImplementation(async sql=>{
    if(sql.includes('supplier_imports'))return [{record:{id:'QA-IMPORT',import_reference:'QA-20261014-001',product_name:'TEST',
      created_at:'2026-10-14T08:00:00Z',destination_warehouse:'country_stock',date_received:'2026-10-14',status:'received'}}];
    if(sql.includes('stock_transfers'))return [{record:{id:'QA-TRANSFER',to_branch:'townshop',created_at:'2026-10-14T09:00:00Z',
      gm_approved_at:'2026-10-14T10:00:00Z',gm_approved_by:'Synthetic GM',received_at:'2026-10-14T12:00:00Z',status:'received'}}];
    return [{id:'AUDIT',record_id:'QA-SALE',branch_id:'townshop',created_at:'2026-10-14T12:00:00Z',
      details:{receiptNumber:'TU-2026-000122',businessDate:'2026-10-14',dpTotal:341,chargedTotal:443,branchProfitTotal:102}}];
  });
});
const request=(user={role:'stock',id:'synthetic'},url='/api/stock/trace?search=QA-20261014-001',method='GET')=>({user,url,method,headers:{}});
it('requires staff authentication and never accepts transaction methods',async()=>{
  for(const [user,method,status] of [[null,'GET',401],[{role:'distributor'},'GET',403],[{role:'stock'},'POST',405]]){
    const res=reply(); await trace(request(user,undefined,method),res);expect(res.statusCode).toBe(status);
  }
  expect(getMany).not.toHaveBeenCalled();
});
it('returns original recorded timeline and separate sales bases using read-only SELECT sources',async()=>{
  const res=reply();await trace(request(),res);
  expect(res.statusCode).toBe(200);expect(res.body.readOnly).toBe(true);
  expect(res.body.events.map(e=>e.type)).toContain('GM approval');
  expect(res.body.events.find(e=>e.source==='sale_audit')).toMatchObject({receipt:'TU-2026-000122',dpValue:341,chargedValue:443,branchProfit:102});
  expect(getMany.mock.calls.every(([sql])=>sql.trim().startsWith('SELECT'))).toBe(true);
  expect(getMany.mock.calls.find(([sql])=>sql.includes('stock_transfers'))[0]).toContain('item.transfer_id=t.id');
});
it('denies foreign branch and excludes warehouse imports from scoped staff trace',async()=>{
  const user={role:'branch_manager',branch:'townshop',id:'synthetic'};
  const denied=reply();await trace(request(user,'/api/stock/trace?search=QA-TEST&branch=swakopmund'),denied);
  expect(denied.statusCode).toBe(403);expect(getMany).not.toHaveBeenCalled();
  const res=reply();await trace(request(user,'/api/stock/trace?search=QA-TEST'),res);
  expect(res.statusCode).toBe(200);expect(getMany.mock.calls.some(([sql])=>sql.includes('supplier_imports'))).toBe(false);
  expect(getMany.mock.calls.every(([,params])=>params[1]?.includes('townshop'))).toBe(true);
  expect(getMany.mock.calls.find(([sql])=>sql.includes('mis_sales_audit'))[0]).toContain("details->>'branch'");
  expect(res.body.gaps.join(' ')).toContain('excluded');
});
it('reports missing sources rather than manufacturing imports or sales',async()=>{
  getOne.mockResolvedValue({name:null});const res=reply();await trace(request(),res);
  expect(res.statusCode).toBe(200);expect(res.body.events).toEqual([]);expect(res.body.gaps).toHaveLength(3);
  expect(getMany).not.toHaveBeenCalled();
});
