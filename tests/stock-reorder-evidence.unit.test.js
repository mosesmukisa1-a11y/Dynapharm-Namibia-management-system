import {beforeEach,it,expect,vi} from 'vitest';
import handler from '../api/stock/ai-reorder.js';
import {getMany} from '../api/db.js';
import {getStockCostProjection} from '../api/services/stockCostReporting.js';
vi.mock('../api/db.js',()=>({getMany:vi.fn()}));
vi.mock('../api/services/stockCostReporting.js',()=>({getStockCostProjection:vi.fn()}));
const invoke=async(query)=>{
 const res={code:200,setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
 await handler({method:'GET',url:'/stock/ai-reorder'+query,headers:{host:'test'},user:{role:'stock'}},res);return res;
};
beforeEach(()=>{vi.clearAllMocks();getMany.mockResolvedValue([]);getStockCostProjection.mockResolvedValue([]);});
it('flags unavailable held stock without fabricating an order or zero-demand stock cover',async()=>{
 getStockCostProjection.mockResolvedValue([{productName:'HELD',location:'townshop',availableQty:0,qty:20}]);
 const {body}=await invoke('?branchId=townshop');
 expect(body.suggestions[0]).toMatchObject({currentQty:0,daysRemaining:0,urgency:'out_of_stock',recommendedReorderQty:null});
});
it.each(['30junk','1.5','0','366'])('rejects an invalid demand window %s before reading data',async days=>{
 expect((await invoke('?days='+days)).code).toBe(400);expect(getMany).not.toHaveBeenCalled();
});
