// @vitest-environment node
import {it,expect} from 'vitest';
import {getStockCostProjection} from '../api/services/stockCostReporting.js';

it('labels zero without approval as missing and preserves explicitly approved zero and decimal source layers',async()=>{
  const source=(id,metadata={})=>({id,description:'SYNTHETIC',remaining_quantity:2,location:'country_stock',
    cif_unit_cost:'0',dpc_unit_value:'0',metadata});
  const rows=await getStockCostProjection({},async()=>[{stock:[
    source('missing'),source('approved',{zeroCostApproved:true}),
    {...source('fraction'),cif_unit_cost:'0.123456789',dpc_unit_value:'1.23456789'}
  ],branches:[],reservations:[],segregated:[]}]);
  expect(rows[0]).toMatchObject({unitCIF:null,unitDPC:null,missingCostQuantity:2,missingDPCQuantity:2});
  expect(rows[1]).toMatchObject({unitCIF:0,unitDPC:0,zeroCostApproved:true,missingCostQuantity:0,missingDPCQuantity:0});
  expect(rows[2]).toMatchObject({unitCIF:0.123456789,unitDPC:1.23456789,missingCostQuantity:0,missingDPCQuantity:0});
});
