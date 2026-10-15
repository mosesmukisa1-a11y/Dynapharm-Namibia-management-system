import {it,expect} from 'vitest';
import {withCapturedReceiptDP as project} from '../api/services/saleReceiptPricing.js';
const sales=[{id:'S1',products:[{product_name:'ITEM',quantity:2,dpPrice:999,unit_price:443}],total:886}];
const fact={reference_id:'S1',product_name:'ITEM',quantity:2,dp_unit_price:341};
it('uses frozen captured DP after reload without changing raw records, CP or total',()=>{
 const result=project(sales,[fact]);
 expect(result[0].products[0]).toMatchObject({dpPrice:341,unit_price:443});
 expect(result[0].total).toBe(886);expect(sales[0].products[0].dpPrice).toBe(999);
 expect(result[0].dpEvidence).toBe('captured_sale_dp');
});
it('combines source layers, but refuses conflicting or incomplete evidence',()=>{
 expect(project(sales,[{...fact,quantity:1},{...fact,quantity:1}])[0].products[0].dpPrice).toBe(341);
 for(const facts of [[],[{...fact,quantity:1}],[fact,{...fact,quantity:0,dp_unit_price:400}]]){
  expect(project(sales,facts)[0].dpEvidence).toBe('legacy_or_incomplete_dp_evidence');
  expect(project(sales,facts)[0].products[0].dpPrice).toBe(999);
 }
});
