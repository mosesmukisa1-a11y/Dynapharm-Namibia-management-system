// @vitest-environment jsdom
import {beforeEach,describe,it,expect,vi} from 'vitest';
beforeEach(()=>{localStorage.clear();vi.resetModules();});
describe('active price cache refresh',()=>{
  it('preserves product codes and does not emit a refresh loop for identical data',async()=>{
    const cache=await import('../client/src/lib/pricing.js');
    const changed=vi.fn();window.addEventListener('dynapharm-prices-updated',changed);
    const prices=[{id:1,description:'TEST TEA',product_code:'NB1201',dp:'100',cp:'130',cif:'70',bv:'10'}];
    cache.setLivePrices(prices);cache.setLivePrices(prices);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(cache.getLiveProductList()[0].product_code).toBe('NB1201');
    cache.setLivePrices([{...prices[0],dp:200}]);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(cache.findProductPrice('TEST TEA').dp).toBe(200);
    window.removeEventListener('dynapharm-prices-updated',changed);
  });
  it('clears both memory and persisted prices for a legitimate empty active catalogue',async()=>{
    const cache=await import('../client/src/lib/pricing.js');
    cache.setLivePrices([{id:1,description:'TEST TEA',dp:100}]);
    cache.setLivePrices([]);
    expect(cache.getLiveProductList()).toEqual([]);
    expect(JSON.parse(localStorage.getItem('dynapharm_prices_v1'))).toEqual([]);
    expect(cache.pricesLoaded()).toBe(false);
  });
  it('resolves preserved stock aliases without guessing between distinct codes',async()=>{
    const cache=await import('../client/src/lib/pricing.js');
    cache.setLivePrices([{id:1,description:"NB1201 TEA (30'S)",product_code:'NB1201',aliases:["TEA 30'S"],dp:200}]);
    expect(cache.findProductPrice("tea 30’s").dp).toBe(200);
    cache.setLivePrices([{id:1,description:"TEA (30'S)",product_code:'NB1201',dp:200},
      {id:2,description:"TEA 30'S",product_code:'NB1202',dp:300}]);
    expect(cache.findProductPrice("tea 30’s")).toBeNull();
  });
});
