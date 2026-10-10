import {it,expect} from 'vitest';
import {stockCartQuantity,validStockCart} from '../client/src/lib/stockCartQuantity.js';
it('retains the selected product while its quantity is cleared and retyped',()=>{
  const initial=[{description:'TEST-ITEM',qty:1,dp:7,cif:2}];
  const empty=stockCartQuantity(initial,'TEST-ITEM','');
  expect(empty).toHaveLength(1);
  expect(empty[0].qty).toBe('');
  expect(validStockCart(empty)).toBe(false);
  const filled=stockCartQuantity(empty,'TEST-ITEM','30');
  expect(filled[0]).toMatchObject({qty:30,dp:7,cif:2});
  expect(validStockCart(filled)).toBe(true);
  expect(initial[0].qty).toBe(1);
});
it('rejects zero, negative, fractional and nonnumeric quantities without deleting selection',()=>{
  for(const value of ['0','-1','1.5','abc']){
    const cart=stockCartQuantity([{description:'TEST-ITEM',qty:1}],'TEST-ITEM',value);
    expect(cart).toHaveLength(1);
    expect(validStockCart(cart)).toBe(false);
  }
});
