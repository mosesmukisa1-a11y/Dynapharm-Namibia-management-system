// @vitest-environment node
import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../api/services/stockCostReporting.js',()=>({
  getStockCostProjection:vi.fn(async()=>[
    {location:'townshop',qty:1,unitCIF:2,missingCostQuantity:0},
    {location:'swakopmund',qty:2,unitCIF:5,missingCostQuantity:0},
  ]),
  getSalesCostReport:vi.fn(async()=>[]),
  getSalesCostPage:vi.fn(async()=>({rows:[],total:0,summary:{knownSalesCost:0,missingSalesCostQuantity:0,knownSalesRevenue:0,missingSalesRevenueQuantity:0,grossProfit:0}})),
}));
vi.mock('../api/db.js',()=>({withTransaction:async fn=>fn({query:async()=>({rows:[]})})}));
// This suite tests access/scope, not SQL accounting. Real financial queries are
// exercised by isolated authenticated sale and cost lifecycle suites.
vi.mock('../api/services/stockFinancialReports.js',()=>({
  getSalesReturnsSummary:vi.fn(async()=>({})),
  getWriteOffExpenseSummary:vi.fn(async()=>({})),
}));
vi.mock('../api/services/stockCostAudit.js',()=>({getStockCostAudit:vi.fn(async()=>({
  generatedAt:'2026-10-09T00:00:00Z',records:[],csv:'',saleCount:0,sourceLayerCount:0,
}))}));
import handler from '../api/stock/cost-report.js';
import {getStockCostProjection,getSalesCostReport,getSalesCostPage} from '../api/services/stockCostReporting.js';
import {getStockCostAudit} from '../api/services/stockCostAudit.js';

async function request(user,branch) {
  const output={status:200};
  const res={status(value){output.status=value;return this;},json(body){output.body=body;return this;}};
  await handler({method:'GET',user,url:`/api/stock/cost-report${branch ? `?branchId=${encodeURIComponent(branch)}` : ''}`},res);
  return output;
}

async function auditRequest(user,branch,extra=''){
  const output={status:200};
  await handler({method:'GET',user,url:`/api/stock/cost-report?audit=json${branch?`&branchId=${encodeURIComponent(branch)}`:''}${extra}`},
    {status(value){output.status=value;return this;},json(body){output.body=body;return this;}});
  return output;
}
describe('original-cost reporting entitlement and branch isolation',()=>{
  beforeEach(()=>vi.clearAllMocks());
  it('enforces the same branch scope before querying or exporting audit evidence',async()=>{
    expect((await auditRequest(null,'townshop')).status).toBe(401);
    expect((await auditRequest({role:'member'},'townshop')).status).toBe(403);
    expect((await auditRequest({role:'branch',branch:'townshop'},'swakopmund')).status).toBe(403);
    expect((await auditRequest({role:'branch',branch:'townshop'})).status).toBe(403);
    expect(getStockCostAudit).not.toHaveBeenCalled();
    const own=await auditRequest({role:'branch',branch:'townshop'},'townshop','&location=swakopmund&stockPage=1');
    expect(own.status).toBe(200);
    expect(getStockCostAudit).toHaveBeenCalledWith(expect.objectContaining({
      aliases:expect.arrayContaining(['townshop']),
    }),expect.any(Function));
    expect(getStockCostAudit.mock.calls[0][0].aliases).not.toContain('swakopmund');
  });
  it('requires authentication',async()=>{
    expect((await request(null)).status).toBe(401);
    expect(getStockCostProjection).not.toHaveBeenCalled();
  });
  it.each(['warehouse','warehouse_manager','warehouse_staff','distributor','patient','customer','other',''])(
    'denies non-reporting role %s before loading financial data',async role=>{
      expect((await request({role,branch:'townshop'})).status).toBe(403);
      expect((await request({role,branch:'townshop'},'townshop')).status).toBe(403);
      expect(getStockCostProjection).not.toHaveBeenCalled();
      expect(getSalesCostReport).not.toHaveBeenCalled();
    });
  it.each(['branch','branch_manager','branch_staff','branch_sales','stock_manager','consultant','dispenser','frontdesk'])(
    'requires an assigned and explicitly selected branch for %s',async role=>{
      expect((await request({role},'townshop')).status).toBe(403);
      expect((await request({role,branches:'invalid JSON'},'townshop')).status).toBe(403);
      expect((await request({role,branch:'townshop'})).status).toBe(403);
      expect((await request({role,branch:'townshop'},'swakopmund')).status).toBe(403);
      expect(getStockCostProjection).not.toHaveBeenCalled();
      const own=await request({role,branch:'townshop'},'townshop');
      expect(own.status).toBe(200);
      expect(own.body.stock.map(row=>row.location)).toEqual(['townshop']);
      expect(getSalesCostPage).toHaveBeenCalledWith(expect.objectContaining({aliases:expect.arrayContaining(['townshop'])}),expect.any(Function));
    });
  it.each(['stock','finance','finance_manager','mis','gm','general_manager','director','admin','superadmin','super_admin'])(
    'allows explicitly entitled company role %s',async role=>{
      const result=await request({role});
      expect(result.status).toBe(200);
      expect(result.body.stock).toHaveLength(2);
      expect(result.body.summary.knownStockCost).toBe(12);
    });
});
