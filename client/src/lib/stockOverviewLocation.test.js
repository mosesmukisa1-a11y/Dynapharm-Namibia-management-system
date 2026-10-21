import {it,expect} from 'vitest';
import {stockOverviewLocation} from './stockOverviewLocation.js';
it('keeps branch aliases aligned with selected navigation without absorbing a warehouse namespace',()=>{
 const data={summary:{totalQtyUnits:99},products:[{locations:[
 {locationId:'windhoek_cbd',locationType:'branch',qty:3,valueDP:21},
 {locationId:'windhoek',locationType:'warehouse',qty:20,valueDP:140}]}]};
 expect(stockOverviewLocation(data,'townshop')).toMatchObject({totalQtyUnits:3,totalValueDP:21});
 expect(stockOverviewLocation(data,'all')).toBe(data.summary);
});
