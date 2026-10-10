import {it,expect} from 'vitest';
import {buildStockOverviewCSV,stockValuationDisclosure} from '../client/src/lib/stockOverviewExport.js';
it('carries incomplete source-cost warnings and missing quantities into CSV and PDF disclosure',()=>{
  const summary={totalQtyUnits:5,totalValueCIF:4,totalValueDP:14,missingCostQuantity:3,missingDPQuantity:3,valuationComplete:false};
  const d=stockValuationDisclosure(summary);
  expect(d).toMatchObject({incomplete:true,missingCIF:3,missingDP:3,cifLabel:'Known CIF subtotal',dpLabel:'Known DP subtotal'});
  expect(d.notice).toContain('3 units lack CIF; 3 units lack DP');
  const csv=buildStockOverviewCSV({summary,products:[{productName:'TEST',totalQty:5,totalValueCIF:4,totalValueDP:14,missingCostQuantity:3,missingDPQuantity:3,
    locations:[{locationType:'branch',locationName:'Townshop',qty:5,valueCIF:4,valueDP:14,missingCostQuantity:3,missingDPQuantity:3}]}]});
  expect(csv).toContain('Known CIF subtotal');expect(csv).toContain('Known DP subtotal');
  expect(csv).toContain('KNOWN SUBTOTALS ONLY');expect(csv).toContain('Missing CIF units');
  expect(csv).toContain('"Known subtotals only","3","3"');expect(csv).not.toContain('Total CIF value');
});
it('does not mark legitimate complete zero costs as unknown',()=>{
  const summary={totalQtyUnits:1,totalValueCIF:0,totalValueDP:0,missingCostQuantity:0,missingDPQuantity:0,valuationComplete:true};
  expect(stockValuationDisclosure(summary).incomplete).toBe(false);
  const csv=buildStockOverviewCSV({summary,products:[]});
  expect(csv).toContain('Total CIF value');expect(csv).toContain('valuation complete.');
  expect(csv).not.toContain('KNOWN SUBTOTALS ONLY');
});
