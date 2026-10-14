// @vitest-environment node
import { beforeAll,afterAll,it,expect } from 'vitest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID,createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink, mkdtemp, rm,stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assertIsolatedTestDatabase } from '../api/testDatabaseGuard.js';
import { query,withTransaction } from '../api/db.js';
import login from '../api/auth/login.js';
import { getTokenFromRequest,verifyAuthToken } from '../api/_lib/auth.js';
import walkin from '../api/branch/walkin-sales.js';
import campaign from '../api/branch/campaign-sale.js';
import dispense from '../api/branch/dispense.js';
import audit from '../api/mis/audit.js';
import movements from '../api/stock-movements.js';
import summary from '../api/branch/stock-summary.js';
import requests from '../api/stock-requests.js';
import productReport from '../api/reports/branch-sales/daily-products.js';
import { runAutoStockRequest } from '../api/services/stockAutomation.js';
import { getLegacyDPRevenue,getSalesReturnsSummary } from '../api/services/stockFinancialReports.js';
import requestRefund from '../api/branch/refund-requests.js';
import approveRefund from '../api/stock/refund-requests.js';
import { readSaleRepairPlan,applySaleRepairPlanTx } from '../api/services/saleEvidenceRepair.js';
import { isOpenStockRequest } from '../shared/stockRequests.js';
import { businessDay } from '../api/services/businessDates.js';
import financeSummary from '../api/finance/summary.js';
import gmSummary from '../api/gm/summary.js';
import directorSummary from '../api/director/summary.js';
import profitAnalysis from '../api/director/products/profit-analysis.js';
import productRange from '../api/reports/branch-sales/product-range.js';
import trace from '../api/stock/trace.js';
import valuation from '../api/stock/valuation.js';

const prefix='TSE-'+randomUUID().slice(0,8),product=prefix+'-PRODUCT',branch='townshop',password=randomUUID();
let server,base,cookie;
const actor=prefix+'-admin';
async function http(path,body,headers={},auth=cookie,method=body?'POST':'GET') {
  const response=await fetch(base+path,{method,
    headers:{'Content-Type':'application/json',...(auth?{Cookie:auth}:{}),...headers},
    ...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
}
const sale=(id,extra={})=>({id,branch,customerType:'non_member',saleNumber:id,total:443,subtotal:443,
  products:[{product_name:product,quantity:1,dp:999,cp:999,unit_price:443}],...extra});
const totalUnits=async()=>Number((await query('SELECT SUM(quantity) n FROM branch_inventory_batches WHERE product_name=$1',[product])).rows[0].n);
beforeAll(async()=>{
  await query(await readFile('migrations/033_sale_evidence.sql','utf8'));
  await query(await readFile('migrations/033_sale_evidence.sql','utf8'));
  await query(`INSERT INTO users(id,username,password_hash,full_name,role,branch,is_active,must_change_password)
    VALUES($1::text,$1::text,$2,'Synthetic sale operator','admin',$3,true,false)`,[actor,await bcrypt.hash(password,10),branch]);
  await query(`INSERT INTO product_prices(description,product_code,dp,cp,cif,bv,updated_by)
    VALUES($1::text,$1::text,341,443,70,1,'isolated-fixture')`,[product]);
  for(const [suffix,qty] of [['A',.5],['B',99.5]])await query(`INSERT INTO branch_inventory_batches
    (id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,status)
    VALUES($1,$2,$3,$4,'2035-12-31',$5,23,'in_stock')`,[prefix+suffix,branch,product,suffix,qty]);
  const app=express();app.use(express.json());app.post('/api/auth/login',login);
  app.use((req,res,next)=>{const decoded=verifyAuthToken(getTokenFromRequest(req));if(decoded)req.user=decoded;next();});
  for(const [path,h] of [['walkin',walkin],['campaign',campaign],['dispense',dispense],
    ['audit',audit],['movements',movements],['summary',summary],['requests',requests],['products',productReport],
    ['finance',financeSummary],['gm',gmSummary],['director',directorSummary],['profit',profitAnalysis],['product-range',productRange],
    ['refund',requestRefund],['refund-approve',approveRefund],['trace',trace],['valuation',valuation]])
    app.all('/'+path,h);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:actor,password})});
  expect(response.status).toBe(200);
  cookie=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
});
it('pages the entire filtered ledger, preserves unmatched legacy lines and follows primary receipt identities',async()=>{
  const tag=prefix+'-PAGE';
  await query(`INSERT INTO stock_movements(id,product_name,movement_type,quantity,source_location,
    reference_id,status,created_at) SELECT $1||'-'||LPAD(n::text,4,'0'),$2,'sale',1,'townshop',$1,'posted',
      '2026-10-14T08:00:00Z'::timestamptz FROM generate_series(1,1003) n`,[tag,product]);
  let cursor=null,ids=[];
  do {
    const result=await http('/movements?page=1&limit=100&search='+encodeURIComponent(tag)+(cursor?'&cursor='+cursor:''));
    expect(result.status).toBe(200);
    expect(result.body.movements.length).toBeLessThanOrEqual(100);
    ids.push(...result.body.movements.map(row=>row.id));cursor=result.body.nextCursor;
  }while(cursor);
  expect(ids).toHaveLength(1003);expect(new Set(ids).size).toBe(1003);
  await query(`UPDATE stock_movements SET created_at='2026-10-14T08:00:00Z'::timestamptz+
    (substring(id from '[0-9]{4}$')::int % 997)*interval '1 microsecond' WHERE reference_id=$1`,[tag]);
  let microCursor=null,microIds=[];
  do {
    const result=await http('/movements?page=1&limit=100&search='+encodeURIComponent(tag)+(microCursor?'&cursor='+microCursor:''));
    expect(result.status).toBe(200);
    microIds.push(...result.body.movements.map(row=>row.id));microCursor=result.body.nextCursor;
  }while(microCursor);
  expect(microIds).toHaveLength(1003);expect(new Set(microIds).size).toBe(1003);
  const legacy=tag+'-LEGACY';
  await query(`INSERT INTO branch_inventory_movements(id,branch_id,product_name,type,quantity,reference,created_at)
    VALUES($1,'townshop',$2,'sale',1,$3,'2026-10-14T08:00:00Z')`,[legacy,product,tag]);
  expect((await http('/movements?page=1&search='+legacy)).body.movements.map(row=>row.id)).toContain(legacy);
  await query(`UPDATE stock_movements SET metadata=jsonb_build_object('sale_evidence',
    jsonb_build_object('branch_movement_id',$1::text)) WHERE id=$2`,[legacy,tag+'-0001']);
  expect((await http('/movements?page=1&search='+legacy)).body.movements.map(row=>row.id)).toEqual([tag+'-0001']);
  expect((await http('/movements?page=1&cursor=bad')).status).toBe(400);
  expect((await http('/movements?page=1',undefined,{},null)).status).toBe(401);
  await query('DELETE FROM branch_inventory_movements WHERE id=$1',[legacy]);
  await query('DELETE FROM stock_movements WHERE reference_id=$1',[tag]);
  const reference=prefix+'-PRIMARY-TRACE',receipt=prefix+'-RECEIPT-TRACE';
  await query(`INSERT INTO branch_walkin_sales(id,branch_id,sale_number,data,created_at)
    VALUES($1,'townshop',$2,'{}','2026-10-14T08:00:00Z')`,[reference,receipt]);
  await query(`INSERT INTO stock_movements(id,product_name,movement_type,quantity,source_location,reference_id,status,created_at)
    VALUES($1,$2,'sale',1,'townshop',$3,'posted','2026-10-14T08:00:00Z')`,[reference+'-MOV',product,reference]);
  const byReceipt=await http('/movements?page=1&search='+receipt);
  expect(byReceipt.status).toBe(200);expect(byReceipt.body.movements[0].receipt_no).toBe(receipt);
  const timeline=await http('/trace?search='+receipt);
  expect(timeline.status).toBe(200);
  expect(timeline.body.events.some(event=>event.recordId===reference)).toBe(true);
  expect(timeline.body.events.some(event=>event.recordId===reference+'-MOV')).toBe(true);
  await query('DELETE FROM stock_movements WHERE reference_id=$1',[reference]);
  await query('DELETE FROM branch_walkin_sales WHERE id=$1',[reference]);
});
it('counts the Hochland Park central and branch sale mirror only once',async()=>{
  const reference=prefix+'-HOCHLAND',batch=prefix+'-BATCH-H';
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,quantity,status)
    VALUES($1,'hochland-park',$2,$3,8,'in_stock')`,[batch,product,batch]);
  await query(`INSERT INTO stock_movements(id,product_name,batch_no,movement_type,quantity,source_location,reference_id,status,created_at)
    VALUES($1,$2,$3,'sale',2,'hochland-park',$4,'posted','2026-10-14T08:00:00Z')`,[reference+'-SM',product,batch,reference]);
  await query(`INSERT INTO branch_inventory_movements(id,branch_id,product_name,batch_no,type,quantity,reference,created_at)
    VALUES($1,'hochland-park',$2,$3,'sale',2,$4,'2026-10-14T08:00:00Z')`,[reference+'-BIM',product,batch,reference]);
  await query(`INSERT INTO branch_inventory_movements(id,branch_id,product_name,batch_no,type,quantity,reference,created_at)
    VALUES($1,'hochland-park',$2,$3,'adjustment',1,$4,'2026-10-14T08:00:00Z')`,[reference+'-ADJUST',product,batch,reference]);
  const response=await http('/summary?branch=hochland-park&date_from=2026-10-14&date_to=2026-10-14');
  expect(response.status).toBe(200);
  const row=response.body.branches.find(row=>row.branch_id==='hochland-park');
  expect(row.qty_sold).toBe(2);
  expect(row.qty_adjusted).toBe(1);
  expect(Number((await query('SELECT quantity FROM branch_inventory_batches WHERE id=$1',[batch])).rows[0].quantity)).toBe(8);
  await query('DELETE FROM branch_inventory_movements WHERE id=$1',[reference+'-BIM']);
  await query('DELETE FROM branch_inventory_movements WHERE id=$1',[reference+'-ADJUST']);
  await query('DELETE FROM stock_movements WHERE id=$1',[reference+'-SM']);
  await query('DELETE FROM branch_inventory_batches WHERE id=$1',[batch]);
});
it.each(['branch','branch_staff'])('enforces assigned scope for %s using real staff sessions on unfiltered evidence and foreign requests',async role=>{
  const tag=prefix+'-'+role,userId=tag+'-USER',foreign=tag+'-FOREIGN';
  await query(`INSERT INTO users(id,username,password_hash,full_name,role,branch,is_active,must_change_password)
    VALUES($1,$1,$2,'Synthetic branch scope operator',$3,'townshop',true,false)`,[userId,await bcrypt.hash(password,10),role]);
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,quantity,status)
    VALUES($1,'swakopmund',$2,$1,3,'in_stock')`,[foreign,product]);
  for(const [id,owner] of [[tag+'-OWN','townshop'],[foreign,'swakopmund']]) {
    await query(`INSERT INTO stock_movements(id,product_name,movement_type,quantity,source_location,reference_id,status)
      VALUES($1,$2,'sale',1,$3,$1,'posted')`,[id,product,owner]);
    await query(`INSERT INTO branch_inventory_movements(id,branch_id,product_name,type,quantity,reference)
      VALUES($1,$2,$3,'sale',1,$4)`,[id+'-BIM',owner,product,id]);
  }
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:userId,password})});
  expect(response.status).toBe(200);
  const session=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const scoped=await http('/movements?page=1&limit=1000',undefined,{},session);
  expect(scoped.status).toBe(200);
  expect(scoped.body.movements.some(row=>row.id===tag+'-OWN')).toBe(true);
  expect(scoped.body.movements.some(row=>row.id===foreign || row.id===foreign+'-BIM')).toBe(false);
  for(const path of ['/movements?page=1&branch=swakopmund','/movements?page=1&location=swakopmund',
    '/trace?search='+foreign+'&branch=swakopmund','/valuation?branch=swakopmund','/valuation?location=swakopmund']) {
    expect((await http(path,undefined,{},session)).status).toBe(403);
  }
  const timeline=await http('/trace?search='+encodeURIComponent(tag),undefined,{},session);
  expect(timeline.status).toBe(200);
  expect(timeline.body.events.some(event=>event.recordId===foreign || event.recordId===foreign+'-BIM')).toBe(false);
  expect(timeline.body.events.some(event=>event.recordId===tag+'-OWN')).toBe(true);
  const costs=await http('/valuation',undefined,{},session);
  expect(costs.status).toBe(200);expect(costs.body.rows.length).toBeGreaterThan(0);
  expect(costs.body.rows.every(row=>row.locationId==='townshop' && row.locationType==='branch')).toBe(true);
  const legacy=await http('/movements?limit=1000',undefined,{},session);
  expect(legacy.status).toBe(200);
  expect(legacy.body.movements.some(row=>row.id===foreign+'-BIM')).toBe(false);
  await query('DELETE FROM branch_inventory_movements WHERE reference=$1 OR reference=$2',[foreign,tag+'-OWN']);
  await query('DELETE FROM stock_movements WHERE reference_id=$1 OR reference_id=$2',[foreign,tag+'-OWN']);
  await query('DELETE FROM branch_inventory_batches WHERE id=$1',[foreign]);
  await query('DELETE FROM users WHERE id=$1',[userId]);
});
afterAll(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  await query('DELETE FROM sale_completion_retries WHERE request_key LIKE $1',['%'+prefix+'%']);
  await query('DELETE FROM mis_sales_audit WHERE record_id LIKE $1',[prefix+'%']);
  await query('DELETE FROM branch_activity_transactions WHERE captured_by=$1 OR form_reference_id LIKE $2',['Synthetic sale operator',prefix+'%']);
  await query('DELETE FROM branch_distributor_profit WHERE sale_id LIKE $1',[prefix+'%']);
  await query('DELETE FROM branch_inventory_movements WHERE product_name=$1',[product]);
  await query('DELETE FROM stock_movements WHERE product_name=$1',[product]);
  await query('DELETE FROM branch_inventory_batches WHERE product_name=$1',[product]);
  await query('DELETE FROM inventory_balances WHERE product_name=$1',[product]);
  await query('DELETE FROM branch_walkin_sales WHERE id LIKE $1',[prefix+'%']);
  await query('DELETE FROM product_prices WHERE description=$1',[product]);
  await query('DELETE FROM reports WHERE id LIKE $1',[prefix+'%']);
  await query('DELETE FROM campaigns WHERE id LIKE $1',[prefix+'%']);
  await query('DELETE FROM users WHERE id=$1',[actor]);
  await query('DELETE FROM stock_requests WHERE id LIKE $1',[prefix+'%']);
  await query('DELETE FROM users WHERE id=$1',[prefix+'-branch']);
});
it('uses real login and rejects unauthenticated sale and reporting requests',async()=>{
  expect((await http('/walkin',sale(prefix+'-unauth'),{},null)).status).toBe(401);
  expect((await http('/audit',null,{},null)).status).toBe(401);
});
it('posts 341 DP / 443 charged / 102 margin atomically across split batches, with authenticated staff and retry protection',async()=>{
  const id=prefix+'-WALK',before=await totalUnits();
  const requestsBefore=(await query('SELECT * FROM stock_requests ORDER BY id')).rows;
  const payload=sale(id,{soldBy:'Forged staff'});
  const concurrent=await Promise.all([http('/walkin',payload),http('/walkin',payload)]);
  expect(concurrent.map(r=>r.status).sort()).toEqual([200,201]);
  const posted=concurrent.find(r=>r.status===201);
  expect(posted.status,JSON.stringify(posted.body)).toBe(201);
  expect(await totalUnits()).toBe(before-1);
  for(const portal of ['finance','gm','director']){
    const report=await http('/'+portal+'?start='+businessDay()+'&end='+businessDay());
    expect(report.status,JSON.stringify(report.body)).toBe(200);
    expect(JSON.stringify(report.body)).toContain('341');
  }
  const products=(await http('/products?branch_id='+branch+'&date='+businessDay())).body;
  expect(products.products.find(p=>p.product_name===product)).toMatchObject({dp_amount:341,dp_complete:true});
  const repeat=await http('/walkin',payload);expect(repeat.status).toBe(200);expect(repeat.body.duplicate).toBe(true);
  expect(await totalUnits()).toBe(before-1);
  const logs=(await query(`SELECT * FROM mis_sales_audit WHERE record_id=$1 AND event_type='sale_created'`,[id])).rows;
  expect(logs).toHaveLength(1);
  expect(logs[0].details).toMatchObject({dpTotal:341,chargedTotal:443,branchProfitTotal:102,staff:'Synthetic sale operator'});
  expect(logs[0].details.lines).toHaveLength(2);
  const ledger=(await http('/movements?branch=townshop&reference_id='+id)).body.movements;
  expect(ledger).toHaveLength(2);expect(ledger.reduce((s,m)=>s+m.dp_value,0)).toBe(341);
  // This fixture has no received CIF evidence: do not fabricate it from catalogue CIF70.
  expect(ledger.every(m=>m.cost_evidence_status!=='original' && m.original_received_cost==null)).toBe(true);
  for (const search of [id, logs[0].details.receiptNumber, ledger[0].id, ledger[0].batch_no]) {
    const found=await http('/movements?search='+encodeURIComponent(search));
    expect(found.status,JSON.stringify(found.body)).toBe(200);
    expect(found.body.movements.some(m=>m.reference_id===id)).toBe(true);
  }
  expect((await http('/movements?search=NO-SUCH-SYNTHETIC-MOVEMENT')).body.movements).toEqual([]);
  const branchActor=prefix+'-BRANCH';
  await query(`INSERT INTO users(id,username,password_hash,full_name,role,branch,is_active,must_change_password)
    VALUES($1,$1,$2,'Synthetic branch operator','branch_manager',$3,true,false)`,
    [branchActor,await bcrypt.hash(password,10),branch]);
  const branchLogin=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:branchActor,password})});
  const branchCookie=branchLogin.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  expect(branchLogin.status).toBe(200);
  expect((await http('/movements?branch=swakopmund',undefined,{},branchCookie)).status).toBe(403);
  expect((await http('/movements?page=1&branch=swakopmund',undefined,{},branchCookie)).status).toBe(403);
  expect((await http('/trace?search='+encodeURIComponent(id)+'&branch=swakopmund',undefined,{},branchCookie)).status).toBe(403);
  const own=await http('/movements?branch=townshop&reference_id='+id,undefined,{},branchCookie);
  expect(own.status).toBe(200); expect(own.body.movements).toHaveLength(2);
  expect((await http('/movements?search='+encodeURIComponent(id),undefined,{},branchCookie)).body.movements).toHaveLength(2);
  await query('DELETE FROM users WHERE id=$1',[branchActor]);
  expect(ledger.reduce((s,m)=>s+m.signed_quantity,0)).toBe(-1);
  expect((await query('SELECT * FROM stock_requests ORDER BY id')).rows).toEqual(requestsBefore);
  const daily=await getLegacyDPRevenue([branch],businessDay(),businessDay());
  expect(daily.walkinSales).toBeGreaterThanOrEqual(341);
  const br=(await http('/summary?branch=townshop')).body.branches[0];
  expect(br.sales_dp_value).toBeGreaterThanOrEqual(341);
  await query('UPDATE product_prices SET dp=998,cp=999 WHERE description=$1',[product]);
  expect((await http('/movements?branch=townshop&reference_id='+id)).body.movements.reduce((s,m)=>s+m.dp_value,0)).toBe(341);
  expect((await http('/products?branch_id='+branch+'&date='+businessDay())).body.products.find(p=>p.product_name===product).dp_amount).toBe(341);
  expect((await http('/product-range?branch_id='+branch+'&date_from='+businessDay()+'&date_to='+businessDay())).body.products.find(p=>p.product_name===product).dp_value).toBe(341);
  const frozenProfit=(await http('/profit?startDate='+businessDay()+'&endDate='+businessDay())).body.products.find(p=>p.productName===product);
  expect(frozenProfit).toMatchObject({revenueDp:341,chargedTotal:443,commercialMargin:102,qtySold:1});
  if(frozenProfit.missingCostQuantity)expect(frozenProfit.actualProfit).toBe(null);
  else expect(frozenProfit.actualProfit).toBe(443-frozenProfit.cifCost);
  expect((await getLegacyDPRevenue([branch],businessDay(),businessDay())).walkinSales).toBe(daily.walkinSales);
  const auditFiltered=await http(`/audit?branch=Townshop&event=sale_created&start=${businessDay()}&end=${businessDay()}`);
  expect(auditFiltered.body.logs.some(l=>l.recordId===id)).toBe(true);
  await query('UPDATE product_prices SET dp=341,cp=443 WHERE description=$1',[product]);
});
it('rolls back all stock, receipt, activity and audit evidence on insufficient stock',async()=>{
  const before=await totalUnits(),id=prefix+'-FAIL';
  const response=await http('/walkin',sale(id,{products:[{name:product,quantity:1000}]}));
  expect(response.status).toBe(409);expect(await totalUnits()).toBe(before);
  for(const [table,column] of [['branch_walkin_sales','id'],['mis_sales_audit','record_id'],
    ['stock_movements','reference_id'],['branch_inventory_movements','reference'],['branch_activity_transactions','form_reference_id']])
    expect((await query(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=$1`,[id])).rows[0].n).toBe('0');
});
it.each(['member','non_member'])('records discounted campaign %s and explicit zero free-item evidence without duplicate retries',async customerType=>{
  const id=prefix+'-CAMP-'+customerType;
  await query(`INSERT INTO campaigns(id,name,campaign_type,start_date,end_date,status,scope,conditions,prize)
    VALUES($1,'Synthetic sale campaign','buy_x_get_y',CURRENT_DATE-1,CURRENT_DATE+1,'approved','nationwide',$2,$3)`,
  [id,JSON.stringify({products_text:product,buy_qty:1,get_qty:1}),JSON.stringify({free_product:product})]);
  const payload={requestId:id,campaign_id:id,branch,paid_product:product,paid_qty:1,customer_type:customerType,
    nb_number:'SYNTHETIC-NB',processed_by:'Forged'};
  const before=await totalUnits(),result=await http('/campaign',payload);
  expect(result.status,JSON.stringify(result.body)).toBe(201);
  expect(await totalUnits()).toBe(before-2);
  const saleId=result.body.sale_id;
  const details=(await query('SELECT details FROM mis_sales_audit WHERE record_id=$1',[saleId])).rows[0].details;
  expect(details.dpTotal).toBe(341);
  expect(details.chargedTotal).toBe(customerType==='member'?341:443);
  expect(details.lines.some(l=>l.dpTotal===0 && l.chargedTotal===0)).toBe(true);
  expect((await http('/campaign',payload)).body.duplicate).toBe(true);
  expect(await totalUnits()).toBe(before-2);
  // Campaign-generated IDs are not our prefix, so remove their financial headers explicitly.
  await query('DELETE FROM sale_completion_retries WHERE request_key LIKE $1',['%'+id+'%']);
  await query('DELETE FROM branch_distributor_profit WHERE sale_id=$1',[saleId]);
  await query('DELETE FROM branch_activity_transactions WHERE form_reference_id=$1',[saleId]);
  await query('DELETE FROM mis_sales_audit WHERE record_id=$1',[saleId]);
  await query('DELETE FROM branch_walkin_sales WHERE id=$1',[saleId]);
});
it('reverses the saved net DP exactly once on a full discounted non-member campaign refund',async()=>{
  const id=prefix+'-DISCOUNT-RETURN',returnBranch='refund_'+prefix.replaceAll('-','').toLowerCase();
  let saleId,refundId,reversalId;
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,status)
    VALUES($1,$2,$3,'DISCOUNT-RETURN','2035-12-31',5,23,'in_stock')`,[id,returnBranch,product]);
  await query(`INSERT INTO campaigns(id,name,campaign_type,start_date,end_date,status,scope,conditions,discount_percentage)
    VALUES($1,'Captured ten percent discount','discount',CURRENT_DATE-1,CURRENT_DATE+1,'approved','nationwide',$2,10)`,
    [id,JSON.stringify({products_text:product,discount_pct:10})]);
  await query('UPDATE product_prices SET dp=100,cp=150 WHERE description=$1',[product]);
  try{
    const completed=await http('/campaign',{requestId:id,campaign_id:id,branch:returnBranch,
      paid_product:product,paid_qty:1,customer_type:'non_member'});
    expect(completed.status,JSON.stringify(completed.body)).toBe(201);saleId=completed.body.sale_id;
    const allocation=(await query('SELECT * FROM stock_sale_allocations WHERE sale_reference=$1',[saleId])).rows[0];
    expect(Number(allocation.snapshot.financial_dp_unit)).toBe(90);
    const aliases=[allocation.branch_id.toLowerCase()];
    const beforeReturn=await getSalesReturnsSummary({aliases,from:businessDay(),to:businessDay(),productName:product});
    expect(Number(beforeReturn.netSalesDP)).toBe(90);
    await query('UPDATE product_prices SET dp=999,cp=1234 WHERE description=$1',[product]);
    const requested=await http('/refund',{allocation_id:allocation.movement_id,quantity:1,
      operation_key:id,reason:'Full physical return of discounted sale',physical_return_confirmed:true});
    expect(requested.status,JSON.stringify(requested.body)).toBe(200);refundId=requested.body.id;
    const approved=await http('/refund-approve',{id:refundId,action:'approve',return_condition:'saleable',
      physical_return_confirmed:true,inspection_reason:'Original sealed batch inspected'},{},cookie,'PATCH');
    expect(approved.status,JSON.stringify(approved.body)).toBe(200);
    reversalId=(await query('SELECT movement_id FROM branch_refund_requests WHERE id=$1',[refundId])).rows[0].movement_id;
    const summary=await getSalesReturnsSummary({aliases,from:businessDay(),to:businessDay(),productName:product});
    expect(Number(summary.grossSalesDP)).toBe(90);
    expect(Number(summary.refundsDP)).toBe(90);
    expect(Number(summary.netSalesDP)).toBe(0);expect(summary.dpComplete).toBe(true);
    expect(Number(summary.netSalesRevenue)).toBe(0);
    const legacy=await getLegacyDPRevenue(aliases,businessDay(),businessDay());
    expect(legacy.grossWalkinSalesDP).toBe(90);expect(legacy.refundsDP).toBe(90);
    expect(legacy.walkinSales).toBe(0);expect(legacy.totalSales).toBe(0);
    expect(legacy.netCustomerReceipts).toBe(0);
  }finally{
    await query('UPDATE product_prices SET dp=341,cp=443 WHERE description=$1',[product]);
    await query('DELETE FROM branch_refund_requests WHERE id=$1',[refundId || null]);
    await query('DELETE FROM stock_linked_reversals WHERE id=$1',[reversalId || null]);
    await query('DELETE FROM sale_completion_retries WHERE request_key LIKE $1',['%'+id+'%']);
    await query('DELETE FROM branch_distributor_profit WHERE sale_id=$1',[saleId || null]);
    await query('DELETE FROM branch_activity_transactions WHERE form_reference_id=$1',[saleId || null]);
    await query('DELETE FROM mis_sales_audit WHERE record_id=$1',[saleId || null]);
    await query('DELETE FROM branch_walkin_sales WHERE id=$1',[saleId || null]);
  }
});
it('records prescription completion, original DP and activity atomically and permits exactly keyed retries',async()=>{
  const id=prefix+'-RX',payload={requestId:prefix+'-RX-SESSION',reportId:id,branchId:branch,customerType:'non_member',
    patientName:'Synthetic patient',createdBy:'Forged',paymentMethod:'cash',items:[{name:product,quantity:1}]};
  await query('INSERT INTO reports(id,branch,data) VALUES($1,$2,$3)',[id,branch,JSON.stringify({medicines:[{name:product,quantity:1}]})]);
  const before=await totalUnits(),result=await http('/dispense',payload);
  expect(result.status,JSON.stringify(result.body)).toBe(200);
  expect(await totalUnits()).toBe(before-1);
  expect((await http('/dispense',payload)).body.duplicate).toBe(true);
  expect(await totalUnits()).toBe(before-1);
  const logs=(await query('SELECT details FROM mis_sales_audit WHERE record_id=$1',[id])).rows;
  expect(logs).toHaveLength(1);expect(logs[0].details).toMatchObject({dpTotal:341,chargedTotal:443,branchProfitTotal:102});
  expect((await query('SELECT data FROM reports WHERE id=$1',[id])).rows[0].data.medicines[0].dispensed).toBe(true);
  const bat=(await query(`SELECT product_total_dp,grand_total FROM branch_activity_transactions
    WHERE form_reference_id=$1 AND activity_type='prescription_dispensing'`,[id])).rows;
  expect(bat).toHaveLength(1);expect(Number(bat[0].product_total_dp)).toBe(341);expect(Number(bat[0].grand_total)).toBe(443);
});
it.each([['member',341],['non_member',443]])('retains fractional and valid zero evidence for %s sales',async(type,charge)=>{
  const id=prefix+'-'+type;
  expect((await http('/walkin',sale(id,{customerType:type,total:charge/4,subtotal:charge/4,
    products:[{name:product,quantity:.25,unit_price:charge}]}))).status).toBe(201);
  const details=(await query('SELECT details FROM mis_sales_audit WHERE record_id=$1',[id])).rows[0].details;
  expect(details.dpTotal).toBe(85.25);expect(details.chargedTotal).toBe(charge/4);
  await query('UPDATE product_prices SET dp=0,cp=0 WHERE description=$1',[product]);
  expect((await http('/walkin',sale(id+'-ZERO',{customerType:type,total:0,subtotal:0,
    products:[{name:product,quantity:.25,unit_price:0}]}))).status).toBe(201);
  expect((await query('SELECT details FROM mis_sales_audit WHERE record_id=$1',[id+'-ZERO'])).rows[0].details.dpTotal).toBe(0);
  await query('UPDATE product_prices SET dp=341,cp=443 WHERE description=$1',[product]);
});
it('keeps recommendations separate and counts only verified actual request statuses',async()=>{
  const before=(await query('SELECT * FROM stock_requests ORDER BY id')).rows;
  await runAutoStockRequest();
  expect((await query('SELECT * FROM stock_requests ORDER BY id')).rows).toEqual(before);
  expect(['pending','reviewed','approved','partially_dispatched','dispatched','in_transit'].every(status=>isOpenStockRequest({status}))).toBe(true);
  expect(['received','rejected','cancelled','low_stock','sale'].some(status=>isOpenStockRequest({status}))).toBe(false);
});
it('reads open request counts from branch-scoped actual workflow rows over authenticated HTTP',async()=>{
  const user=prefix+'-branch';
  await query(`INSERT INTO users(id,username,password_hash,full_name,role,branch,is_active,must_change_password)
    VALUES($1::text,$1::text,$2,'Synthetic branch operator','branch_manager',$3,true,false)`,[user,await bcrypt.hash(password,10),branch]);
  const statuses=['pending','reviewed','approved','partially_dispatched','dispatched','in_transit','received','rejected','cancelled'];
  for(const status of statuses)await query(`INSERT INTO stock_requests(id,requesting_branch,status,items)
    VALUES($1,$2,$3,'[]')`,[prefix+'-REQ-'+status,branch,status]);
  await query(`INSERT INTO stock_requests(id,requesting_branch,status,items)
    VALUES($1,'swakopmund','pending','[]')`,[prefix+'-OTHER']);
  const signed=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:user,password})});
  const scoped=(await http('/requests',null,{},signed.headers.get('set-cookie').split(';')[0])).body.requests;
  expect(scoped.filter(isOpenStockRequest)).toHaveLength(6);
  expect(scoped.some(r=>r.id===prefix+'-OTHER')).toBe(false);
});
it('keeps missing original DP visibly incomplete instead of replacing it with catalogue or member cash',async()=>{
  await query('DELETE FROM product_prices WHERE description=$1',[product]);
  const id=prefix+'-MISSING';
  const result=await http('/walkin',sale(id,{customerType:'member',total:10,subtotal:10,products:[{name:product,quantity:.25,unit_price:10}]}));
  expect(result.status,JSON.stringify(result.body)).toBe(201);
  const log=(await query('SELECT details FROM mis_sales_audit WHERE record_id=$1',[id])).rows[0].details;
  expect(log.dpTotal).toBe(null);expect(log.dpComplete).toBe(false);expect(log.branchProfitTotal).toBe(null);
  const lines=(await http('/movements?location='+branch+'&locationType=branch')).body;
  expect(JSON.stringify(lines)).toContain('"dp_complete":false');
  expect((await getLegacyDPRevenue([branch],businessDay(),businessDay())).missingDPRecords).toBeGreaterThan(0);
  await query(`INSERT INTO product_prices(description,product_code,dp,cp,bv,cif,updated_by)
    VALUES($1::text,$1::text,341,443,0,70,$2)`,[product,actor]);
});
it('rolls back every completion write when required audit or activity evidence cannot be recorded',async()=>{
  for(const table of ['mis_sales_audit','branch_activity_transactions']){
    const trigger=prefix.replaceAll('-','_')+'_deny';
    await query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic required evidence failure'; END$$`);
    await query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
    const id=prefix+'-INJECT-'+table,before=await totalUnits();
    try{
      expect((await http('/walkin',sale(id))).status).toBe(500);
      expect(await totalUnits()).toBe(before);
      expect((await query('SELECT id FROM branch_walkin_sales WHERE id=$1',[id])).rows).toHaveLength(0);
      expect((await query('SELECT id FROM stock_movements WHERE reference_id=$1',[id])).rows).toHaveLength(0);
      expect((await query('SELECT id FROM mis_sales_audit WHERE record_id=$1',[id])).rows).toHaveLength(0);
    }finally{await query(`DROP TRIGGER ${trigger} ON ${table}`);await query(`DROP FUNCTION ${trigger}()`);}
  }
});
it('includes the entire Windhoek day and fractional final second but excludes the next local day',async()=>{
  for(const [suffix,time] of [['before','2026-10-13T21:59:59.999Z'],['start','2026-10-13T22:00:00Z'],
    ['last','2026-10-14T21:59:59.999999Z'],['next','2026-10-14T22:00:00Z']])
    await query(`INSERT INTO mis_sales_audit(event_type,record_id,details,created_at)
      VALUES('sale_created',$1,'{"branch":"townshop"}',$2)`,[prefix+'-'+suffix,time]);
  const logs=(await http('/audit?branch=townshop&event=sale_created&start=2026-10-14&end=2026-10-14')).body.logs.filter(l=>l.recordId?.startsWith(prefix)).map(l=>l.recordId);
  expect(logs).toContain(prefix+'-start');expect(logs).toContain(prefix+'-last');
  expect(logs).not.toContain(prefix+'-before');expect(logs).not.toContain(prefix+'-next');
});
it('repairs exact captured metadata/audit only, dry-runs without writes and is idempotent',async()=>{
  const reference=prefix+'-WALK';
  await query('DELETE FROM mis_sales_audit WHERE record_id=$1',[reference]);
  await query(`UPDATE stock_movements SET metadata=metadata-'sale_evidence' WHERE reference_id=$1`,[reference]);
  const quantity=await totalUnits(),options={reference};
  const plan=await withTransaction(c=>readSaleRepairPlan(c,options));
  expect(plan.eligible).toHaveLength(1);
  await withTransaction(c=>applySaleRepairPlanTx(c,plan));
  const after=await withTransaction(c=>readSaleRepairPlan(c,options));
  expect(after.eligible).toHaveLength(0);expect(await totalUnits()).toBe(quantity);
  expect((await query("SELECT details FROM mis_sales_audit WHERE record_id=$1 AND event_type='sale_created'",[reference])).rows[0].details.provenance).toBe('reconstructed_exact_source');
  const retained=(await query("SELECT details FROM mis_sales_audit WHERE record_id=$1 AND event_type='sale_evidence_repaired'",[reference])).rows;
  expect(retained).toHaveLength(1);
  expect(retained[0].details.planHash).toBe(plan.planHash);
  expect(retained[0].details.fingerprint).toBe(plan.fingerprint);
  expect(retained[0].details.lines[0].before.movementSaleEvidence).toBeNull();
  expect(retained[0].details.lines[0].after.movementSaleEvidence.dp_unit_price).toBe(341);
  const review=(await http('/audit?branch=townshop&event=sale_evidence_repaired')).body.logs;
  expect(review.some(row=>row.recordId===reference && row.details.planHash===plan.planHash)).toBe(true);
  await withTransaction(c=>applySaleRepairPlanTx(c,after));
  expect((await query("SELECT id FROM mis_sales_audit WHERE record_id=$1 AND event_type='sale_evidence_repaired'",[reference])).rows).toHaveLength(1);
});
it('repairs mirror-only missing metadata without changing quantities or charges',async()=>{
  const reference=prefix+'-WALK',options={reference};
  await query(`UPDATE branch_inventory_movements SET
    metadata=jsonb_set(metadata,'{sale_evidence}',(metadata->'sale_evidence')-'dp_value')
    WHERE reference=$1`,[reference]);
  const plan=await withTransaction(c=>readSaleRepairPlan(c,options));
  expect(plan.eligible).toHaveLength(1);
  expect(plan.eligible[0].lines.every(l=>Object.keys(l.patch).length===0)).toBe(true);
  expect(plan.eligible[0].lines.some(l=>l.mirrorPatch.dp_value!=null)).toBe(true);
  const checks=await withTransaction(c=>applySaleRepairPlanTx(c,plan));
  expect(checks.invariantAfter).toBe(checks.invariantBefore);
  expect((await withTransaction(c=>readSaleRepairPlan(c,options))).eligible).toHaveLength(0);
});
it('enforces approval, backup, target and stale-evidence gates through the full repair command, with atomic evidence and safe retry',async()=>{
  assertIsolatedTestDatabase(process.env);
  const reference=prefix+'-WALK';
  const directory='generated-artifacts/sale-repair-command';
  await mkdir(directory,{recursive:true});
  const backupFile=`${directory}/${prefix}.dump`;
  const emptyFile=`${directory}/${prefix}-empty.dump`;
  await writeFile(emptyFile,'',{mode:0o600});
  const run=(command,args,options={})=>new Promise((resolve,reject)=>{
    const child=spawn(command,args,{env:process.env,stdio:['ignore','pipe','pipe'],...options});
    let stdout='',stderr='';
    child.stdout.on('data',value=>{stdout+=value;});
    child.stderr.on('data',value=>{stderr+=value;});
    child.on('error',reject);
    child.on('close',status=>resolve({status,stdout,
      stderr:stderr.split(process.env.DATABASE_URL).join('[isolated database]')}));
  });
  const cli=(args,options)=>run(process.execPath,[resolve('scripts/repair-sale-evidence.mjs'),'--reference',reference,...args],options);
  const savedReport=async result=>{
    expect(result.status,result.stderr).toBe(0);
    const path=result.stdout.match(/report: ([^\n]+)/)?.[1];
    expect(path).toBeTruthy();
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    return JSON.parse(await readFile(path,'utf8'));
  };
  const state=async()=>({
    movements:(await query('SELECT id,quantity,unit_cif,unit_dp,metadata FROM stock_movements WHERE reference_id=$1 ORDER BY id',[reference])).rows,
    allocations:(await query('SELECT movement_id,quantity,snapshot FROM stock_sale_allocations WHERE sale_reference=$1 ORDER BY movement_id',[reference])).rows,
    mirrors:(await query('SELECT id,quantity,metadata FROM branch_inventory_movements WHERE reference=$1 ORDER BY id',[reference])).rows,
    audits:(await query('SELECT id,event_type,details,source_key FROM mis_sales_audit WHERE record_id=$1 ORDER BY id',[reference])).rows,
    receipts:(await query('SELECT * FROM branch_walkin_sales WHERE id=$1',[reference])).rows,
    branchBatches:(await query('SELECT * FROM branch_inventory_batches WHERE product_name=$1 ORDER BY id',[product])).rows,
    balances:(await query('SELECT * FROM inventory_balances WHERE product_name=$1 ORDER BY to_jsonb(inventory_balances)::text',[product])).rows,
    activity:(await query('SELECT * FROM branch_activity_transactions WHERE form_reference_id=$1 ORDER BY id',[reference])).rows,
    distributorProfit:(await query('SELECT * FROM branch_distributor_profit WHERE sale_id=$1 ORDER BY id',[reference])).rows,
    units:await totalUnits(),
  });
  await query(`UPDATE stock_movements SET
    metadata=jsonb_set(metadata,'{sale_evidence}',(metadata->'sale_evidence')-'dp_unit_price')
    WHERE reference_id=$1`,[reference]);
  const before=await state();
  const plan=await savedReport(await cli([]));
  expect(plan.mode).toBe('dry-run');
  expect(plan.eligible).toHaveLength(1);
  expect(plan.readiness).toMatchObject({isPrimary:true,schemaReady:true,blockers:[]});
  for(const value of [plan.planHash,plan.fingerprint,plan.readiness.databaseFingerprint])
    expect(value).toMatch(/^[a-f0-9]{64}$/);
  expect(plan.planHash).toBe(createHash('sha256').update(JSON.stringify({
    eligible:plan.eligible,review:plan.review,readiness:plan.readiness,
  })).digest('hex'));
  const canonical=await withTransaction(async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await client.query('SET TRANSACTION READ ONLY');
    return readSaleRepairPlan(client,{reference});
  });
  expect(plan).toEqual({mode:'dry-run',...canonical});
  expect(await savedReport(await cli([]))).toEqual(plan);
  expect(await state()).toEqual(before);

  // Back up only the owned synthetic database, restore into a second owned
  // database and compare the fixture before attesting it restorable.
  const restoreName=`stock_audit_${randomUUID().replaceAll('-','')}`;
  const restoreUrl=new URL(process.env.DATABASE_URL);
  restoreUrl.pathname=`/${restoreName}`;
  assertIsolatedTestDatabase({...process.env,DATABASE_URL:restoreUrl.toString(),
    STOCK_AUDIT_DATABASE:restoreName});
  let restoreCreated=false;
  const trigger=prefix.replaceAll('-','_')+'_repair_deny';
  let triggerCreated=false;
  const approved=(overrides={})=>[
    '--apply','--approve',overrides.planHash || plan.planHash,
    '--fingerprint',overrides.fingerprint || plan.fingerprint,
    '--database-fingerprint',overrides.databaseFingerprint || plan.readiness.databaseFingerprint,
    '--backup',overrides.backup || resolve(backupFile),
    ...(overrides.verified===false?[]:['--backup-verified']),
  ];
  const denied=[];
  const expectDenied=async (name,args,message,expectedState=before)=>{
    const result=await cli(args);
    expect(result.status,result.stdout).toBe(1);
    expect(result.stderr).toMatch(message);
    expect(await state()).toEqual(expectedState);
    denied.push({name,status:result.status,error:result.stderr.trim(),unchanged:true});
  };
  try{
    const dump=await run('pg_dump',['--dbname',process.env.DATABASE_URL,
      '--format=custom','--no-owner','--no-privileges','--file',backupFile]);
    expect(dump.status,dump.stderr).toBe(0);
    await query(`CREATE DATABASE ${restoreName}`);restoreCreated=true;
    const restored=await run('pg_restore',['--dbname',restoreUrl.toString(),
      '--no-owner','--no-privileges','--exit-on-error',backupFile]);
    expect(restored.status,restored.stderr).toBe(0);
    // The test process is intentionally bound to its one owned database.
    // Verify the recovered copy in a separate guarded process with its own
    // exact target identity rather than weakening or changing that guard.
    const recoveryCheck=await run(process.execPath,['--input-type=module','-e',`
      import {query,withTransaction,closePool} from './api/db.js';
      import {readSaleRepairReadiness} from './api/services/saleEvidenceRepair.js';
      try {
        const result=await query('SELECT id,quantity,unit_cif,unit_dp,metadata FROM stock_movements WHERE reference_id=$1 ORDER BY id',
          [process.env.SYNTHETIC_SALE_REFERENCE]);
        const readiness=await withTransaction(async client=>{
          await client.query('SET TRANSACTION READ ONLY');
          return readSaleRepairReadiness(client);
        });
        console.log(JSON.stringify({movements:result.rows,readiness}));
      } finally { await closePool(); }
    `],{env:{...process.env,DATABASE_URL:restoreUrl.toString(),
      STOCK_AUDIT_DATABASE:restoreName,SYNTHETIC_SALE_REFERENCE:reference}});
    expect(recoveryCheck.status,recoveryCheck.stderr).toBe(0);
    const recovered=JSON.parse(recoveryCheck.stdout);
    expect(recovered.movements).toEqual(before.movements);
    expect(recovered.readiness.databaseFingerprint).not.toBe(plan.readiness.databaseFingerprint);
    await query(`DROP DATABASE ${restoreName} WITH (FORCE)`);restoreCreated=false;

    await expectDenied('missing approval',['--apply'],/Apply requires/);
    await expectDenied('missing backup attestation',approved({verified:false}),/Apply requires/);
    await expectDenied('empty backup',approved({backup:emptyFile}),/nonempty existing file/);
    await expectDenied('missing backup file',approved({backup:resolve(directory,`${prefix}-missing.dump`)}),/ENOENT/);
    await expectDenied('backup path is a directory',approved({backup:resolve(directory)}),/nonempty existing file/);
    await expectDenied('identical fixture but different restored database',approved({
      databaseFingerprint:recovered.readiness.databaseFingerprint,
    }),/Database differs/);
    await expectDenied('wrong plan hash',approved({planHash:'b'.repeat(64)}),/Evidence changed/);
    await expectDenied('stale source fingerprint',approved({fingerprint:'c'.repeat(64)}),/Evidence changed/);
    const changed=before.movements[0];
    await query("UPDATE stock_movements SET metadata=metadata || '{\"synthetic_stale_review\":true}'::jsonb WHERE id=$1",[changed.id]);
    const changedState=await state();
    try{
      await expectDenied('source changed after reviewed dry run',approved(),/Evidence changed/,changedState);
      const changedPlan=await savedReport(await cli([]));
      expect(changedPlan.planHash).toBe(plan.planHash);
      expect(changedPlan.fingerprint).not.toBe(plan.fingerprint);
    }finally{
      await query('UPDATE stock_movements SET metadata=$1::jsonb WHERE id=$2',
        [JSON.stringify(changed.metadata),changed.id]);
    }
    expect(await state()).toEqual(before);
    const sourceIndexes=(await query(`SELECT i.relname AS name,pg_get_indexdef(i.oid) AS ddl
      FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
      JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      JOIN pg_attribute a ON a.attrelid=t.oid AND a.attname='source_key'
      WHERE n.nspname='public' AND t.relname='mis_sales_audit' AND x.indisunique
      AND x.indpred IS NULL AND x.indexprs IS NULL AND x.indnkeyatts=1
      AND x.indkey[0]=a.attnum`)).rows;
    expect(sourceIndexes.length).toBeGreaterThan(0);
    try{
      for(const index of sourceIndexes)await query(`DROP INDEX "${index.name.replaceAll('"','""')}"`);
      await expectDenied('missing unique audit index',approved(),/Repair blocked: Missing valid unique audit source_key index/);
    }finally{
      for(const index of sourceIndexes)await query(index.ddl);
    }

    // A required durable repair audit failure must roll back the metadata too.
    await query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event_type='sale_evidence_repaired' THEN
        RAISE EXCEPTION 'synthetic repair evidence storage failure';
      END IF; RETURN NEW; END$$`);
    await query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON mis_sales_audit
      FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
    triggerCreated=true;
    await expectDenied('repair evidence failure',approved(),/synthetic repair evidence storage failure/);
    await query(`DROP TRIGGER ${trigger} ON mis_sales_audit`);
    await query(`DROP FUNCTION ${trigger}()`);triggerCreated=false;

    const applied=await savedReport(await cli(approved()));
    expect(applied.mode).toBe('apply');
    const {mode:dryRunMode,...reviewedPlan}=plan;
    expect(dryRunMode).toBe('dry-run');
    expect(applied.before).toEqual(reviewedPlan);
    expect(applied.approval).toEqual({
      planHash:plan.planHash,fingerprint:plan.fingerprint,
      databaseFingerprint:plan.readiness.databaseFingerprint,backupVerifiedByOperator:true,
    });
    expect(applied.checks.quantitiesAndPostingsUnchanged).toBe(true);
    expect(applied.checks.invariantBefore).toMatch(/^[a-f0-9]{64}$/);
    expect(applied.checks.invariantAfter).toBe(applied.checks.invariantBefore);
    expect(applied.checks.repairEvents).toHaveLength(1);
    expect(applied.after.eligible).toHaveLength(0);
    const after=await state();
    expect(after.units).toBe(before.units);
    expect(after.movements.map(({metadata,...rest})=>rest))
      .toEqual(before.movements.map(({metadata,...rest})=>rest));
    for(const key of ['receipts','branchBatches','balances','activity','distributorProfit'])
      expect(after[key],`${key} must not change during metadata repair`).toEqual(before[key]);
    expect(after.allocations).toEqual(before.allocations);
    expect(after.mirrors).toEqual(before.mirrors);
    const originalAuditCount=before.audits.filter(row=>row.event_type==='sale_evidence_repaired').length;
    const events=after.audits.filter(row=>row.event_type==='sale_evidence_repaired');
    expect(events).toHaveLength(originalAuditCount+1);
    expect(events.at(-1).details.planHash).toBe(plan.planHash);
    expect(events.at(-1).details.lines[0].before.movementSaleEvidence.dp_unit_price).toBeUndefined();
    expect(events.at(-1).details.lines[0].after.movementSaleEvidence.dp_unit_price).toBe(341);

    const retry=await cli(approved());
    expect(retry.status).toBe(1);
    expect(retry.stderr).toMatch(/Evidence changed/);
    expect(await state()).toEqual(after);

    // Old approval fails closed; a fresh canonical empty plan is an explicit
    // no-op, not permission to reuse the original review after it has changed.
    const noOpPlan=await savedReport(await cli([]));
    expect(noOpPlan.eligible).toHaveLength(0);
    const noOp=await savedReport(await cli(approved({
      planHash:noOpPlan.planHash,fingerprint:noOpPlan.fingerprint,
      databaseFingerprint:noOpPlan.readiness.databaseFingerprint,
    })));
    expect(noOp.before.eligible).toHaveLength(0);
    expect(noOp.after.eligible).toHaveLength(0);
    expect(noOp.checks.repairEvents).toEqual([]);
    expect(noOp.checks.invariantAfter).toBe(noOp.checks.invariantBefore);
    expect(await state()).toEqual(after);

    // Force only the file report to fail after a second synthetic commit.
    // The durable in-transaction evidence must still survive.
    await query(`UPDATE stock_movements SET metadata=jsonb_set(metadata,'{sale_evidence}',
      (metadata->'sale_evidence')-'business_date') WHERE reference_id=$1`,[reference]);
    const fileFailureBefore=await state();
    const fileFailurePlan=await savedReport(await cli([]));
    const blockedDirectory=await mkdtemp(join(tmpdir(),'sale-repair-report-'));
    let fileFailure;
    try{
      await writeFile(join(blockedDirectory,'generated-artifacts'),'synthetic path blocker',{mode:0o600});
      fileFailure=await cli(approved({planHash:fileFailurePlan.planHash,
        fingerprint:fileFailurePlan.fingerprint}),{cwd:blockedDirectory});
      expect(fileFailure.status).toBe(1);
      expect(fileFailure.stderr).toMatch(/Repair committed, but its file report could not be saved/);
      const retained=await state();
      expect(retained.units).toBe(fileFailureBefore.units);
      expect(retained.audits.filter(row=>row.event_type==='sale_evidence_repaired'))
        .toHaveLength(fileFailureBefore.audits.filter(row=>row.event_type==='sale_evidence_repaired').length+1);
      expect(retained.audits.at(-1).details.lines[0].before.movementSaleEvidence.business_date).toBeUndefined();
      expect(retained.audits.at(-1).details.lines[0].after.movementSaleEvidence.business_date).toBeTruthy();
      expect((await savedReport(await cli([]))).eligible).toHaveLength(0);
    }finally{
      await rm(blockedDirectory,{recursive:true,force:true});
    }
    await writeFile(`${directory}/results.json`,JSON.stringify({
      synthetic:true,scope:'Owned disposable database only; no live approval or repair',
      backupAuthority:'Synthetic disposable fixture only; NOT verification of a business backup and NOT production apply authorization',
      canonicalDryRun:{mode:plan.mode,servicePlanMatches:true,repeatedCliMatches:true,
        primary:plan.readiness.isPrimary,schemaReady:plan.readiness.schemaReady},
      backupRestoredAndCompared:true,denied,
      apply:{status:0,checks:applied.checks,remainingEligible:applied.after.eligible.length},
      retry:{status:retry.status,error:retry.stderr.trim(),unchanged:true},
      freshNoOp:{status:0,checks:noOp.checks,unchanged:true},
      fileReportFailure:{status:fileFailure.status,error:fileFailure.stderr.trim(),durableEvidenceRetained:true},
      actualReplicaCommand:'NOT VERIFIED — no standby was provisioned; replica gate is unit-tested',
    },null,2),{mode:0o600});
  }finally{
    if(triggerCreated){
      await query(`DROP TRIGGER IF EXISTS ${trigger} ON mis_sales_audit`);
      await query(`DROP FUNCTION IF EXISTS ${trigger}()`);
    }
    if(restoreCreated)await query(`DROP DATABASE ${restoreName} WITH (FORCE)`);
    await unlink(backupFile).catch(()=>{});
    await unlink(emptyFile).catch(()=>{});
  }
},180000);
