// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { query,withTransaction } from '../api/db.js';
import receive from '../api/stock/import/receive.js';
import packs from '../api/stock/product-packs.js';
import warehouseReceive from '../api/stock/warehouses/receive-stock.js';
import transfers from '../api/stock/transfers.js';
import { lifecycleSchema,allocateExpenses,allocateTransferTx,restoreTransferAllocationTx } from '../api/services/stockCostLayers.js';
import { receiveTransferTx } from '../api/services/transferReceipt.js';
import { reversalSchema } from '../api/services/linkedReversals.js';
import { deductStock } from '../api/branch/campaign-sale.js';
import { getStockCostProjection,getSalesCostReport } from '../api/services/stockCostReporting.js';
import { ensureControlledStockSchema } from '../api/services/controlledStock.js';
import { saleAllocationSchema } from '../api/services/stockSaleAllocations.js';

const prefix=`TEST-COST-${randomUUID()}`,product=`${prefix}-Product`,branch=`${prefix.toLowerCase()}_branch`;
const stockUser={id:`${prefix}-staff`,role:'stock'},gm={id:`${prefix}-gm`,role:'gm'};
let baseline;
async function physical() {
  return {stock:(await query('SELECT id,quantity,remaining_quantity,dispatched_quantity,status FROM stock_batches WHERE description NOT LIKE $1 OR description IS NULL ORDER BY id',[`${prefix}%`])).rows,
    branches:(await query('SELECT id,quantity,status FROM branch_inventory_batches WHERE product_name NOT LIKE $1 ORDER BY id',[`${prefix}%`])).rows};
}
async function invoke(handler,body,user=stockUser,method='POST',url='/api/stock/import/receive') {
  const out={status:200};
  const res={setHeader(){},getHeader(){},status(s){out.status=s;return this;},json(b){out.body=b;return this;},end(){return this;}};
  await handler({method,body,user,url,headers:{host:'test'}},res);
  return out;
}
async function makeTransfer(id,from,to,qty,lot='LOT',expiry='2035-12-31',status='dispatched') {
  await query(`INSERT INTO stock_transfers(id,from_warehouse,to_branch,status,gm_approved_by)
    VALUES ($1,$2,$3,$4,$5)`,[id,from,to,status,gm.id]);
  const line=(await query(`INSERT INTO stock_transfer_items(transfer_id,product_id,product_name,batch_no,expiry_date,quantity,quantity_approved)
    VALUES ($1,$2,$2,$3,$4::date,$5,$5) RETURNING *`,[id,product,lot,expiry,qty])).rows[0];
  return {transfer:(await query('SELECT * FROM stock_transfers WHERE id=$1',[id])).rows[0],line};
}
async function seedSource(id,qty,cost,lot='LOT',expiry='2035-12-31',location='windhoek_warehouse') {
  await query(`INSERT INTO stock_batches(id,barcode,description,batch_no,expiry_date,quantity,remaining_quantity,
    dispatched_quantity,location,status,cif_unit_cost,dpc_unit_value,original_unit_cif,original_unit_dp)
    VALUES ($1,$1,$2,$3,$4::date,$5,$5,0,$6,'available',$7,$8,$7,$8)`,[id,product,lot,expiry,qty,location,cost,10]);
}
async function clean() {
  await query('DELETE FROM dispatch_notes WHERE transfer_id LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM stock_transfers WHERE id LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM branch_inventory_movements WHERE product_name LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM stock_movements WHERE product_name LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM branch_inventory_batches WHERE product_name LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM stock_batches WHERE description LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM supplier_imports WHERE product_name LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM inventory_balances WHERE product_name LIKE $1',[`${prefix}%`]);
  await query('DELETE FROM stock_product_packs WHERE product_name LIKE $1',[`${prefix.toLowerCase()}%`]);
  await query('DELETE FROM stock_import_receipts WHERE receipt_key LIKE $1',[`${prefix}%`]);
}
describe.sequential('carton receiving and actual source cost lifecycle',()=>{
  beforeAll(async()=>{await query(lifecycleSchema);await query(saleAllocationSchema);await query(reversalSchema);await ensureControlledStockSchema();await clean();baseline=await physical();});
  afterAll(async()=>{await clean();expect(await physical()).toEqual(baseline);});
  it('reconciles expense cents by purchase value, with deterministic ties',()=>{
    expect(allocateExpenses([1,1,1],{freight:.01}).allocations).toEqual([.01,0,0]);
    expect(allocateExpenses([100,300],{freight:1.01,duty:.03}).allocations).toEqual([.26,.78]);
    expect(()=>allocateExpenses([null,20],{duty:2})).toThrow('Purchase costs');
  });
  it('requires explicit factors and converts entered carton prices without rounding unit cost',async()=>{
    const missing=await invoke(receive,{receiptKey:`${prefix}-missing`,items:[{productName:product,quantity:2,enteredUnit:'carton',batchNo:'LOT',expiryDate:'2035-12-31',unitCIF:10}]});
    expect(missing.status).toBe(422);
    expect((await invoke(packs,{productName:product,baseUnit:'unit',packs:[{unit:'unit',factor:1},{unit:'carton',factor:12,barcode:`${prefix}-CTN`}]},stockUser,'PUT')).status).toBe(200);
    const body={receiptKey:`${prefix}-cartons`,supplierId:'Isolated Supplier',expenses:{freight:.01},
      items:[{productName:product,quantity:2,enteredUnit:'carton',batchNo:'IMPORT-LOT',expiryDate:'2035-12-31',unitCIF:10,unitDP:24}]};
    const [first,retry]=await Promise.all([invoke(receive,body),invoke(receive,body)]);
    expect([first.status,retry.status].sort()).toEqual([200,201]);
    const rows=(await query('SELECT * FROM stock_batches WHERE import_reference=$1',[first.body.referenceId])).rows;
    expect(rows).toHaveLength(1);expect(Number(rows[0].remaining_quantity)).toBe(24);
    expect(Number(rows[0].original_unit_cif)*24).toBeCloseTo(20.01,8);
    expect(Number(rows[0].original_unit_dp)).toBe(2);
    expect((await invoke(receive,{...body,notes:'changed'})).status).toBe(409);
  });
  it('keeps blank costs unknown but accepts an explicitly received zero cost',async()=>{
    const result=await invoke(receive,{receiptKey:`${prefix}-blank`,items:[
      {productName:`${prefix}-Unknown`,quantity:1,batchNo:'UNKNOWN',expiryDate:'2035-12-31'},
      {productName:`${prefix}-Free`,quantity:1,batchNo:'FREE',expiryDate:'2035-12-31',unitCIF:0,unitDP:0},
    ]});
    expect(result.status).toBe(201);
    const projection=(await getStockCostProjection()).filter(r=>r.productName.startsWith(prefix));
    expect(projection.find(r=>r.productName.endsWith('Unknown')).missingCostQuantity).toBe(1);
    expect(projection.find(r=>r.productName.endsWith('Free')).missingCostQuantity).toBe(0);
  });
  it('sells one base unit from a received carton without repricing its landed cost',async()=>{
    const cartonBranch=`${prefix.toLowerCase()}_carton_branch`;
    const country=await makeTransfer(`${prefix}-ctnc`,'country_stock','windhoek_warehouse',24,'IMPORT-LOT','2035-12-31','approved');
    expect((await invoke(warehouseReceive,{transferId:country.transfer.id,action:'accept'})).status).toBe(200);
    const shipment=await makeTransfer(`${prefix}-ctnb`,'windhoek_warehouse',cartonBranch,24,'IMPORT-LOT');
    await withTransaction(client=>allocateTransferTx(client,shipment.transfer,shipment.line,24));
    await withTransaction(client=>receiveTransferTx(client,{transferId:shipment.transfer.id,user:stockUser,
      items:[{productName:product,batchNo:'IMPORT-LOT',expiryDate:'2035-12-31',quantity:24}]}));
    await withTransaction(async client=>{
      const result=await deductStock(client,cartonBranch,product,1,'walk_in_non_member_sale','single unit',
        `${prefix}-CARTON-SALE`,999,stockUser.id,7);
      expect(result.short).toBe(0);
    });
    const sale=(await getSalesCostReport({aliases:[cartonBranch]}))[0];
    expect(sale.knownCost).toBeCloseTo(20.01/24,8);
    expect(sale.grossProfit).toBeCloseTo(7-20.01/24,8);
    const remaining=(await getStockCostProjection()).filter(r=>r.location===cartonBranch);
    expect(remaining.reduce((sum,r)=>sum+r.qty,0)).toBe(23);
    expect(remaining.reduce((sum,r)=>sum+r.qty*r.unitCIF,0)+sale.knownCost).toBeCloseTo(20.01,8);
  });
  it('preserves different source costs in the same lot through partial receipts and a sale',async()=>{
    await seedSource(`${prefix}-A`,3,2);await seedSource(`${prefix}-B`,4,5);
    const {transfer,line}=await makeTransfer(`${prefix}-mixed`,'windhoek_warehouse',branch,7);
    await withTransaction(client=>allocateTransferTx(client,transfer,line,7));
    await withTransaction(client=>receiveTransferTx(client,{transferId:transfer.id,user:stockUser,items:[{productName:product,batchNo:'LOT',expiryDate:'2035-12-31',quantity:2}]}));
    await withTransaction(client=>receiveTransferTx(client,{transferId:transfer.id,user:stockUser,items:[{productName:product,batchNo:'LOT',expiryDate:'2035-12-31',quantity:7}]}));
    const batch=(await query('SELECT * FROM branch_inventory_batches WHERE branch_id=$1 AND product_name=$2',[branch,product])).rows[0];
    expect(Number(batch.quantity)).toBe(7);
    expect(batch.metadata.cost_layers.map(l=>l.source.cif_unit_cost)).toEqual([2,2,5]);
    const reservation=await makeTransfer(`${prefix}-br-res`,branch,`${prefix.toLowerCase()}_other_branch`,3);
    await query("UPDATE stock_transfers SET status='approved' WHERE id=$1",[reservation.transfer.id]);
    await withTransaction(client=>allocateTransferTx(client,reservation.transfer,reservation.line,3));
    await withTransaction(client=>restoreTransferAllocationTx(client,reservation.line));
    await query("UPDATE stock_transfers SET status='cancelled' WHERE id=$1",[reservation.transfer.id]);
    const restored=(await query('SELECT metadata FROM branch_inventory_batches WHERE id=$1',[batch.id])).rows[0];
    expect(restored.metadata.cost_layers.map(l=>l.source.cif_unit_cost)).toEqual([2,2,5]);
    await withTransaction(async client=>{
      const result=await deductStock(client,branch,product,5,'walk_in_non_member_sale','isolated sale',`${prefix}-SALE`,999,stockUser.id,20);
      expect(result.short).toBe(0);
    });
    const sales=await getSalesCostReport({aliases:[branch.toLowerCase()]});
    expect(sales[0].knownCost).toBe(16);expect(sales[0].missingCostQuantity).toBe(0);
    expect(sales[0].grossProfit).toBe(84);
    const remaining=(await getStockCostProjection()).filter(r=>r.location===branch);
    expect(remaining.reduce((sum,r)=>sum+r.qty,0)).toBe(2);
    expect(remaining.reduce((sum,r)=>sum+r.qty*r.unitCIF,0)).toBe(10);
    const movement=(await query('SELECT unit_cif,unit_dp FROM stock_movements WHERE reference_id=$1',[`${prefix}-SALE`])).rows[0];
    expect(Number(movement.unit_cif)).toBe(3.2);expect(Number(movement.unit_dp)).toBe(10);
  });
  it('reserves without losing owned stock, and restores the exact source on cancellation',async()=>{
    await seedSource(`${prefix}-RESERVE`,6,7,'RESERVE');
    const {transfer,line}=await makeTransfer(`${prefix}-reserved`,'windhoek_warehouse',branch,4,'RESERVE','2035-12-31','approved');
    await withTransaction(client=>allocateTransferTx(client,transfer,line,4));
    const projection=(await getStockCostProjection()).filter(r=>r.batchNo==='RESERVE' && r.productName===product);
    expect(projection.reduce((sum,r)=>sum+r.onHandQty,0)).toBe(6);
    expect(projection.reduce((sum,r)=>sum+r.availableQty,0)).toBe(2);
    expect(projection.reduce((sum,r)=>sum+r.reservedQty,0)).toBe(4);
    await withTransaction(client=>restoreTransferAllocationTx(client,line));
    await query("UPDATE stock_transfers SET status='cancelled' WHERE id=$1",[transfer.id]);
    expect(Number((await query('SELECT remaining_quantity FROM stock_batches WHERE id=$1',[`${prefix}-RESERVE`])).rows[0].remaining_quantity)).toBe(6);
  });
  it('splits country-to-warehouse receipts by actual source costs and expiry',async()=>{
    await seedSource(`${prefix}-COUNTRY-A`,2,1.125,'COUNTRY','2034-12-31','country_stock');
    await seedSource(`${prefix}-COUNTRY-B`,3,4.25,'COUNTRY','2035-12-31','country_stock');
    const {transfer}=await makeTransfer(`${prefix}-country`,'country_stock','ondangwa_warehouse',5,'COUNTRY',null,'approved');
    const receipt=await invoke(warehouseReceive,{transferId:transfer.id,action:'accept'});
    expect(receipt.status,JSON.stringify(receipt.body)).toBe(200);
    const rows=(await query("SELECT * FROM stock_batches WHERE metadata->>'transfer_id'=$1 ORDER BY expiry_date",[transfer.id])).rows;
    expect(rows.map(r=>Number(r.remaining_quantity))).toEqual([2,3]);
    expect(rows.map(r=>Number(r.original_unit_cif))).toEqual([1.125,4.25]);
    expect((await invoke(warehouseReceive,{transferId:transfer.id,action:'accept'})).status).toBe(409);
  });
  it('records real FEFO expiry/cost splits through GM approval and staff dispatch',async()=>{
    await seedSource(`${prefix}-HANDLER-A`,2,1.125,'HANDLER','2034-12-31');
    await seedSource(`${prefix}-HANDLER-B`,3,4.25,'HANDLER','2035-12-31');
    const {transfer}=await makeTransfer(`${prefix}-handler`,'windhoek_warehouse',branch,5,'HANDLER',null,'pending');
    const approved=await invoke(transfers,{id:transfer.id,status:'approved',gmAction:'approve'},gm,'PATCH','/api/stock/transfers');
    expect(approved.status,JSON.stringify(approved.body)).toBe(200);
    const reservation=(await query("SELECT * FROM stock_movements WHERE reference_id=$1 AND movement_type='reserved' ORDER BY expiry_date",[transfer.id])).rows;
    expect(reservation.map(r=>Number(r.original_unit_cif))).toEqual([1.125,4.25]);
    expect(reservation.map(r=>Number(r.quantity))).toEqual([2,3]);
    const projection=(await query(`SELECT expiry_date,on_hand_qty,available_qty,reserved_qty FROM inventory_balances
      WHERE location_id='windhoek_warehouse' AND product_name=$1 AND batch_no='HANDLER' ORDER BY expiry_date`,[product])).rows;
    expect(projection).toHaveLength(2);
    expect(projection.map(r=>Number(r.on_hand_qty))).toEqual([2,3]);
    expect(projection.map(r=>Number(r.available_qty))).toEqual([0,0]);
    expect(projection.map(r=>Number(r.reserved_qty))).toEqual([2,3]);
    const dispatched=await invoke(transfers,{id:transfer.id,status:'dispatched'},stockUser,'PATCH','/api/stock/transfers');
    expect(dispatched.status,JSON.stringify(dispatched.body)).toBe(200);
    expect((await query("SELECT remaining_quantity FROM stock_batches WHERE id=ANY($1)",[[`${prefix}-HANDLER-A`,`${prefix}-HANDLER-B`]])).rows.every(r=>Number(r.remaining_quantity)===0)).toBe(true);
    const transit=(await getStockCostProjection()).filter(r=>r.location===`in_transit:${transfer.id}`);
    expect(transit.map(r=>r.unitCIF)).toEqual([1.125,4.25]);
    expect(transit.reduce((sum,r)=>sum+r.inTransitQty,0)).toBe(5);
  });
});
