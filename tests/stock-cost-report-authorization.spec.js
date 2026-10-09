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
import handler from '../api/stock/cost-report.js';
import {getStockCostProjection,getSalesCostReport,getSalesCostPage} from '../api/services/stockCostReporting.js';

async function request(user,branch) {
  const output={status:200};
  const res={status(value){output.status=value;return this;},json(body){output.body=body;return this;}};
  await handler({method:'GET',user,url:`/api/stock/cost-report${branch ? `?branchId=${encodeURIComponent(branch)}` : ''}`},res);
  return output;
}

describe('original-cost reporting entitlement and branch isolation',()=>{
  beforeEach(()=>vi.clearAllMocks());
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
