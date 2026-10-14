// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query } from '../api/db.js';
import { reversalSchema } from '../api/services/linkedReversals.js';
import { saleAllocationSchema } from '../api/services/stockSaleAllocations.js';
import requestRefund from '../api/branch/refund-requests.js';
import approveRefund from '../api/stock/refund-requests.js';
import dispatchReturn from '../api/stock/dispatch-returns.js';
import transfers from '../api/stock/transfers.js';
import legacyReceipt from '../api/stock/receive-request.js';
import walkinSales from '../api/branch/walkin-sales.js';
import dispensing from '../api/branch/dispense.js';
import controlledStock from '../api/stock/controlled-operations.js';
import { sourceSnapshot } from '../api/services/stockCostLayers.js';
import refundAllocations from '../api/branch/refund-allocations.js';

const prefix=`TEST-LINKED-${randomUUID().slice(0,8)}`;
const product=prefix;
const branch=`${prefix.toLowerCase()}_branch`;
const warehouse='windhoek_warehouse';
const stockUser={id:prefix,role:'stock_manager',fullName:'Isolated stock tester'};
const branchUser={id:prefix,role:'dispenser',branch,fullName:'Isolated branch tester'};
const admin={id:prefix,role:'admin',fullName:'Isolated admin tester'};
const source={id:`${prefix}-source`,description:product,batch_no:'ORIGINAL',expiry_date:'2031-06-30',
  cif_unit_cost:2.345678,dpc_unit_value:7.25};

async function call(handler,method,body,user=stockUser,url='/api/test') {
  const result={status:200};
  const res={setHeader(){},getHeader(){},status(n){result.status=n;return this;},json(body){result.body=body;return this;},end(){return this;},send(body){result.body=body;return this;}};
  await handler({method,url,headers:{host:'localhost'},body,user},res);
  return result;
}
async function seedSale(suffix,expiry='2031-06-30',layers=null) {
  const sale=`${prefix}-${suffix}`;
  const batch=`${sale}-batch`;
  const movement=`${sale}-movement`;
  const lot=`ORIGINAL-${suffix}`;
  const snapshot={id:batch,batch_type:'branch',location:branch,product_name:product,batch_no:lot,expiry_date:expiry,
    quantity:8,revenue_unit:12.5,financial_dp_unit:7.25,bv_unit:3,unit_cost:2.345678,unit_dp:7.25,
    source_batch_id:source.id,original_source:{...source,expiry_date:expiry},
    cost_layers:layers || [{quantity:8,source:{...source,expiry_date:expiry}}]};
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,status,metadata)
    VALUES($1,$2,$3,$6,$4,2,7.25,'in_stock',$5)`,[batch,branch,product,expiry,JSON.stringify({cost_layers:[{quantity:2,source}]}),lot]);
  await query(`INSERT INTO stock_movements(id,product_name,batch_no,expiry_date,quantity,movement_type,source_location,source_location_type,destination_location,reference_id,status,unit_cif,unit_dp)
    VALUES($1,$2,$6,$3,8,'walk_in_member_sale',$4,'branch','customer',$5,'posted',2.345678,7.25)`,[movement,product,expiry,branch,sale,lot]);
  await query(`INSERT INTO stock_sale_allocations(movement_id,sale_reference,branch_batch_id,branch_id,product_name,batch_no,expiry_date,quantity,snapshot)
    VALUES($1,$2,$3,$4,$5,$8,$6,8,$7)`,[movement,sale,batch,branch,product,expiry,JSON.stringify(snapshot),lot]);
  await query(`INSERT INTO branch_distributor_profit(id,branch_id,distributor_nb,sale_id,sale_receipt,sale_date,profit_amount,status)
    VALUES($1,$2,'TEST-NB',$3,$3,NOW(),40,'pending')`,[`${sale}-profit`,branch,sale]);
  return {sale,batch,movement,snapshot};
}
async function submit(sale,quantity,key=`${prefix}-${randomUUID()}`,extras={}) {
  return call(requestRefund,'POST',{allocation_id:sale.movement,quantity,reason:'Goods physically returned',physical_return_confirmed:true,operation_key:key,...extras},branchUser);
}
it('finds original refundable allocations by displayed receipt only within the authorized branch',async()=>{
  const sale=await seedSale('receipt-lookup');
  const receipt=`${prefix}-TW-2026-000001`;
  await query(`INSERT INTO branch_walkin_sales(id,branch_id,sale_number,status)
    VALUES($1,$2,$3,'completed')`,[sale.sale,branch,receipt]);
  const url=`/api/branch/refund-allocations?branch_id=${encodeURIComponent(branch)}&sale_reference=${encodeURIComponent(receipt)}`;
  const found=await call(refundAllocations,'GET',null,branchUser,url);
  expect(found.status,JSON.stringify(found.body)).toBe(200);
  expect(found.body.allocations.map(a=>a.sale_reference)).toEqual([sale.sale]);
  expect(Number(found.body.allocations[0].remaining_quantity)).toBe(8);
  expect((await call(refundAllocations,'GET',null,{...branchUser,branch:'different_branch'},url)).status).toBe(403);
});
async function approve(id,condition='saleable',extras={}) {
  return call(approveRefund,'PATCH',{id,action:'approve',return_condition:condition,physical_return_confirmed:true,inspection_reason:'Inspected original lot and sealed packaging',...extras});
}
async function qty(table,id,column) {
  return Number((await query(`SELECT ${column} AS qty FROM ${table} WHERE id=$1`,[id])).rows[0].qty);
}
async function seedDispatch(suffix) {
  const id=`${prefix}-dispatch-${suffix}`;
  const batch=`${id}-source`;
  await query(`INSERT INTO stock_batches(id,description,location,batch_no,expiry_date,quantity,remaining_quantity,dispatched_quantity,status,cif_unit_cost,dpc_unit_value)
    VALUES($1,$2,$3,'ORIGINAL','2031-06-30',20,10,10,'available',2.345678,7.25)`,[batch,product,warehouse]);
  await query(`INSERT INTO stock_transfers(id,from_warehouse,to_branch,status,gm_approved_by)
    VALUES($1,$2,$3,'dispatched','Test GM')`,[id,warehouse,branch]);
  const line=(await query(`INSERT INTO stock_transfer_items(transfer_id,product_name,product_id,batch_no,expiry_date,quantity,quantity_approved,quantity_received)
    VALUES($1,$2,$2,'ORIGINAL','2031-06-30',10,10,0) RETURNING id`,[id,product])).rows[0].id;
  const allocation=`${id}-allocation`;
  const receivedSource=sourceSnapshot((await query('SELECT * FROM stock_batches WHERE id=$1',[batch])).rows[0]);
  const inventory=`${prefix}-warehouse-inventory`;
  const inventoryQuantity=Number((await query(`INSERT INTO warehouse_inventory
    (id,warehouse_id,product_id,product_name,batch_no,expiry_date,quantity,status)
    VALUES($1,$2,$3,$3,'ORIGINAL','2031-06-30',10,'in_stock')
    ON CONFLICT(id) DO UPDATE SET quantity=warehouse_inventory.quantity+10 RETURNING quantity`,
    [inventory,warehouse,product])).rows[0].quantity);
  await query(`INSERT INTO stock_transfer_allocations(id,transfer_id,line_id,source_type,source_id,quantity,snapshot)
    VALUES($1,$2,$3,'stock',$4,10,$5)`,[allocation,id,line,batch,JSON.stringify({source:receivedSource,product_name:product,batch_no:'ORIGINAL',expiry_date:'2031-06-30'})]);
  await query(`INSERT INTO stock_movements(id,product_name,batch_no,expiry_date,quantity,movement_type,source_location,source_location_type,destination_location,destination_location_type,reference_id,status)
    VALUES($1,$2,'ORIGINAL','2031-06-30',10,'transit_dispatch',$3,'warehouse',$4,'in_transit',$5,'posted')`,
    [`${id}-movement`,product,warehouse,`in_transit:${id}`,id]);
  return {id,batch,line,allocation,inventory,inventoryQuantity,sourceCost:receivedSource.cif_unit_cost};
}
const returnBody=(dispatch,quantity,key=`${prefix}-${randomUUID()}`)=>({transfer_id:dispatch.id,allocation_id:dispatch.allocation,quantity,operation_key:key,reason:'Driver physically brought undelivered goods back',return_condition:'saleable',physical_return_confirmed:true});
const receiptBody=(dispatch,quantity)=>({id:dispatch.id,status:'partially_received',items:[{product_name:product,batch_no:'ORIGINAL',expiry_date:'2031-06-30',quantity_received:quantity}]});

async function cleanup() {
  const controlIds=(await query(`SELECT id FROM stock_control_operations WHERE EXISTS
    (SELECT 1 FROM jsonb_array_elements(lines) line WHERE line->'snapshot'->>'product_name'=$1)`,[product])).rows.map(row=>row.id);
  await query('DELETE FROM stock_control_financial_entries WHERE operation_id=ANY($1::text[])',[controlIds]);
  await query('DELETE FROM supplier_return_credits WHERE operation_id=ANY($1::text[])',[controlIds]);
  await query('DELETE FROM stock_control_operations WHERE id=ANY($1::text[])',[controlIds]);
  await query('DELETE FROM campaigns WHERE id LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM branch_distributor_profit WHERE branch_id=$1',[branch]);
  await query('DELETE FROM branch_activity_transactions WHERE branch_id=$1',[branch]);
  await query('DELETE FROM branch_refund_requests WHERE branch_id=$1',[branch]);
  await query('DELETE FROM branch_walkin_sales WHERE id LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM reports WHERE id LIKE $1',[`${prefix}%`]);
  await query("DELETE FROM stock_segregated_batches WHERE snapshot->>'product_name'=$1",[product]);
  await query('DELETE FROM stock_linked_reversals WHERE original_reference LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM stock_movements WHERE product_name=$1',[product]);
  await query('DELETE FROM branch_inventory_movements WHERE product_name=$1',[product]);
  await query('DELETE FROM branch_inventory_batches WHERE product_name=$1',[product]);
  await query('DELETE FROM inventory_balances WHERE product_name=$1',[product]);
  await query('DELETE FROM dispatch_notes WHERE transfer_id LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM stock_transfer_allocations WHERE transfer_id LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM stock_transfer_items WHERE product_name=$1',[product]);
  await query('DELETE FROM stock_transfers WHERE id LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM stock_batches WHERE description=$1',[product]);
  await query('DELETE FROM warehouse_inventory WHERE product_name=$1',[product]);
  await query('DELETE FROM stock_request_items WHERE request_id LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM stock_requests WHERE id LIKE $1',[`${prefix}%`]);
}

describe.sequential('linked physical returns preserve stock and financial evidence',()=>{
  beforeAll(async()=>{await query(saleAllocationSchema);await query(reversalSchema);});
  afterAll(cleanup);
  it('serializes authorized reservation cancellation and releases only its original reserved allocation',async()=>{
    const dispatch=await seedDispatch('reservation'),reason='Branch withdrew the request before shipment';
    await query("UPDATE stock_transfers SET status='approved' WHERE id=$1",[dispatch.id]);
    await query("UPDATE stock_movements SET movement_type='reserved' WHERE reference_id=$1 AND movement_type='transit_dispatch'",[dispatch.id]);
    const body={action:'cancel_reservation',transfer_id:dispatch.id,reason};
    expect((await call(dispatchReturn,'POST',body,branchUser)).status).toBe(403);
    const replies=await Promise.all([call(dispatchReturn,'POST',body),call(dispatchReturn,'POST',body)]);
    expect(replies.map(row=>row.status).sort(),JSON.stringify(replies)).toEqual([200,409]);
    expect(await qty('stock_batches',dispatch.batch,'remaining_quantity')).toBe(20);
    expect(await qty('warehouse_inventory',dispatch.inventory,'quantity')).toBe(dispatch.inventoryQuantity+10);
    const transfer=(await query('SELECT * FROM stock_transfers WHERE id=$1',[dispatch.id])).rows[0];
    expect(transfer.status).toBe('cancelled');
    expect(transfer.dispatch_notes).toContain(reason);
    expect((await query("SELECT status FROM stock_movements WHERE reference_id=$1 AND movement_type='reserved'",[dispatch.id])).rows[0].status).toBe('cancelled');
  });
  it('authorizes by role and branch, requires physical evidence and derives prices on the server',async()=>{
    const sale=await seedSale('auth');
    expect((await submit(sale,1,undefined,{physical_return_confirmed:false})).status).toBe(400);
    expect((await call(requestRefund,'POST',{allocation_id:sale.movement,quantity:1,reason:'Return',physical_return_confirmed:true,operation_key:`${prefix}-denied`},{...branchUser,branch:'another_branch'})).status).toBe(403);
    expect((await call(requestRefund,'POST',{},null)).status).toBe(401);
    expect((await call(dispatchReturn,'POST',{},branchUser)).status).toBe(403);
    const result=await submit(sale,1,undefined,{unit_price:999,refund_amount:999});
    expect(result.status,JSON.stringify(result)).toBe(200);
    expect(Number(result.body.refund_amount)).toBe(12.5);
    expect((await approve(result.body.id,'saleable',{physical_return_confirmed:false})).status).toBe(400);
    expect(await qty('branch_inventory_batches',sale.batch,'quantity')).toBe(2);
  });
  it('deduplicates simultaneous request retries and approves the same refund at most once',async()=>{
    const sale=await seedSale('retry');
    const results=await Promise.all([submit(sale,3,`${prefix}-request-retry`),submit(sale,3,`${prefix}-request-retry`)]);
    expect(results.map(r=>r.status)).toEqual([200,200]);
    expect(results[0].body.id).toBe(results[1].body.id);
    const id=results[0].body.id;
    const approvals=await Promise.all([approve(id),approve(id)]);
    expect(approvals.map(r=>r.status).sort(),JSON.stringify(approvals)).toEqual([200,409]);
    expect(await qty('branch_inventory_batches',sale.batch,'quantity')).toBe(5);
    const financial=(await query('SELECT * FROM branch_activity_transactions WHERE form_reference_id=$1',[id])).rows;
    expect(financial).toHaveLength(1);
    expect(Number(financial[0].grand_total)).toBe(-37.5);
    expect(Number(financial[0].product_total_dp)).toBe(-21.75);
    expect(Number(financial[0].total_bv)).toBe(-9);
    expect((await query('SELECT status FROM stock_movements WHERE id=$1',[sale.movement])).rows[0].status).toBe('posted');
    expect((await submit(sale,6)).status).toBe(409);
    expect((await submit(sale,1,`${prefix}-request-retry`)).status).toBe(409);
    expect(Number((await query('SELECT SUM(profit_amount) AS amount FROM branch_distributor_profit WHERE sale_receipt=$1',[sale.sale])).rows[0].amount)).toBe(25);
  });
  it('keeps posted sale quantities and money immutable while preserving a harmless customer-name edit',async()=>{
    const sale=await seedSale('edit');
    await query(`INSERT INTO branch_walkin_sales(id,branch_id,customer_name,total,status,data)
      VALUES($1,$2,'Fixture customer',100,'completed',$3)`,[sale.sale,branch,JSON.stringify({items:[{product_name:product,quantity:8,unit_price:12.5}]})]);
    const edit=await call(walkinSales,'PATCH',{id:sale.sale,items:[{product_name:product,quantity:7,unit_price:12.5}]},admin);
    expect(edit.status,JSON.stringify(edit)).toBe(409);
    expect((await call(walkinSales,'DELETE',{id:sale.sale},admin)).status).toBe(409);
    const name=await call(walkinSales,'PATCH',{id:sale.sale,customer_name:'Corrected fixture name'},admin);
    expect(name.status,JSON.stringify(name)).toBe(200);
    expect(await qty('branch_inventory_batches',sale.batch,'quantity')).toBe(2);
    expect(Number((await query('SELECT total FROM branch_walkin_sales WHERE id=$1',[sale.sale])).rows[0].total)).toBe(100);
  });
  it('serializes distinct requests against the same original entitlement',async()=>{
    const sale=await seedSale('cap');
    const results=await Promise.all([submit(sale,5),submit(sale,5)]);
    expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  });
  it('does not reissue a returned prescription or let client-marked free items bypass its entitlement',async()=>{
    const sale=await seedSale('prescription');
    await query('INSERT INTO reports(id,branch,data) VALUES($1,$2,$3)',[sale.sale,branch,JSON.stringify({
      medicines:[{name:product,quantity:8,dispensed_qty:8,dispensed:true}],
    })]);
    const returned=await submit(sale,1);
    expect((await approve(returned.body.id)).status).toBe(200);
    const body={branchId:branch,reportId:sale.sale,customerType:'member',items:[{product_name:product,quantity:1}]};
    expect((await call(dispensing,'POST',body,admin)).status).toBe(409);
    const free=await call(dispensing,'POST',{...body,items:[{product_name:product,quantity:1,is_free:true}]},admin);
    expect(free.status,JSON.stringify(free)).toBe(409);
    // Fractional issues are valid quantities, but cannot reopen exhausted entitlement.
    expect((await call(dispensing,'POST',{...body,items:[{product_name:product,quantity:0.5}]},admin)).status).toBe(409);
    expect(await qty('branch_inventory_batches',sale.batch,'quantity')).toBe(3);
  });
  it('segregates damaged and expired returns without crediting saleable stock',async()=>{
    const sale=await seedSale('damaged');
    const result=await submit(sale,2);
    const approval=await approve(result.body.id,'damaged');
    expect(approval.status,JSON.stringify(approval)).toBe(200);
    expect(await qty('branch_inventory_batches',sale.batch,'quantity')).toBe(2);
    const segregated=(await query('SELECT * FROM stock_segregated_batches WHERE operation_id=$1',[result.body.id])).rows;
    expect(segregated).toHaveLength(1);
    expect(Number(segregated[0].quantity)).toBe(2);
    const expired=await seedSale('expired','2020-01-01');
    const request=await submit(expired,2);
    expect((await approve(request.body.id)).status).toBe(400);
    expect((await approve(request.body.id,'expired')).status).toBe(200);
    expect(await qty('branch_inventory_batches',expired.batch,'quantity')).toBe(2);
  });
  it('dispenses a legitimate branch-scoped paid/free campaign without reopening prescription entitlement',async()=>{
    await seedSale('scoped-campaign-stock');
    const reportId=`${prefix}-scoped-report`,campaignId=`${prefix}-scoped-campaign`;
    await query(`INSERT INTO reports(id,branch,data) VALUES($1,$2,$3)`,[reportId,branch,
      JSON.stringify({medicines:[{name:product,quantity:1}]})]);
    await query(`INSERT INTO campaigns(id,name,campaign_type,start_date,end_date,status,scope,conditions,prize)
      VALUES($1,'Isolated branch campaign','buy_x_get_y',CURRENT_DATE-1,CURRENT_DATE+1,'approved','branch',$2,$3)`,
      [campaignId,JSON.stringify({products_text:product,buy_qty:1,get_qty:1,stock_assignments:[{branch}]}),JSON.stringify({free_product:product})]);
    const body={branchId:branch,reportId,customerType:'member',patientName:'Isolated campaign fixture',
      items:[{product_name:product,quantity:1,dp:7.25,cp:12.5},
        {product_name:product,quantity:1,is_free:true,campaign_bxgy:{campId:campaignId,paidProduct:product}}]};
    const result=await call(dispensing,'POST',body,admin);
    expect(result.status,JSON.stringify(result)).toBe(200);
    const allocations=(await query(`SELECT a.quantity,m.movement_type FROM stock_sale_allocations a
      JOIN stock_movements m ON m.id=a.movement_id WHERE a.sale_reference=$1`,[reportId])).rows;
    expect(allocations.reduce((sum,row)=>sum+Number(row.quantity),0)).toBe(2);
    expect(allocations.filter(row=>row.movement_type==='campaign_free_item').reduce((sum,row)=>sum+Number(row.quantity),0)).toBe(1);
    const report=(await query('SELECT data FROM reports WHERE id=$1',[reportId])).rows[0].data;
    expect(report.medicines[0].dispensed_qty).toBe(1);
    expect((await call(dispensing,'POST',body,admin)).status).toBe(409);
  });
  it('restores only the original cost layers consumed by a partial return',async()=>{
    const sale=await seedSale('mixed','2031-06-30',[{quantity:2,source:{...source,cif_unit_cost:1.123456}},{quantity:6,source:{...source,id:`${prefix}-other`,cif_unit_cost:4.765432}}]);
    const refund=await submit(sale,3);
    const result=await approve(refund.body.id);
    expect(result.status,JSON.stringify(result)).toBe(200);
    const row=(await query('SELECT * FROM branch_inventory_batches WHERE id=$1',[sale.batch])).rows[0];
    expect(row.metadata.cost_layers.map(l=>Number(l.quantity))).toEqual([2,2,1]);
    const movement=(await query("SELECT unit_cif FROM stock_movements WHERE reference_id=$1 AND movement_type='refund_return'",[refund.body.id])).rows[0];
    expect(Number(movement.unit_cif)).toBeCloseTo((2*1.123456+4.765432)/3,4);
  });
  it('recognizes legacy approved refunds and rejects unlinked approvals instead of guessing provenance',async()=>{
    const sale=await seedSale('legacy');
    const id=`${prefix}-legacy-refund`;
    await query(`INSERT INTO branch_refund_requests(id,branch_id,sale_reference,product_name,batch_no,quantity,unit_price,refund_amount,reason,status)
      VALUES($1,$2,$3,$4,$5,6,12.5,75,'Legacy evidence','approved')`,[id,branch,sale.sale,product,sale.snapshot.batch_no]);
    expect((await submit(sale,3)).status).toBe(409);
    await query("UPDATE branch_refund_requests SET status='pending' WHERE id=$1",[id]);
    expect((await approve(id)).status).toBe(409);
  });
  it('returns only undelivered quantities, then receives the remaining allocations without double-crediting source',async()=>{
    const d=await seedDispatch('partial');
    expect((await call(transfers,'PATCH',receiptBody(d,4),admin)).status).toBe(200);
    const body=returnBody(d,3,`${prefix}-dispatch-retry`);
    const returns=await Promise.all([call(dispatchReturn,'POST',body),call(dispatchReturn,'POST',body)]);
    expect(returns.map(r=>r.status),JSON.stringify(returns)).toEqual([200,200]);
    expect(returns[0].body.id).toBe(returns[1].body.id);
    expect(await qty('stock_batches',d.batch,'remaining_quantity')).toBe(13);
    expect(await qty('stock_batches',d.batch,'dispatched_quantity')).toBe(7);
    expect(await qty('warehouse_inventory',d.inventory,'quantity')).toBe(d.inventoryQuantity+3);
    expect((await call(dispatchReturn,'POST',returnBody(d,4))).status).toBe(409);
    expect((await call(transfers,'PATCH',receiptBody(d,8),admin)).status).toBe(400);
    expect((await call(transfers,'PATCH',receiptBody(d,7),admin)).status).toBe(200);
    expect(await qty('stock_transfer_items',d.line,'quantity_received')).toBe(7);
    expect(await qty('stock_batches',d.batch,'remaining_quantity')).toBe(13);
    expect(await qty('warehouse_inventory',d.inventory,'quantity')).toBe(d.inventoryQuantity+3);
    expect(Number((await query("SELECT SUM(quantity) AS quantity FROM stock_movements WHERE reference_id=$1 AND movement_type='transit_receipt'",[d.id])).rows[0].quantity)).toBe(7);
    expect((await call(dispatchReturn,'POST',returnBody(d,1))).status).toBe(409);
    expect((await call(dispatchReturn,'POST',body)).status).toBe(200);
  });
  it('serializes simultaneous receipts and returns so combined quantities never exceed dispatch',async()=>{
    const d=await seedDispatch('concurrent');
    const results=await Promise.all([call(dispatchReturn,'POST',returnBody(d,6)),call(transfers,'PATCH',receiptBody(d,6),admin)]);
    expect(results.filter(r=>r.status===200)).toHaveLength(1);
    expect(results.filter(r=>r.status>=400)).toHaveLength(1);
    const returned=Number((await query("SELECT COALESCE(SUM(quantity),0) AS qty FROM stock_linked_reversals WHERE original_reference=$1",[d.id])).rows[0].qty);
    expect(returned+await qty('stock_transfer_items',d.line,'quantity_received')).toBeLessThanOrEqual(10);
  });
  it('segregates an entire damaged transit return without making source stock available',async()=>{
    const d=await seedDispatch('damaged-transit');
    const result=await call(dispatchReturn,'POST',{...returnBody(d,10),return_condition:'damaged'});
    expect(result.status,JSON.stringify(result)).toBe(200);
    expect(await qty('stock_batches',d.batch,'remaining_quantity')).toBe(10);
    expect(await qty('stock_batches',d.batch,'dispatched_quantity')).toBe(0);
    expect(await qty('warehouse_inventory',d.inventory,'quantity')).toBe(d.inventoryQuantity);
    const held=(await query('SELECT * FROM stock_segregated_batches WHERE operation_id=$1',[result.body.id])).rows[0];
    expect(Number(held.quantity)).toBe(10);
    expect(held.condition).toBe('damaged');
    expect((await query('SELECT status FROM stock_transfers WHERE id=$1',[d.id])).rows[0].status).toBe('returned');
    expect((await call(transfers,'PATCH',receiptBody(d,1),admin)).status).toBe(409);
  });
  it('releases partial damaged dispatch quantities without crediting either available register twice',async()=>{
    const d=await seedDispatch('mixed-condition');
    const damaged=await call(dispatchReturn,'POST',{...returnBody(d,3),return_condition:'quarantine'});
    expect(damaged.status,JSON.stringify(damaged)).toBe(200);
    expect(await qty('stock_batches',d.batch,'remaining_quantity')).toBe(10);
    expect(await qty('stock_batches',d.batch,'dispatched_quantity')).toBe(7);
    expect(await qty('warehouse_inventory',d.inventory,'quantity')).toBe(d.inventoryQuantity);
    const body=returnBody(d,3);
    expect((await call(dispatchReturn,'POST',body)).status).toBe(200);
    expect((await call(dispatchReturn,'POST',body)).status).toBe(200);
    expect(await qty('stock_batches',d.batch,'remaining_quantity')).toBe(13);
    expect(await qty('stock_batches',d.batch,'dispatched_quantity')).toBe(4);
    expect(await qty('warehouse_inventory',d.inventory,'quantity')).toBe(d.inventoryQuantity+3);
  });
  it('GM releases warehouse quarantine into the original warehouse registers without releasing another reservation',async()=>{
    const d=await seedDispatch('warehouse-inspection');
    const returned=await call(dispatchReturn,'POST',{...returnBody(d,10),return_condition:'quarantine'});
    expect(returned.status,JSON.stringify(returned)).toBe(200);
    const held=(await query('SELECT * FROM stock_segregated_batches WHERE operation_id=$1',[returned.body.id])).rows[0];
    // A later, unrelated four-unit reservation must stay reserved during release.
    await query('UPDATE stock_batches SET remaining_quantity=6,dispatched_quantity=4 WHERE id=$1',[d.batch]);
    await query('UPDATE warehouse_inventory SET quantity=quantity-4 WHERE id=$1',[d.inventory]);
    const created=await call(controlledStock,'POST',{kind:'inspection',reason:'Inspect original warehouse quarantine',
      lines:[{batch_type:'segregated',batch_id:held.id,condition:'saleable',quantity:5,disposition:'release',reason:'Physical inspection passed'}]},{...stockUser,role:'stock'});
    expect(created.status,JSON.stringify(created)).toBe(201);
    const op=created.body.operation,review={id:op.id,action:'review',decisions:[{line_id:op.lines[0].id,decision:'approve'}]};
    const gm={id:`${prefix}-gm`,role:'gm'};
    const approved=await call(controlledStock,'PATCH',review,gm);
    expect(approved.status,JSON.stringify(approved)).toBe(200);
    expect(await qty('stock_batches',d.batch,'remaining_quantity')).toBe(11);
    expect(await qty('stock_batches',d.batch,'dispatched_quantity')).toBe(4);
    expect(await qty('stock_batches',d.batch,'quantity')).toBe(20);
    expect(await qty('warehouse_inventory',d.inventory,'quantity')).toBe(d.inventoryQuantity+1);
    expect(await qty('stock_segregated_batches',held.id,'quantity')).toBe(5);
    const source=(await query('SELECT cif_unit_cost,expiry_date FROM stock_batches WHERE id=$1',[d.batch])).rows[0];
    expect(Number(source.cif_unit_cost)).toBe(d.sourceCost);
    expect(new Date(source.expiry_date).toISOString().slice(0,10)).toBe('2031-06-30');
    expect((await query('SELECT id FROM branch_inventory_batches WHERE branch_id=$1 AND product_name=$2',[warehouse,product])).rows).toHaveLength(0);
    expect((await call(controlledStock,'PATCH',review,gm)).status).toBe(409);
    expect(await qty('stock_batches',d.batch,'remaining_quantity')).toBe(11);
    expect(await qty('warehouse_inventory',d.inventory,'quantity')).toBe(d.inventoryQuantity+1);
  });
  it('deduplicates concurrent partial legacy receipts and preserves the remaining line cap',async()=>{
    const id=`${prefix}-legacy-partial`,batch=`${id}-batch`;
    await query(`INSERT INTO stock_batches(id,description,batch_no,expiry_date,quantity,remaining_quantity,location,warehouse_id,status)
      VALUES($1,$2,'LEGACY','2031-06-30',3,3,$3,$3,'available')`,[batch,product,warehouse]);
    await query(`INSERT INTO stock_requests(id,request_number,requesting_branch,status,dispatch_warehouse,items)
      VALUES($1,$2,$3,'dispatched',$4,'[]')`,[id,`${id}-number`,branch,warehouse]);
    await query(`INSERT INTO stock_request_items(request_id,product_name,product_id,quantity) VALUES($1,$2,$2,3)`,[id,product]);
    const body={requestId:id,branchId:branch,warehouseSource:warehouse,receiptId:`${id}-receipt`,
      items:[{productName:product,batchNo:'LEGACY',expiryDate:'2031-06-30',quantity:1}]};
    const receipts=await Promise.all([call(legacyReceipt,'POST',body,admin),call(legacyReceipt,'POST',body,admin)]);
    expect(receipts.map(result=>result.status).sort(),JSON.stringify(receipts)).toEqual([200,409]);
    expect(await qty('stock_batches',batch,'remaining_quantity')).toBe(2);
    expect((await query('SELECT status FROM stock_requests WHERE id=$1',[id])).rows[0].status).toBe('partially_received');
    const final=await call(legacyReceipt,'POST',{...body,receiptId:`${id}-final`,
      items:[{...body.items[0],quantity:2}]},admin);
    expect(final.status,JSON.stringify(final)).toBe(200);
    expect(await qty('stock_batches',batch,'remaining_quantity')).toBe(0);
    const destination=(await query("SELECT quantity FROM branch_inventory_batches WHERE branch_id=$1 AND product_name=$2 AND batch_no='LEGACY'",[branch,product])).rows[0];
    expect(Number(destination.quantity)).toBe(3);
    expect((await query('SELECT status FROM stock_requests WHERE id=$1',[id])).rows[0].status).toBe('received');
    expect((await call(legacyReceipt,'POST',body,admin)).status).toBe(409);
  });
  it('caps unlinked legacy request receipts across duplicate product lines',async()=>{
    const id=`${prefix}-legacy-request`;
    await query(`INSERT INTO stock_requests(id,request_number,requesting_branch,status,dispatch_warehouse,items)
      VALUES($1,$1,$2,'dispatched',$3,'[]')`,[id,branch,warehouse]);
    await query(`INSERT INTO stock_request_items(request_id,product_name,product_id,quantity) VALUES($1,$2,$2,3)`,[id,product]);
    const result=await call(legacyReceipt,'POST',{requestId:id,branchId:branch,warehouseSource:warehouse,items:[
      {product_name:product,batch_no:'ORIGINAL',expiry_date:'2031-06-30',quantity:2},
      {product_name:product,batch_no:'ORIGINAL',expiry_date:'2031-06-30',quantity:2},
    ]},admin);
    expect(result.status,JSON.stringify(result)).toBe(409);
    expect((await query('SELECT status FROM stock_requests WHERE id=$1',[id])).rows[0].status).toBe('dispatched');
  });
});
