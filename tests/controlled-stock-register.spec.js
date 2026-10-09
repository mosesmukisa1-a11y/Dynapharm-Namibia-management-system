// @vitest-environment node
import { describe,expect,it,vi } from 'vitest';
import { readControlledStockRegister } from '../api/services/controlledStockRegister.js';

const policy={
  fail(message,statusCode=400){throw Object.assign(new Error(message),{statusCode});},
  physicalBatchSnapshot: (row,type,source)=>({...row,batch_type:type,unit_cost:source?.cif_unit_cost}),
};
describe('controlled register bounded read queries',()=>{
  it('hydrates a whole page and its original sources with one set-based query, independent of page size',async()=>{
    const rows=Array.from({length:100},(_,i)=>({
      batch_type:'branch',raw:{id:`batch-${i}`,source_batch_id:`source-${i}`},
      original_source:{id:`source-${i}`,cif_unit_cost:0.123456789},
    }));
    const client={query:vi.fn()
      .mockResolvedValueOnce({rows:[{total:'100000'}]})
      .mockResolvedValueOnce({rows})
      .mockResolvedValueOnce({rows:[{location:'townshop'}]})};
    const result=await readControlledStockRegister(client,{role:'branch_manager',branch:'townshop'},
      {view:'batches',batch_page_size:'100',batch_page:'2'},policy);
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[1][0]).toContain('LEFT JOIN stock_batches source');
    expect(client.query.mock.calls[1][0]).toContain('LIMIT $9 OFFSET $10');
    expect(client.query.mock.calls[1][1].slice(-2)).toEqual([100,100]);
    expect(client.query.mock.calls[1][1][0]).toBe(true);
    expect(result.batches).toHaveLength(100);
    expect(result.batches.every(row=>row.unit_cost===0.123456789)).toBe(true);
    expect(result.batch_pagination).toMatchObject({total:100000,page:2,total_pages:1000});
  });
  it('does not query stock batches or financial history when requesting operation summaries',async()=>{
    const client={query:vi.fn().mockResolvedValueOnce({rows:[{total:'4000'}]}).mockResolvedValueOnce({rows:[
      {id:'op',kind:'count',status:'draft',line_count:200},
    ]})};
    const result=await readControlledStockRegister(client,{role:'finance'},{view:'operations'},policy);
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query.mock.calls.every(([sql])=>!sql.includes('stock_batches') && !sql.includes('supplier_return_credits')
      && !sql.includes('stock_control_financial_entries'))).toBe(true);
    expect(result.operations[0]).not.toHaveProperty('lines');
    expect(result).not.toHaveProperty('credits');
  });
});
