import {it,expect} from 'vitest';
import {stockOverviewLocation} from '../client/src/lib/stockOverviewLocation.js';
import {api} from '../client/src/lib/api.js';
it('uses the exposed shared GET client for current-overview requests',()=>{
  expect(typeof api.get).toBe('function');
});
it('scopes typed owner IDs while retaining held stock and missing-cost flags',()=>{
  const data={summary:{totalQtyUnits:8},products:[{locations:[
    {locationId:'townshop',locationType:'branch',qty:3,valueDP:21,valueCIF:6,availableQty:0,quarantinedQty:3},
    {locationId:'windhoek_warehouse',locationType:'warehouse',qty:5,valueDP:0,missingDPQuantity:5,availableQty:5}
  ]}]};
  expect(stockOverviewLocation(data,'all')).toBe(data.summary);
  expect(stockOverviewLocation(data,'townshop')).toMatchObject({totalQtyUnits:3,totalValueDP:21,availableQty:0,quarantinedQty:3,valuationComplete:true});
  expect(stockOverviewLocation(data,'windhoek_warehouse')).toMatchObject({totalQtyUnits:5,missingDPQuantity:5,valuationComplete:false});
  expect(stockOverviewLocation(null)).toBeNull();
});
