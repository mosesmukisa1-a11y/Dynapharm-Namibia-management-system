import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import handler from '../api/stock/reports/expiry.js';
import {getStockCostProjection} from '../api/services/stockCostReporting.js';
vi.mock('../api/services/stockCostReporting.js',()=>({getStockCostProjection:vi.fn()}));
vi.mock('../api/services/stockAlertPolicy.js',()=>({getStockAlertPolicy:async()=>({expiryWarningDays:90})}));
const invoke=async(user={role:'stock'},query='')=>{
 const res={code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
 await handler({user,method:'GET',url:'/api/stock/reports/expiry'+query},res);return res;
};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-21T22:30:00Z'));vi.clearAllMocks();});
afterEach(()=>vi.useRealTimers());
it('uses the Namibian day, retains explicit location types and exposes missing value/expiry evidence',async()=>{
 const row={location:'ondangwa',locationType:'warehouse',qty:2,unitDPC:7,missingDPCQuantity:0};
 getStockCostProjection.mockResolvedValue([
  {...row,expiryDate:'2026-10-21'}, {...row,locationType:'branch',expiryDate:'2026-10-22',unitDPC:null,missingDPCQuantity:2},
  {...row,expiryDate:'2026-02-30'}, {...row,expiryDate:null}, {...row,expiryDate:'2026-10-20',qty:0}
 ]);
 const {body}=await invoke();
 expect(body.asOf).toBe('2026-10-22');expect(body.expired).toHaveLength(1);
 expect(body.expired[0]).toMatchObject({type:'warehouse',valueAtRisk:14,daysUntilExpiry:-1});
 expect(body.branchExpiringSoon[0]).toMatchObject({valueAtRisk:null,daysUntilExpiry:0});
 expect(body.summary).toMatchObject({missingExpiryQuantity:4,valuationComplete:false,missingCostQuantity:2});
});
it('denies unauthenticated and branch-scoped users before reading company stock',async()=>{
 expect((await invoke(null)).code).toBe(401);
 expect((await invoke({role:'branch_manager',branch:'townshop'})).code).toBe(403);
 expect(getStockCostProjection).not.toHaveBeenCalled();
});
it('rejects invalid expiry windows',async()=>{
 expect((await invoke({role:'stock'},'?days=-1')).code).toBe(422);
 expect(getStockCostProjection).not.toHaveBeenCalled();
});
