// Isolated, removable fixtures for the signed-in return workflow smoke test.
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from '../api/db.js';
import { sourceSnapshot } from '../api/services/stockCostLayers.js';

const mode=process.argv[2] || 'seed';
const prefix=process.argv[3] || `TEST-UIREV-${randomUUID().slice(0,8)}`;
const product=prefix,branch='windhoek',warehouse='windhoek_warehouse';
const userId=`${prefix}-user`,sale=`${prefix}-sale`,saleBatch=`${prefix}-sale-batch`;
const dispatch=`${prefix}-dispatch`,sourceBatch=`${prefix}-source`,allocation=`${prefix}-alloc`;
if (!prefix.startsWith('TEST-UIREV-')) throw new Error('Fixture prefix required');
if (mode==='clean') {
  await query('DELETE FROM branch_distributor_profit WHERE sale_receipt LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM branch_activity_transactions WHERE form_reference_id LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM branch_refund_requests WHERE product_name=$1',[product]);
  await query("DELETE FROM stock_segregated_batches WHERE snapshot->>'product_name'=$1",[product]);
  await query('DELETE FROM stock_linked_reversals WHERE original_reference LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM branch_inventory_movements WHERE product_name=$1',[product]);
  await query('DELETE FROM branch_inventory_batches WHERE product_name=$1',[product]);
  await query('DELETE FROM stock_movements WHERE product_name=$1',[product]);
  await query('DELETE FROM inventory_balances WHERE product_name=$1',[product]);
  await query('DELETE FROM dispatch_notes WHERE transfer_id=$1',[dispatch]);
  await query('DELETE FROM stock_transfer_allocations WHERE transfer_id=$1',[dispatch]);
  await query('DELETE FROM stock_transfer_items WHERE transfer_id=$1',[dispatch]);
  await query('DELETE FROM stock_transfers WHERE id=$1',[dispatch]);
  await query('DELETE FROM branch_walkin_sales WHERE id=$1',[sale]);
  await query('DELETE FROM stock_batches WHERE description=$1',[product]);
  await query("DELETE FROM hr_records WHERE employee_id=$1 AND type='attendance'",[userId]);
  await query('DELETE FROM users WHERE id=$1',[userId]);
  console.log(JSON.stringify({cleaned:prefix}));
} else {
  const password=randomUUID();
  await query(`INSERT INTO users(id,username,password_hash,role,full_name,branch,branches,is_active)
    VALUES($1,$2,$3,'admin','Isolated Return Tester',$4,$5,true)`,[userId,prefix,await bcrypt.hash(password,10),branch,JSON.stringify([branch])]);
  const source={id:sourceBatch,description:product,batch_no:'UI-TRANSIT',expiry_date:'2031-06-30',
    cif_unit_cost:2.345678,dpc_unit_value:7.25,warehouse_id:warehouse,location:warehouse};
  const snapshot={id:saleBatch,batch_type:'branch',location:branch,product_name:product,batch_no:'UI-SALE',
    expiry_date:'2031-06-30',quantity:8,unit_cost:2.345678,unit_dp:7.25,revenue_unit:12.5,
    financial_dp_unit:7.25,bv_unit:3,original_source:null,source_batch_id:null,
    cost_layers:[{quantity:8,source:{...source,batch_no:'UI-SALE'}}]};
  await query(`INSERT INTO branch_walkin_sales(id,branch_id,customer_name,customer_type,total,total_bv,status,data)
    VALUES($1,$2,'Isolated customer','member',100,24,'completed',$3)`,[sale,branch,JSON.stringify({items:[{product_name:product,quantity:8,unit_price:12.5}]})]);
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,status,metadata)
    VALUES($1,$2,$3,'UI-SALE','2031-06-30',2,7.25,'in_stock',$4)`,
    [saleBatch,branch,product,JSON.stringify({cost_layers:[{quantity:2,source:{...source,batch_no:'UI-SALE'}}]})]);
  await query(`INSERT INTO stock_movements(id,product_name,batch_no,expiry_date,quantity,movement_type,
    source_location,source_location_type,destination_location,reference_id,status,unit_cif,unit_dp)
    VALUES($1,$2,'UI-SALE','2031-06-30',8,'walk_in_member_sale',$3,'branch','customer',$4,'posted',2.345678,7.25)`,[`${sale}-mov`,product,branch,sale]);
  await query(`INSERT INTO stock_sale_allocations(movement_id,sale_reference,branch_batch_id,branch_id,product_name,batch_no,expiry_date,quantity,snapshot)
    VALUES($1,$2,$3,$4,$5,'UI-SALE','2031-06-30',8,$6)`,[`${sale}-mov`,sale,saleBatch,branch,product,JSON.stringify(snapshot)]);
  await query(`INSERT INTO stock_batches(id,description,batch_no,expiry_date,quantity,remaining_quantity,dispatched_quantity,
    cif_unit_cost,dpc_unit_value,location,warehouse_id,status)
    VALUES($1,$2,'UI-TRANSIT','2031-06-30',20,10,10,2.345678,7.25,$3,$3,'available')`,[sourceBatch,product,warehouse]);
  await query(`INSERT INTO stock_transfers(id,from_warehouse,to_branch,status,created_by)
    VALUES($1,$2,$3,'partially_received',$4)`,[dispatch,warehouse,branch,userId]);
  const line=(await query(`INSERT INTO stock_transfer_items(transfer_id,product_id,product_name,batch_no,expiry_date,quantity,quantity_approved,quantity_received)
    VALUES($1,$2,$2,'UI-TRANSIT','2031-06-30',10,10,4) RETURNING id`,[dispatch,product])).rows[0].id;
  await query(`INSERT INTO stock_transfer_allocations(id,transfer_id,line_id,source_type,source_id,quantity,snapshot)
    VALUES($1,$2,$3,'stock',$4,10,$5)`,[allocation,dispatch,line,sourceBatch,JSON.stringify({
      source:sourceSnapshot((await query('SELECT * FROM stock_batches WHERE id=$1',[sourceBatch])).rows[0]),
      product_name:product,batch_no:'UI-TRANSIT',expiry_date:'2031-06-30'})]);
  for (const [kind,qty,from,to,fromType,toType] of [
    ['transit_dispatch',10,warehouse,`in_transit:${dispatch}`,'warehouse','in_transit'],
    ['transit_receipt',4,`in_transit:${dispatch}`,branch,'in_transit','branch'],
  ]) await query(`INSERT INTO stock_movements(id,product_name,batch_no,expiry_date,quantity,movement_type,
    source_location,destination_location,source_location_type,destination_location_type,reference_id,status,unit_cif,unit_dp)
    VALUES($1,$2,'UI-TRANSIT','2031-06-30',$3,$4,$5,$6,$7,$8,$9,'posted',2.345678,7.25)`,
    [`${dispatch}-${kind}`,product,qty,kind,from,to,fromType,toType,dispatch]);
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,status,source_batch_id,metadata)
    VALUES($1,$2,$3,'UI-TRANSIT','2031-06-30',4,7.25,'in_stock',$4,$5)`,
    [`${prefix}-received`,branch,product,sourceBatch,JSON.stringify({original_source:source,cost_layers:[{quantity:4,source}]})]);
  console.log(JSON.stringify({prefix,username:prefix,password,product,branch,sale,saleBatch,dispatch,line,allocation,sourceBatch}));
}
process.exit(0);
