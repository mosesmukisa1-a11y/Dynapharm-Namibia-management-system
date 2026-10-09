import {it,expect,vi} from 'vitest';
import {csvCell,getStockCostAudit} from '../api/services/stockCostAudit.js';

it('neutralizes CSV formulas without rounding decimal strings or escaping legitimate negative amounts',()=>{
  expect(csvCell('\t=HYPERLINK("bad")')).toBe('"\'\t=HYPERLINK(""bad"")"');
  expect(csvCell('0.123456789012345678901')).toBe('"0.123456789012345678901"');
  expect(csvCell('-12.50')).toBe('"-12.50"');
  expect(csvCell('Name,\n"quoted"')).toBe('"Name,\n""quoted"""');
});
it('uses the same frozen-evidence scope and explicitly rejects oversized exports rather than truncating',async()=>{
  const reader=vi.fn(async()=>Array.from({length:10001},()=>({})));
  await expect(getStockCostAudit({aliases:['townshop'],from:'2026-01-01',to:'2026-01-31',productName:'Product'},reader))
    .rejects.toMatchObject({statusCode:413});
  expect(reader).toHaveBeenCalledTimes(1);
  expect(reader.mock.calls[0][1]).toEqual([['townshop'],'2026-01-01','2026-01-31','Product',10001]);
  expect(reader.mock.calls[0][0]).not.toMatch(/JOIN\s+(stock_batches|supplier_imports|product_prices)/i);
});
it('provides a stable complete CSV schema and explicit empty-scope totals',async()=>{
  const result=await getStockCostAudit({},async()=>[]);
  expect(result.records).toEqual([]);
  expect(result.summary).toEqual({knownCostSubtotal:'0',knownRevenueSubtotal:'0',completeAuditProfit:'0'});
  expect(result.csv).toContain('"receipt_allocated_expenses_nonadditive"');
  expect(result.csv).toContain('"source_expiry"');
});
