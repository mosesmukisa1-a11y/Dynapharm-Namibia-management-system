// @vitest-environment node
import {it,expect} from 'vitest';
import {query} from '../api/db.js';
import handler from '../api/stock/ai-reorder.js';
async function invoke(branch,user={id:'audit-stock',role:'stock'}){
 const result={status:200};const res={setHeader(){},status(s){result.status=s;return this},json(b){result.body=b;return this},end(){}};
 await handler({method:'GET',url:`/api/stock/ai-reorder?branchId=${branch}`,headers:{host:'test'},user},res);return result;
}
it('uses branch allocations, ignores duplicate movement evidence, uses physical availability and manual review',async()=>{
 const p='TEST-REORDER-EVIDENCE';
 try{
  await query("INSERT INTO branch_inventory_batches(id,branch_id,product_name,quantity) VALUES('REORDER-BATCH','reorder_a',$1,2)",[p]);
  for(const [id,branch,qty] of [['REORDER-A','reorder_a',6],['REORDER-B','reorder_b',90],['REORDER-DUP','reorder_a',6]]){
   await query("INSERT INTO stock_movements(id,movement_type,product_name,quantity,source_location,status) VALUES($1,'sale',$2,$3,$4,'posted')",[id,p,qty,branch]);
   if(id!=='REORDER-DUP')await query("INSERT INTO stock_sale_allocations(movement_id,sale_reference,branch_batch_id,branch_id,product_name,quantity,snapshot) VALUES($1,$1,'REORDER-BATCH',$2,$3,$4,'{}')",[id,branch,p,qty]);
  }
  const r=await invoke('reorder_a');expect(r.status).toBe(200);
  const suggestion=r.body.suggestions.find(x=>x.productName===p);
  expect(suggestion.currentQty).toBe(2);expect(suggestion.avgDailyUsage).toBe(.2);
  expect(suggestion.recommendedReorderQty).toBeNull();expect(suggestion.recommendationStatus).toBe('manual_review');
  expect((await invoke('reorder_b',{id:'a',role:'branch_manager',branch:'reorder_a'})).status).toBe(403);
  expect((await invoke('all',null)).status).toBe(401);
 }finally{
  await query("DELETE FROM stock_movements WHERE id IN ('REORDER-A','REORDER-B','REORDER-DUP')");
  await query("DELETE FROM branch_inventory_batches WHERE id='REORDER-BATCH'");
 }
});
