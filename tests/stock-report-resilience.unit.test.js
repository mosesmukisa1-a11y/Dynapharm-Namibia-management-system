// @vitest-environment node
import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../api/db.js',()=>({getOne:vi.fn(),getMany:vi.fn(async()=>[]),query:vi.fn()}));
import {getOne,getMany} from '../api/db.js';
import summary from '../api/stock/reports/summary.js';
import company from '../api/stock/reports/company.js';
import precomputed from '../api/stock/reports/precomputed.js';
import batches from '../api/stock-batches.js';
import {storedFreshness} from '../api/services/stockReportFreshness.js';
const invoke=async(handler,path,user={id:'synthetic-stock',role:'stock'})=>{
 const out={status:200},res={setHeader(){},status(s){out.status=s;return this;},json(b){out.body=b;return this;},end(){}};
 await handler({method:'GET',url:path,headers:{host:'localhost'},user},res);return out;
};
beforeEach(()=>{vi.clearAllMocks();getOne.mockResolvedValue(null);getMany.mockResolvedValue([]);});
for(const [name,handler,path]of [
 ['branch summary',summary,'/api/stock/reports/summary?period=2026-10-14'],
 ['company summary',company,'/api/stock/reports/company?period=2026-10-14'],
 ['precomputed',precomputed,'/api/stock/reports/precomputed?period_key=2026-10-14'],
]){
 it(name+' denies unauthenticated/branch/unrelated roles before SQL',async()=>{
   for(const user of [null,{role:'branch',branch:'townshop'},{role:'consultant'},{role:'distributor'}]){
     const r=await invoke(handler,path,user);expect(r.status).toBe(user?403:401);
   }
   expect(getOne).not.toHaveBeenCalled();expect(getMany).not.toHaveBeenCalled();
 });
 it(name+' labels stored snapshots without mixing estimate and original-evidence fields',async()=>{
   getOne.mockResolvedValue({report_data:{cost_basis:'received_batches_v1',originalCogs:null,
     originalCostEvidenceComplete:false,estimatedDp:99,missingOriginalCostQuantity:4},computed_at:'2026-10-14T22:00:00Z'});
   const r=await invoke(handler,path);
   expect(r.status).toBe(200);expect(r.body.freshness).toMatchObject({state:'last-generated',isLive:false,generatedAt:'2026-10-14T22:00:00.000Z'});
   const data=r.body.data||r.body;expect(data.originalCogs).toBeNull();expect(data.estimatedDp).toBe(99);
   expect(data.missingOriginalCostQuantity).toBe(4);
 });
 it(name+' missing period is unavailable, never an all-time substitute or zero',async()=>{
   const r=await invoke(handler,path);expect([404,503]).toContain(r.status);expect(r.body.success).toBe(false);
   expect(getMany).not.toHaveBeenCalled();
 });
 it(name+' refuses invalid generation timestamp',async()=>{
   getOne.mockResolvedValue({report_data:{cost_basis:'received_batches_v1'},computed_at:null});
   expect((await invoke(handler,path)).status).toBe(503);
 });
}
it('latest-list empty success is not reported as zero stock',async()=>{
 expect((await invoke(precomputed,'/api/stock/reports/precomputed')).status).toBe(503);
});
it('central batch API is not public or cross-branch-readable',async()=>{
 expect((await invoke(batches,'/api/stock-batches',null)).status).toBe(401);
 expect((await invoke(batches,'/api/stock-batches',{role:'branch',branch:'townshop'})).status).toBe(403);
 expect(getOne).not.toHaveBeenCalled();expect(getMany).not.toHaveBeenCalled();
});
it('invalid/future evidence timestamps cannot masquerade as live',()=>{
 expect(storedFreshness('bad').state).toBe('unavailable');
 expect(storedFreshness('2026-10-15T00:00:00Z').isLive).toBe(false);
});
