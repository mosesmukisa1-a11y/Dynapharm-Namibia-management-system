import {beforeEach,it,expect,vi} from 'vitest';
import handler from '../api/stock/reports/low-stock.js';
import {getStockCostProjection} from '../api/services/stockCostReporting.js';
vi.mock('../api/services/stockCostReporting.js',()=>({getStockCostProjection:vi.fn()}));
vi.mock('../api/services/stockAlertPolicy.js',()=>({getStockAlertPolicy:async()=>({lowStockThreshold:10,expiryWarningDays:90})}));
const invoke=async(query='',user={role:'stock'})=>{
 const res={code:200,setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
 await handler({user,headers:{},method:'GET',url:'/stock/reports/low-stock'+query},res);return res;
};
beforeEach(()=>vi.clearAllMocks());
it('aggregates lots by owner, keeps location namespaces separate and uses available stock',async()=>{
 const row={location:'ondangwa',productName:'TEST',locationType:'branch',qty:8,availableQty:1};
 getStockCostProjection.mockResolvedValue([row,{...row,qty:6,availableQty:2},
  {...row,locationType:'warehouse',qty:15,availableQty:15},
  {...row,locationType:'in_transit',availableQty:0}]);
 const {body}=await invoke('?location=ondangwa');
 expect(body.items).toEqual([expect.objectContaining({type:'branch',currentQty:3,physicalQty:14})]);
});
it('filters branches as well as warehouses and recognizes branch aliases',async()=>{
 getStockCostProjection.mockResolvedValue([{location:'windhoek_cbd',productName:'TEST',locationType:'branch',qty:2,availableQty:0},
 {location:'rundu',productName:'TEST',locationType:'branch',qty:1,availableQty:1}]);
 const {body}=await invoke('?location=townshop');
 expect(body.items).toHaveLength(1);expect(body.items[0]).toMatchObject({location:'townshop',currentQty:0,urgency:'out_of_stock'});
});
it('fails closed on read errors and denies company data to scoped users',async()=>{
 expect((await invoke('',{role:'branch_manager',branch:'townshop'})).code).toBe(403);
 expect(getStockCostProjection).not.toHaveBeenCalled();
 getStockCostProjection.mockRejectedValue(new Error('projection unavailable'));
 const res=await invoke();expect(res.code).toBe(500);expect(res.body.items).toBeUndefined();
});
