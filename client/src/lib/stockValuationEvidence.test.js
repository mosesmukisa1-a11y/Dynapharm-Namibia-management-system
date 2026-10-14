import { it, expect } from 'vitest';
import { stockValuationEvidence } from './stockValuationEvidence';
it('keeps originals, current estimates, missing evidence and unpriced units separate', () => {
  const rows = [{productName:'TEST',qty:10,unitDPC:7,unitCIF:2,missingDPCQuantity:4,missingCostQuantity:5}];
  expect(stockValuationEvidence(rows,[{description:'TEST',dp:100,cif:30}])).toMatchObject({
    originalDP:42,originalCIF:10,missingDP:4,missingCIF:5,estimatedDP:400,estimatedCIF:150,unpricedDP:0 });
  expect(stockValuationEvidence(rows,[])).toMatchObject({originalDP:42,estimatedDP:0,unpricedDP:4,unpricedCIF:5});
  expect(stockValuationEvidence(rows,[{description:'TEST',dp:100},{description:'test',dp:99}]).unpricedDP).toBe(4);
  expect(stockValuationEvidence([{qty:5,unitDPC:0,unitCIF:0,missingDPCQuantity:0,missingCostQuantity:0}])).toMatchObject({missingDP:5,missingCIF:5});
  expect(stockValuationEvidence([{qty:5,unitDPC:0,unitCIF:0,zeroCostApproved:true}])).toMatchObject({missingDP:0,missingCIF:0,originalDP:0,originalCIF:0});
});
