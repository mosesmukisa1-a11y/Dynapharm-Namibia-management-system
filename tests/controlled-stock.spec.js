// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../api/db.js';
import controlled from '../api/stock/controlled-operations.js';
import refunds from '../api/stock/refund-requests.js';
import { ensureControlledStockSchema, countDifference } from '../api/services/controlledStock.js';
import { deductStock } from '../api/branch/campaign-sale.js';
import { receiveTransferTx } from '../api/services/transferReceipt.js';

const prefix = `TEST-CTRL-${randomUUID()}`;
const branch = `${prefix}_branch`;
const warehouse = `${prefix}_warehouse`;
const product = `${prefix}-PRODUCT`;
const supplier = `${prefix}-IMPORT`;
const source = `${prefix}-SOURCE`;
const b1 = `${prefix}-B1`, b2 = `${prefix}-B2`;
const gm = { id: `${prefix}-GM`, role: 'gm' };
const staff = { id: `${prefix}-STAFF`, role: 'stock' };
const scopedStaff = { id: `${prefix}-BRANCH`, role: 'branch_manager', branch };
const finance = { id: `${prefix}-FINANCE`, role: 'finance' };
const expiry = '2035-12-31';
let original;
async function invoke(method, body, user = staff, handler = controlled) {
  const result = { status: 200 };
  const res = { setHeader() {},status(code) { result.status = code; return this; },
    json(value) { result.body=value; return this; },end() {} };
  await handler({method,body,user,url:'/api/stock/controlled-operations',headers:{host:'localhost'}},res);
  return result;
}
async function create(kind, lines, user = staff) {
  const result = await invoke('POST',{kind,reason:'Isolated operational evidence',lines},user);
  expect(result.status,JSON.stringify(result.body)).toBe(201);
  return result.body.operation;
}
async function update(body, user = gm) {
  const result = await invoke('PATCH',body,user);
  expect(result.status,JSON.stringify(result.body)).toBe(200);
  return result.body.operation;
}
async function count(ids=[b1]) {
  const op=await create('count',ids.map(batch_id=>({batch_type:'branch',batch_id})),scopedStaff);
  return op;
}
async function submit(op, counts) {
  return update({id:op.id,action:'submit',lines:op.lines.map((l,i)=>({id:l.id,counted_quantity:counts[i],reason:'Cutoff count evidence'}))},scopedStaff);
}
const decision = (l, quantity) => ({line_id:l.id,decision:'approve',...(quantity===undefined?{}:{quantity})});
const requestLine = (id, type='branch', condition='saleable', quantity=5, disposition='quarantine') =>
  ({batch_type:type,batch_id:id,condition,quantity,disposition,reason:'Inspected return evidence'});
async function qty(id=b1,table='branch_inventory_batches') {
  return Number((await query(`SELECT ${table==='stock_batches'?'remaining_quantity':'quantity'} AS qty FROM ${table} WHERE id=$1`,[id])).rows[0]?.qty);
}
async function baseline() {
  return {
    branches:(await query("SELECT id,quantity,status FROM branch_inventory_batches WHERE product_name<>$1 ORDER BY id",[product])).rows,
    warehouses:(await query("SELECT id,quantity,remaining_quantity,dispatched_quantity,status FROM stock_batches WHERE description<>$1 OR description IS NULL ORDER BY id",[product])).rows,
  };
}
async function clean() {
  await query('DELETE FROM dispatch_notes WHERE transfer_id LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM stock_transfer_items WHERE transfer_id LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM stock_transfers WHERE id LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM stock_control_financial_entries WHERE operation_id IN (SELECT id FROM stock_control_operations WHERE created_by LIKE $1)',[`${prefix}%`]);
  await query('DELETE FROM supplier_return_credits WHERE operation_id IN (SELECT id FROM stock_control_operations WHERE created_by LIKE $1)',[`${prefix}%`]);
  await query('DELETE FROM stock_segregated_batches WHERE snapshot->>\'product_name\'=$1',[product]);
  await query('DELETE FROM stock_control_operations WHERE created_by LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM branch_refund_requests WHERE id LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM branch_activity_transactions WHERE branch_id=$1',[branch]);
  await query('DELETE FROM branch_inventory_movements WHERE product_name=$1',[product]);
  await query('DELETE FROM branch_inventory_batches WHERE product_name=$1',[product]);
  await query('DELETE FROM stock_movements WHERE product_name=$1',[product]);
  await query('DELETE FROM inventory_balances WHERE product_name=$1',[product]);
  await query('DELETE FROM stock_batches WHERE description=$1',[product]);
  await query('DELETE FROM supplier_imports WHERE id LIKE $1',[`${prefix}%`]);
}
async function seed() {
  await query(`INSERT INTO supplier_imports (id,supplier_name,product_name,batch_no,quantity,cif_unit_cost,invoice_number)
    VALUES ($1,'Isolated Supplier',$2,'CTRL-LOT',100,4.25,'TEST-INVOICE')`,[supplier,product]);
  await query(`INSERT INTO stock_batches (id,description,batch_no,expiry_date,quantity,remaining_quantity,
    cif_unit_cost,supplier_import_id,supplier_name,warehouse_id,location,status)
    VALUES ($1,$2,'CTRL-LOT',$3,100,100,4.25,$4,'Isolated Supplier',$5,$5,'available')`,[source,product,expiry,supplier,warehouse]);
  for (const id of [b1,b2]) {
    if (id===b2) await query(`INSERT INTO stock_batches (id,description,batch_no,expiry_date,quantity,remaining_quantity,
      cif_unit_cost,supplier_import_id,supplier_name,warehouse_id,location,status)
      VALUES ($1,$2,'CTRL-LOT-2',$3,100,100,4.25,$4,'Isolated Supplier',$5,$5,'available')`,
      [`${source}-2`,product,expiry,supplier,warehouse]);
    await query(`INSERT INTO branch_inventory_batches (id,branch_id,product_name,batch_no,expiry_date,
      quantity,source_batch_id,status) VALUES ($1,$2,$3,$6,$4,100,$5,'in_stock')`,[id,branch,product,expiry,id===b1?source:`${source}-2`,id===b1?'CTRL-LOT':'CTRL-LOT-2']);
  }
}
async function receiveDifferentSupplier() {
  const importId=`${prefix}-IB`,batchId=`${prefix}-X`,transferId=`${prefix}-RB`,location=`${warehouse}-b`;
  await query(`INSERT INTO supplier_imports (id,supplier_name,product_name,batch_no,quantity,cif_unit_cost,invoice_number)
    VALUES ($1,'Different Supplier',$2,'CTRL-LOT',100,9,'DIFFERENT-INVOICE')`,[importId,product]);
  await query(`INSERT INTO stock_batches (id,description,batch_no,expiry_date,quantity,remaining_quantity,dispatched_quantity,
    cif_unit_cost,supplier_import_id,supplier_name,warehouse_id,location,status)
    VALUES ($1,$2,'CTRL-LOT',$3,100,90,10,9,$4,'Different Supplier',$5,$5,'available')`,[batchId,product,expiry,importId,location]);
  await query(`INSERT INTO stock_transfers (id,from_warehouse,to_branch,status,gm_approved_by)
    VALUES ($1,$2,$3,'in_transit',$4)`,[transferId,location,branch,gm.id]);
  await query(`INSERT INTO stock_transfer_items (transfer_id,product_id,product_name,batch_no,expiry_date,quantity,quantity_approved)
    VALUES ($1,$2,$2,'CTRL-LOT',$3,10,10)`,[transferId,product,expiry]);
  await withTransaction(client=>receiveTransferTx(client,{transferId,user:scopedStaff}));
  expect(await qty()).toBe(10);
  expect((await query('SELECT source_batch_id FROM branch_inventory_batches WHERE id=$1',[b1])).rows[0].source_batch_id).toBe(batchId);
  return {importId,batchId};
}
describe.sequential('controlled counts, inspection and supplier returns: isolated physical evidence',()=>{
  beforeAll(async()=>{await ensureControlledStockSchema(); original=await baseline();});
  beforeEach(async()=>{await clean();await seed();});
  afterAll(async()=>{await clean();expect(await baseline()).toEqual(original);});

  it('saves a cutoff, allows scoped staff submission, and posts only selected GM-reviewed lines',async()=>{
    const draft=await count([b1,b2]);
    expect(await qty()).toBe(100);
    const submitted=await submit(draft,[90,105]);
    const forbidden=await invoke('PATCH',{id:draft.id,action:'review',decisions:[decision(submitted.lines[0])]},scopedStaff);
    expect(forbidden.status).toBe(403);
    const partial=await update({id:draft.id,action:'review',decisions:[decision(submitted.lines[0])]});
    expect(partial.status).toBe('partially_reviewed');
    expect(await qty()).toBe(90); expect(await qty(b2)).toBe(100);
    const done=await update({id:draft.id,action:'review',decisions:[{line_id:submitted.lines[1].id,decision:'reject'}]});
    expect(done.status).toBe('approved');expect(await qty(b2)).toBe(100);
    expect((await query('SELECT * FROM stock_control_financial_entries WHERE operation_id=$1',[draft.id])).rows).toHaveLength(1);
    expect((await invoke('PATCH',{id:draft.id,action:'review',decisions:[decision(submitted.lines[0])]},gm)).status).toBe(409);
  });

  it('preserves concurrent sale deductions when approving a cutoff difference',async()=>{
    await query('UPDATE branch_inventory_batches SET quantity=0 WHERE id=$1',[b2]);
    const op=await submit(await count(),[90]);
    const [approval,sale]=await Promise.all([
      invoke('PATCH',{id:op.id,action:'review',decisions:[decision(op.lines[0])]},gm),
      withTransaction(client=>deductStock(client,branch,product,20,'sale','Isolated sale',`${prefix}-SALE`,8,staff.id)),
    ]);
    expect(approval.status,JSON.stringify(approval.body)).toBe(200);
    expect(sale.short).toBe(0); expect(await qty()).toBe(70);
    expect(approval.body.operation.lines[0].applied_delta).toBe(-10);
  });

  it('retains depleted batch identities so a zero-cutoff count can correct shortages after sales',async()=>{
    await query('UPDATE branch_inventory_batches SET quantity=0 WHERE id=$1',[b2]);
    const op=await submit(await count(),[105]);
    await withTransaction(client=>deductStock(client,branch,product,100,'sale','Full depletion',`${prefix}-SALE`,8,staff.id));
    expect(await qty()).toBe(0);
    await update({id:op.id,action:'review',decisions:[decision(op.lines[0])]});
    expect(await qty()).toBe(5);
  });

  it('rejects a difference that would make locked current stock negative and rolls back all selected lines',async()=>{
    const op=await submit(await count([b1,b2]),[50,110]);
    await query('UPDATE branch_inventory_batches SET quantity=10 WHERE id=$1',[b1]);
    const result=await invoke('PATCH',{id:op.id,action:'review',decisions:op.lines.map(l=>decision(l))},gm);
    expect(result.status).toBe(409);
    expect(await qty()).toBe(10); expect(await qty(b2)).toBe(100);
    expect((await query('SELECT * FROM stock_movements WHERE reference_id=$1',[op.id])).rows).toHaveLength(0);
    expect(()=>countDifference(2,10,3)).toThrow(/recount/);
  });

  it('supports warehouse cutoffs and preserves post-cutoff dispatch changes',async()=>{
    const op=await create('count',[{batch_type:'warehouse',batch_id:source}]);
    const submitted=await update({id:op.id,action:'submit',lines:[{id:op.lines[0].id,counted_quantity:95,reason:'Warehouse count'}]},staff);
    await query('UPDATE stock_batches SET remaining_quantity=80,dispatched_quantity=20 WHERE id=$1',[source]);
    await update({id:op.id,action:'review',decisions:[decision(submitted.lines[0])]});
    expect(await qty(source,'stock_batches')).toBe(75);
    expect(Number((await query('SELECT quantity FROM stock_batches WHERE id=$1',[source])).rows[0].quantity)).toBe(95);
  });

  it('reserves partial supplier approval, dispatches cumulatively and records the actual supplier credit and variance',async()=>{
    const op=await create('supplier_return',[requestLine(b1),requestLine(b2)]);
    expect(await qty()).toBe(100);
    const partial=await update({id:op.id,action:'review',decisions:[decision(op.lines[0],3)]});
    expect(partial.status).toBe('partially_reviewed');
    expect(await qty()).toBe(97);
    expect(partial.lines[0].rejected_quantity).toBe(2);
    await update({id:op.id,action:'dispatch',reference:'RTN-1',lines:[{line_id:op.lines[0].id,quantity:2}]},staff);
    await update({id:op.id,action:'review',decisions:[{line_id:op.lines[1].id,decision:'reject'}]});
    expect((await invoke('PATCH',{id:op.id,action:'credit',credit_reference:'CN',credited_amount:12.75},finance)).status).toBe(409);
    await update({id:op.id,action:'dispatch',reference:'RTN-2',lines:[{line_id:op.lines[0].id,quantity:1}]},staff);
    expect(await qty()).toBe(97); // dispatch does not deduct available stock twice
    expect((await invoke('PATCH',{id:op.id,action:'dispatch',reference:'duplicate',lines:[{line_id:op.lines[0].id,quantity:1}]},staff)).status).toBe(409);
    const credited=await update({id:op.id,action:'credit',credit_reference:'SUP-CN-1',credited_amount:12.5},finance);
    expect(credited.status).toBe('credited');
    const credit=(await query('SELECT * FROM supplier_return_credits WHERE operation_id=$1',[op.id])).rows[0];
    expect(Number(credit.expected_amount)).toBe(12.75);expect(Number(credit.credited_amount)).toBe(12.5);
    const entries=(await query('SELECT * FROM stock_control_financial_entries WHERE operation_id=$1',[op.id])).rows;
    expect(entries.map(e=>e.event)).toContain('supplier_credit_variance');
    expect((await invoke('PATCH',{id:op.id,action:'credit',credit_reference:'DUP',credited_amount:12.5},gm)).status).toBe(409);
  });

  it('prevents concurrent supplier approvals from consuming the same physical quantity',async()=>{
    const a=await create('supplier_return',[requestLine(source,'warehouse','saleable',80)]);
    const b=await create('supplier_return',[requestLine(source,'warehouse','saleable',80)]);
    const results=await Promise.all([a,b].map(op=>invoke('PATCH',{id:op.id,action:'review',decisions:[decision(op.lines[0])]},gm)));
    expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    expect(await qty(source,'stock_batches')).toBe(20);
    const original=(await query('SELECT quantity,dispatched_quantity,cif_unit_cost FROM stock_batches WHERE id=$1',[source])).rows[0];
    expect(Number(original.quantity)).toBe(100);
    expect(Number(original.dispatched_quantity)).toBe(80);
    expect(Number(original.cif_unit_cost)).toBe(4.25);
  });

  it('keeps expired and damaged goods segregated, rejects release, and permits linked supplier return',async()=>{
    await query("UPDATE branch_inventory_batches SET expiry_date='2020-01-01' WHERE id=$1",[b1]);
    await query("UPDATE stock_batches SET expiry_date='2020-01-01' WHERE id=$1",[source]);
    expect((await invoke('POST',{kind:'inspection',reason:'Expired lot',lines:[requestLine(b1,'branch','saleable')]},staff)).status).toBe(400);
    const op=await create('inspection',[requestLine(b1,'branch','expired')]);
    const approved=await update({id:op.id,action:'review',decisions:[decision(op.lines[0])]});
    expect(await qty()).toBe(95);
    const hold=approved.lines[0].hold_id;
    expect((await invoke('POST',{kind:'inspection',reason:'Unsafe release',lines:[requestLine(hold,'segregated','saleable',5,'release')]},staff)).status).toBe(400);
    const returned=await create('supplier_return',[requestLine(hold,'segregated','expired',3)]);
    const done=await update({id:returned.id,action:'review',decisions:[decision(returned.lines[0])]});
    await update({id:done.id,action:'dispatch',reference:'EXPIRED-RTN',lines:[{line_id:done.lines[0].id,quantity:3}]},staff);
    expect(await qty()).toBe(95);
    expect(await qty(hold,'stock_segregated_batches')).toBe(2);
  });

  it('allows saleable quarantine inspection release and posts cost-linked expiry write-off',async()=>{
    const op=await create('inspection',[requestLine(b1,'branch','quarantine',6)]);
    const approved=await update({id:op.id,action:'review',decisions:[decision(op.lines[0])]});
    const release=await create('inspection',[requestLine(approved.lines[0].hold_id,'segregated','saleable',2,'release')]);
    await update({id:release.id,action:'review',decisions:[decision(release.lines[0])]});
    expect(await qty()).toBe(96);
    const writeoff=await create('inspection',[requestLine(approved.lines[0].hold_id,'segregated','damaged',4,'write_off')]);
    await update({id:writeoff.id,action:'review',decisions:[decision(writeoff.lines[0])]});
    expect(await qty()).toBe(96);expect(await qty(approved.lines[0].hold_id,'stock_segregated_batches')).toBe(0);
    const entry=(await query("SELECT * FROM stock_control_financial_entries WHERE operation_id=$1 AND event='write_off'",[writeoff.id])).rows[0];
    expect(Number(entry.amount)).toBe(17);
    expect(Number((await query('SELECT quantity_adjusted FROM branch_inventory_batches WHERE id=$1',[b1])).rows[0].quantity_adjusted)).toBe(0);
  });

  it('revalidates expiry at approval and requires real supplier cost evidence',async()=>{
    const op=await create('supplier_return',[requestLine(b1)]);
    await query("UPDATE branch_inventory_batches SET expiry_date='2020-01-01' WHERE id=$1",[b1]);
    expect((await invoke('PATCH',{id:op.id,action:'review',decisions:[decision(op.lines[0])]},gm)).status).toBe(409);
    await query('UPDATE stock_batches SET cif_unit_cost=NULL WHERE id=$1',[`${source}-2`]);
    expect((await invoke('POST',{kind:'supplier_return',reason:'Unknown cost',lines:[requestLine(b2)]},staff)).status).toBe(400);
  });

  it('enforces login, branch scope, exact quantities, unique decisions and creator ownership',async()=>{
    expect((await invoke('GET',{},null)).status).toBe(401);
    const outside={id:`${prefix}-OUT`,role:'branch_manager',branch:'outside'};
    expect((await invoke('POST',{kind:'count',reason:'Outside',lines:[{batch_type:'branch',batch_id:b1}]},outside)).status).toBe(403);
    const draft=await count();
    expect((await invoke('PATCH',{id:draft.id,action:'submit',lines:[{id:draft.lines[0].id,counted_quantity:'',reason:'Blank'}]},scopedStaff)).status).toBe(400);
    expect((await invoke('PATCH',{id:draft.id,action:'submit',lines:[{id:draft.lines[0].id,counted_quantity:9.5,reason:'Fraction'}]},scopedStaff)).status).toBe(400);
    const other={...scopedStaff,id:`${prefix}-OTHER`};
    expect((await invoke('PATCH',{id:draft.id,action:'cancel'},other)).status).toBe(403);
    const op=await submit(draft,[90]);
    expect((await invoke('PATCH',{id:op.id,action:'review',decisions:[decision(op.lines[0]),decision(op.lines[0])]},gm)).status).toBe(400);
    const view=(await invoke('GET',{},outside)).body;
    expect(view.operations).toHaveLength(0);expect(view.batches).toHaveLength(0);
    const allowed=(await invoke('GET',{},scopedStaff)).body;
    expect(allowed.batches.every(b=>b.location===branch)).toBe(true);
  });

  it('blocks overlapping cutoff sessions and allows a new one after cancellation',async()=>{
    const draft=await count();
    expect((await invoke('POST',{kind:'count',reason:'Duplicate cutoff',lines:[{batch_type:'branch',batch_id:b1}]},scopedStaff)).status).toBe(409);
    await update({id:draft.id,action:'cancel'},scopedStaff);
    expect((await count()).status).toBe('draft');
  });

  it('stores newly accepted customer quarantine returns with original source and cost links',async()=>{
    const refundId=`${prefix}-REFUND`;
    const saleId=`${prefix}-SALE`;
    await query('UPDATE branch_inventory_batches SET quantity=0 WHERE id=$1',[b2]);
    await withTransaction(client=>deductStock(client,branch,product,3,'campaign_sale','Original sale fixture',saleId,8,staff.id));
    await query(`INSERT INTO branch_refund_requests (id,branch_id,product_name,batch_no,quantity,unit_price,refund_amount,status,reason,sale_reference)
      VALUES ($1,$2,$3,'CTRL-LOT',3,8,24,'pending','Quarantine fixture',$4)`,[refundId,branch,product,saleId]);
    const result=await invoke('PATCH',{id:refundId,action:'approve',return_condition:'quarantine'},staff,refunds);
    expect(result.status,JSON.stringify(result.body)).toBe(200);
    expect(await qty()).toBe(97);
    const segregated=(await query('SELECT * FROM stock_segregated_batches WHERE operation_id=$1',[refundId])).rows;
    expect(segregated).toHaveLength(1);
    expect(segregated[0].source_id).toBe(b1);
    expect(segregated[0].snapshot.unit_cost).toBe(4.25);
    const release=await create('inspection',[requestLine(segregated[0].id,'segregated','saleable',3,'release')]);
    await update({id:release.id,action:'review',decisions:[decision(release.lines[0])]});
    expect(await qty()).toBe(100);
  });

  it('receives real partial transfer batches with original links, then completes their supplier return and credit',async()=>{
    await query('DELETE FROM branch_inventory_batches WHERE id=$1',[b1]);
    const transferId=`${prefix}-RECEIPT`;
    await query(`INSERT INTO stock_transfers (id,from_warehouse,to_branch,status,gm_approved_by)
      VALUES ($1,$2,$3,'in_transit',$4)`,[transferId,warehouse,branch,gm.id]);
    await query(`INSERT INTO stock_transfer_items (transfer_id,product_id,product_name,batch_no,expiry_date,quantity,quantity_approved)
      VALUES ($1,$2,$2,'CTRL-LOT',$3,8,8)`,[transferId,product,expiry]);
    await query('UPDATE stock_batches SET remaining_quantity=92,dispatched_quantity=8 WHERE id=$1',[source]);
    await query(`INSERT INTO stock_movements (id,product_name,batch_no,expiry_date,quantity,movement_type,
      source_location,source_location_type,destination_location,destination_location_type,reference_id,status)
      VALUES ($1,$2,'CTRL-LOT',$3,8,'transit_dispatch',$4,'warehouse',$5,'in_transit',$6,'posted')`,
      [`${prefix}-DISPATCH`,product,expiry,warehouse,`in_transit:${transferId}`,transferId]);
    const receive = quantity => withTransaction(client=>receiveTransferTx(client,{
      transferId,user:scopedStaff,items:[{productName:product,batchNo:'CTRL-LOT',expiryDate:expiry,quantity}],
    }));
    await receive(3);
    let row=(await query("SELECT * FROM branch_inventory_batches WHERE product_name=$1 AND batch_no='CTRL-LOT'",[product])).rows[0];
    expect(row.source_batch_id).toBe(source);expect(row.metadata.original_source.supplier_import_id).toBe(supplier);
    expect(row.metadata.original_source.cif_unit_cost).toBe(4.25);expect(Number(row.quantity)).toBe(3);
    // Second partial receipt updates the existing physical row without dropping provenance.
    await receive(8);
    row=(await query('SELECT * FROM branch_inventory_batches WHERE id=$1',[row.id])).rows[0];
    expect(row.source_batch_id).toBe(source);expect(Number(row.quantity)).toBe(8);
    const op=await create('supplier_return',[requestLine(row.id,'branch','saleable',2)],scopedStaff);
    expect(op.lines[0].snapshot.unit_cost).toBe(4.25);
    await update({id:op.id,action:'review',decisions:[decision(op.lines[0])]});
    expect(await qty(row.id)).toBe(6);
    await update({id:op.id,action:'dispatch',lines:[{line_id:op.lines[0].id,quantity:2}],reference:'Receipt return shipment'},scopedStaff);
    expect(await qty(row.id)).toBe(6);
    const credit=(await query('SELECT * FROM supplier_return_credits WHERE operation_id=$1',[op.id])).rows[0];
    expect(credit.supplier_import_id).toBe(supplier);expect(Number(credit.expected_amount)).toBe(8.5);
    const completed=await update({id:op.id,action:'credit',supplier_import_id:supplier,credited_amount:8.5,credit_reference:'Original receipt credit'},finance);
    expect(completed.status).toBe('credited');
  });

  it('does not guess original supplier layers for an ambiguous transfer receipt',async()=>{
    await query('DELETE FROM branch_inventory_batches WHERE id=$1',[b1]);
    await query(`INSERT INTO stock_batches (id,description,batch_no,expiry_date,quantity,remaining_quantity,
      cif_unit_cost,supplier_import_id,warehouse_id,location,status)
      VALUES ($1,$2,'CTRL-LOT',$3,10,10,9,$4,$5,$5,'available')`,
      [`${source}-A`,product,expiry,supplier,warehouse]);
    const transferId=`${prefix}-AR`;
    await query(`INSERT INTO stock_transfers (id,from_warehouse,to_branch,status,gm_approved_by)
      VALUES ($1,$2,$3,'in_transit',$4)`,[transferId,warehouse,branch,gm.id]);
    // Client-supplied metadata cannot prove which layer was actually allocated.
    await query(`INSERT INTO stock_transfer_items (transfer_id,product_id,product_name,batch_no,expiry_date,quantity,quantity_approved,metadata)
      VALUES ($1,$2,$2,'CTRL-LOT',$3,2,2,$4)`,[transferId,product,expiry,JSON.stringify({source_batch_id:source})]);
    await withTransaction(client=>receiveTransferTx(client,{transferId,user:scopedStaff}));
    const row=(await query("SELECT * FROM branch_inventory_batches WHERE product_name=$1 AND batch_no='CTRL-LOT'",[product])).rows[0];
    expect(row.source_batch_id).toBeNull();expect(row.metadata.original_source).toBeNull();
    const result=await invoke('POST',{kind:'supplier_return',reason:'Ambiguous original layer',
      lines:[requestLine(row.id,'branch','saleable',1)]},scopedStaff);
    expect(result.status).toBe(400);expect(result.body.error).toContain('Original supplier import');
  });

  it('GM releases a newly quarantined refund after its original depleted physical row has disappeared',async()=>{
    await query('DELETE FROM branch_inventory_batches WHERE id=$1',[b1]);
    const saleId=`${prefix}-DS`, refundId=`${prefix}-DR`;
    await query(`INSERT INTO stock_movements (id,product_name,batch_no,expiry_date,quantity,movement_type,
      source_location,source_location_type,reference_id,unit_cif,unit_dp,status)
      VALUES ($1,$2,'CTRL-LOT',$3,3,'campaign_sale',$4,'branch',$1,4.25,8,'posted')`,
      [saleId,product,expiry,branch]);
    await query(`INSERT INTO branch_refund_requests
      (id,branch_id,product_name,batch_no,quantity,unit_price,refund_amount,status,reason,sale_reference)
      VALUES ($1,$2,$3,'CTRL-LOT',3,8,24,'pending','Depleted return fixture',$4)`,[refundId,branch,product,saleId]);
    const refund=await invoke('PATCH',{id:refundId,action:'approve',return_condition:'quarantine'},staff,refunds);
    expect(refund.status,JSON.stringify(refund.body)).toBe(200);
    const held=(await query('SELECT * FROM stock_segregated_batches WHERE operation_id=$1',[refundId])).rows[0];
    expect(held.snapshot.release_without_source).toBe(true);expect(held.snapshot.unit_cost).toBe(4.25);
    expect((await query("SELECT id FROM branch_inventory_batches WHERE product_name=$1 AND batch_no='CTRL-LOT'",[product])).rows).toHaveLength(0);
    const op=await create('inspection',[requestLine(held.id,'segregated','saleable',3,'release')],scopedStaff);
    expect((await invoke('PATCH',{id:op.id,action:'review',decisions:[decision(op.lines[0])]},scopedStaff)).status).toBe(403);
    await update({id:op.id,action:'review',decisions:[decision(op.lines[0])]});
    const target=(await query("SELECT * FROM branch_inventory_batches WHERE product_name=$1 AND batch_no='CTRL-LOT'",[product])).rows[0];
    expect(Number(target.quantity)).toBe(3);expect(target.source_batch_id).toBeNull();
    expect(target.metadata.unit_cif).toBe(4.25);expect(target.metadata.customer_return_reference).toBe(refundId);
    const remaining=(await query('SELECT quantity,source_id FROM stock_segregated_batches WHERE id=$1',[held.id])).rows[0];
    expect(Number(remaining.quantity)).toBe(0);expect(remaining.source_id).toBe(target.id);
    const repeated=await invoke('PATCH',{id:op.id,action:'review',decisions:[decision(op.lines[0])]},gm);
    expect(repeated.status).toBe(409);expect(await qty(target.id)).toBe(3);
    const unknownSupplier=await invoke('POST',{kind:'supplier_return',reason:'Missing original supplier is not guessed',
      lines:[requestLine(target.id,'branch','saleable',1)]},scopedStaff);
    expect(unknownSupplier.status).toBe(400);
  });

  it('keeps pre-existing unlinked quantities unknown after a verified receipt instead of crediting the entire row',async()=>{
    await query("UPDATE branch_inventory_batches SET quantity=4,source_batch_id=NULL,metadata='{}' WHERE id=$1",[b1]);
    const transferId=`${prefix}-UR`;
    await query(`INSERT INTO stock_transfers (id,from_warehouse,to_branch,status,gm_approved_by)
      VALUES ($1,$2,$3,'in_transit',$4)`,[transferId,warehouse,branch,gm.id]);
    await query(`INSERT INTO stock_transfer_items (transfer_id,product_id,product_name,batch_no,expiry_date,quantity,quantity_approved)
      VALUES ($1,$2,$2,'CTRL-LOT',$3,3,3)`,[transferId,product,expiry]);
    await withTransaction(client=>receiveTransferTx(client,{transferId,user:scopedStaff}));
    const row=(await query('SELECT * FROM branch_inventory_batches WHERE id=$1',[b1])).rows[0];
    expect(Number(row.quantity)).toBe(7);expect(row.source_batch_id).toBeNull();
    expect(row.metadata.provenance_conflict).toBe(true);expect(row.metadata.original_source).toBeNull();
    expect(row.metadata.supplier_import_id).toBeNull();expect(row.metadata.cif_unit_cost).toBeNull();
    const result=await invoke('POST',{kind:'supplier_return',reason:'Cannot assign historical unlinked stock to the incoming import',
      lines:[requestLine(b1,'branch','saleable',7)]});
    expect(result.status).toBe(400);
    expect((await query('SELECT * FROM supplier_return_credits WHERE supplier_import_id=$1',[supplier])).rows).toHaveLength(0);
  });

  it('credits a quarantined refund to its recorded sold supplier, not the identical lot now remaining from another import',async()=>{
    const saleId=`${prefix}-SA`,refundId=`${prefix}-RA`;
    await query('UPDATE branch_inventory_batches SET quantity=0 WHERE id=$1',[b2]);
    await withTransaction(client=>deductStock(client,branch,product,100,'campaign_sale','Original supplier A sale',saleId,8,staff.id));
    const other=await receiveDifferentSupplier();
    await query(`INSERT INTO branch_refund_requests (id,branch_id,product_name,batch_no,quantity,unit_price,refund_amount,status,reason,sale_reference)
      VALUES ($1,$2,$3,'CTRL-LOT',3,8,24,'pending','Original supplier A goods',$4)`,[refundId,branch,product,saleId]);
    expect((await invoke('PATCH',{id:refundId,action:'approve',return_condition:'quarantine'},staff,refunds)).status).toBe(200);
    expect(await qty()).toBe(10);
    const held=(await query('SELECT * FROM stock_segregated_batches WHERE operation_id=$1',[refundId])).rows[0];
    expect(held.snapshot.supplier_import_id).toBe(supplier);
    expect(held.snapshot.unit_cost).toBe(4.25);expect(held.snapshot.source_batch_id).toBe(source);
    const op=await create('supplier_return',[requestLine(held.id,'segregated','quarantine',2)]);
    await update({id:op.id,action:'review',decisions:[decision(op.lines[0])]});
    await update({id:op.id,action:'dispatch',lines:[{line_id:op.lines[0].id,quantity:2}],reference:'Original supplier A return'},staff);
    const credit=(await query('SELECT * FROM supplier_return_credits WHERE operation_id=$1',[op.id])).rows[0];
    expect(credit.supplier_import_id).toBe(supplier);expect(Number(credit.expected_amount)).toBe(8.5);
    await update({id:op.id,action:'credit',supplier_import_id:supplier,credited_amount:8.5,credit_reference:'A credit'},finance);
    expect((await query('SELECT * FROM supplier_return_credits WHERE supplier_import_id=$1',[other.importId])).rows).toHaveLength(0);
    expect(await qty()).toBe(10);
    const release=await create('inspection',[requestLine(held.id,'segregated','saleable',1,'release')]);
    await update({id:release.id,action:'review',decisions:[decision(release.lines[0])]});
    const mixed=(await query('SELECT * FROM branch_inventory_batches WHERE id=$1',[b1])).rows[0];
    expect(Number(mixed.quantity)).toBe(11);expect(mixed.metadata.provenance_conflict).toBe(true);
    expect(mixed.source_batch_id).toBeNull();
    expect((await invoke('POST',{kind:'supplier_return',reason:'Mixed available layers need resolution',
      lines:[requestLine(b1,'branch','saleable',11)]})).status).toBe(400);
  });

  it('marks direct saleable refunds as mixed when their sold supplier differs from the current identical lot',async()=>{
    const saleId=`${prefix}-SB`,refundId=`${prefix}-RS`;
    await query('UPDATE branch_inventory_batches SET quantity=0 WHERE id=$1',[b2]);
    await withTransaction(client=>deductStock(client,branch,product,100,'campaign_sale','Original sold layer',saleId,8,staff.id));
    await receiveDifferentSupplier();
    await query(`INSERT INTO branch_refund_requests (id,branch_id,product_name,batch_no,quantity,unit_price,refund_amount,status,reason,sale_reference)
      VALUES ($1,$2,$3,'CTRL-LOT',3,8,24,'pending','Saleable original goods',$4)`,[refundId,branch,product,saleId]);
    const refund=await invoke('PATCH',{id:refundId,action:'approve',return_condition:'saleable'},staff,refunds);
    expect(refund.status,JSON.stringify(refund.body)).toBe(200);
    const row=(await query('SELECT * FROM branch_inventory_batches WHERE id=$1',[b1])).rows[0];
    expect(Number(row.quantity)).toBe(13);expect(row.source_batch_id).toBeNull();
    expect(row.metadata.provenance_conflict).toBe(true);expect(row.metadata.cif_unit_cost).toBeNull();
    expect((await invoke('POST',{kind:'supplier_return',reason:'No false supplier credit',
      lines:[requestLine(b1,'branch','saleable',13)]})).status).toBe(400);
  });

  it('uses the original sold expiry instead of a newer matching lot when classifying a refund',async()=>{
    const saleId=`${prefix}-SE`,refundId=`${prefix}-RE`;
    await query(`INSERT INTO stock_movements (id,product_name,batch_no,expiry_date,quantity,movement_type,
      source_location,source_location_type,reference_id,unit_cif,unit_dp,status)
      VALUES ($1,$2,'CTRL-LOT','2020-01-01',2,'campaign_sale',$3,'branch',$1,4.25,8,'posted')`,[saleId,product,branch]);
    await query(`INSERT INTO branch_refund_requests (id,branch_id,product_name,batch_no,quantity,unit_price,refund_amount,status,reason,sale_reference)
      VALUES ($1,$2,$3,'CTRL-LOT',2,8,16,'pending','Expired original sale goods',$4)`,[refundId,branch,product,saleId]);
    const rejected=await invoke('PATCH',{id:refundId,action:'approve',return_condition:'saleable'},staff,refunds);
    expect(rejected.status).toBe(400);expect(await qty()).toBe(100);
    const approved=await invoke('PATCH',{id:refundId,action:'approve',return_condition:'expired'},staff,refunds);
    expect(approved.status,JSON.stringify(approved.body)).toBe(200);
    const held=(await query('SELECT * FROM stock_segregated_batches WHERE operation_id=$1',[refundId])).rows[0];
    expect(held.snapshot.expiry_date).toBe('2020-01-01');
    expect(held.snapshot.supplier_import_id).toBeNull();
    expect(held.snapshot.unit_cost).toBe(4.25);
    expect(await qty()).toBe(100);
  });

  it('keeps a lot saleable through its expiry day and prevents release of originally damaged goods',async()=>{
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Windhoek',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    await query('UPDATE branch_inventory_batches SET expiry_date=$1 WHERE id=$2',[today,b1]);
    await query('UPDATE stock_batches SET expiry_date=$1 WHERE id=$2',[today,source]);
    const inspected=await create('inspection',[requestLine(b1,'branch','quarantine',4)]);
    const approved=await update({id:inspected.id,action:'review',decisions:[decision(inspected.lines[0])]});
    const release=await create('inspection',[requestLine(approved.lines[0].hold_id,'segregated','saleable',2,'release')]);
    await update({id:release.id,action:'review',decisions:[decision(release.lines[0])]});
    expect(await qty()).toBe(98);
    const damaged=await create('inspection',[requestLine(b2,'branch','damaged',4)]);
    const d=await update({id:damaged.id,action:'review',decisions:[decision(damaged.lines[0])]});
    expect((await invoke('POST',{kind:'inspection',reason:'Invalid reclassification',lines:[requestLine(d.lines[0].hold_id,'segregated','saleable',2,'release')]},staff)).status).toBe(400);
  });

  it('records multi-import supplier credits individually without closing early',async()=>{
    const secondImport=`${supplier}-2`;
    await query(`INSERT INTO supplier_imports (id,supplier_name,product_name,batch_no,quantity,cif_unit_cost)
      VALUES ($1,'Second Supplier',$2,'CTRL-LOT-2',100,4.25)`,[secondImport,product]);
    await query("UPDATE stock_batches SET supplier_import_id=$1,supplier_name='Second Supplier' WHERE id=$2",[secondImport,`${source}-2`]);
    const op=await create('supplier_return',[requestLine(b1),requestLine(b2)]);
    await update({id:op.id,action:'review',decisions:op.lines.map(l=>decision(l))});
    await update({id:op.id,action:'dispatch',reference:'MULTI-RTN',lines:op.lines.map(l=>({line_id:l.id,quantity:5}))},staff);
    expect((await invoke('PATCH',{id:op.id,action:'credit',credit_reference:'AMBIGUOUS',credited_amount:21.25},finance)).status).toBe(400);
    const first=await update({id:op.id,action:'credit',supplier_import_id:supplier,credit_reference:'FIRST-CN',credited_amount:21.25},finance);
    expect(first.status).toBe('dispatched');
    const last=await update({id:op.id,action:'credit',supplier_import_id:secondImport,credit_reference:'SECOND-CN',credited_amount:21.25},finance);
    expect(last.status).toBe('credited');
  });
});
