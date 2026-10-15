import {expect,it} from 'vitest';
import {originalChargedMargin} from '../client/src/lib/originalChargedMargin.js';
it('uses original net charged revenue, never DP revenue',()=>{
 const f={financialComplete:true,grossProfitAfterReturns:'2940',netSalesRevenue:'3101',netSalesDP:'2387'};
 expect(originalChargedMargin(f).toFixed(1)).toBe('94.8');
});
it('uses net-after-return profit and revenue on an equal basis',()=>{
 expect(originalChargedMargin({financialComplete:true,grossProfitAfterReturns:42,netSalesRevenue:54,grossSalesRevenue:72})).toBeCloseTo(77.777777);
});
it('does not manufacture zero or an estimate for incomplete or undefined evidence',()=>{
 for(const f of [null,{}, {financialComplete:false,grossProfitAfterReturns:42,netSalesRevenue:54},
  {financialComplete:true,grossProfitAfterReturns:null,netSalesRevenue:54},
  {financialComplete:true,grossProfitAfterReturns:0,netSalesRevenue:0},
  {financialComplete:true,grossProfitAfterReturns:42,netSalesRevenue:'unavailable'}])expect(originalChargedMargin(f)).toBeNull();
});
