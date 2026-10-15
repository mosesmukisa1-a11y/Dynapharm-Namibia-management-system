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
import { getStockCostProjection,getSalesCostReport,getSalesCostPage } from '../api/services/stockCostReporting.js';
import costReport from '../api/stock/cost-report.js';
import {getStockCostAudit} from '../api/services/stockCostAudit.js';
import {readFile} from 'node:fs/promises';
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
  beforeAll(async()=>{await query(lifecycleSchema);await query(saleAllocationSchema);await query(reversalSchema);await ensureControlledStockSchema();
    await query(await readFile(new URL('../migrations/028_stock_cost_reporting_indexes.sql',import.meta.url),'utf8'));
    await clean();baseline=await physical();});
  afterAll(async()=>{await clean();expect(await physical()).toEqual(baseline);});
  it('reconciles expense cents by purchase value, with deterministic ties',()=>{
    expect(allocateExpenses([1,1,1],{freight:.01}).allocations).toEqual([.01,0,0]);
    expect(allocateExpenses([100,300],{freight:1.01,duty:.03}).allocations).toEqual([.26,.78]);
    expect(()=>allocateExpenses([null,20],{duty:2})).toThrow('Purchase costs');
  });
  it('uses one filtered snapshot and preserves cumulative receipts before product filtering',async()=>{
    let calls=0,params;
    const rows=await getStockCostProjection({locations:[' IN_TRANSIT:X '],productName:'Requested'},async(sql,values)=>{
      calls++;params=values;expect(sql).toContain('a.line_id IN');return [{
        stock:[],branches:[],segregated:[],reservations:[
          {id:'a',line_id:'9007199254740993',transfer_id:'x',status:'partially_received',quantity:5,quantity_received:10,
            snapshot:{product_name:'Other',source:{cif_unit_cost:1}}},
          {id:'b',line_id:'9007199254740993',transfer_id:'x',status:'partially_received',quantity:10,quantity_received:10,
            snapshot:{product_name:'Requested',source:{cif_unit_cost:.3333333333333333}}},
        ],
      }];
    });
    expect(calls).toBe(1);expect(params).toEqual([['in_transit:x'],'Requested']);
    expect(rows).toHaveLength(1);expect(rows[0].qty).toBe(5);
    expect(rows[0].unitCIF).toBe(.3333333333333333);
  });
  it('paginates SQL sale details but includes off-page missing evidence in full-scope totals',async()=>{
    const paged=`${prefix}-PAGED`,known=`${prefix}-PAGE-KNOWN`,unknown=`${prefix}-PAGE-UNKNOWN`,
      pageBranch=`${prefix.toLowerCase()}_paging_branch`;
    for(const [id,quantity,date] of [[known,3,'2020-01-01'],[unknown,2,'2020-01-02']])
      await query(`INSERT INTO stock_movements(id,movement_type,product_name,quantity,source_location,status,
        reference_id,created_at,unit_cif) VALUES($1,'walkin_sale',$2,$3,$4,'posted',$1,$5,99)`,[id,paged,quantity,pageBranch,date]);
    await query(`INSERT INTO stock_sale_allocations(movement_id,sale_reference,branch_batch_id,branch_id,
      product_name,quantity,snapshot,created_at) VALUES($1,$1,'historical',$2,$3,3,$4,'2020-01-01')`,
      [known,pageBranch,paged,JSON.stringify({revenue_unit:7,cost_layers:[{quantity:3,source:{cif_unit_cost:.3333333333333333}}]})]);
    const options={aliases:[pageBranch],productName:paged,limit:1};
    const first=await getSalesCostPage(options),second=await getSalesCostPage({...options,offset:1});
    expect(first.rows).toHaveLength(1);expect(first.total).toBe(2);expect(second.rows).toHaveLength(1);
    expect(first.summary).toEqual(second.summary);expect(first.summary.knownSalesCost).toBeCloseTo(1,12);
    expect(first.summary.knownSalesRevenue).toBe(21);expect(first.summary.missingSalesCostQuantity).toBe(2);
    expect(first.summary.missingSalesRevenueQuantity).toBe(2);expect(first.summary.grossProfit).toBeNull();
    expect(second.rows[0].knownCost).toBe(0); // Never infer received CIF from movement/catalogue prices.
    const report=await invoke(costReport,null,{role:'finance'},'GET',
      `/api/stock/cost-report?branchId=${encodeURIComponent(pageBranch)}&productName=${encodeURIComponent(paged)}&pageSize=1`);
    expect(report.status).toBe(200);expect(report.body.sales).toHaveLength(1);
    expect(report.body.pagination.sales.total).toBe(2);expect(report.body.summary.grossProfit).toBeNull();
    expect(report.body.summary.missingSalesCostQuantity).toBe(2);
  });
  it('exports immutable received-source precision, expense shares and actual receipt revenue, including legacy gaps',async()=>{
    const p=`${prefix}-AUDIT`,b=`${prefix.toLowerCase()}_audit_branch`,known=`${prefix}-AUDIT-K`,legacy=`${prefix}-AUDIT-L`;
    for(const [id,qty] of [[known,3],[legacy,2]])
      await query(`INSERT INTO stock_movements(id,movement_type,product_name,quantity,source_location,status,reference_id,created_at,unit_cif)
        VALUES($1,'walkin_sale',$2,$3,$4,'posted',$1,'2020-02-01',99)`,[id,p,qty,b]);
    const snapshot={id:'FROZEN-DEPLETED-BRANCH',quantity:3,revenue_total:'20.00',revenue_unit:'6.666666666666666',
      cost_layers:[{quantity:3,source:{id:'FROZEN-DEPLETED-SOURCE',supplier_import_id:'FROZEN-IMPORT',
        batch_no:'ORIGINAL',expiry_date:'2030-01-01',quantity:10,
        original_unit_cif:'0.123456789012345678901',cif_unit_cost:'0.12345678901234568',
        metadata:{allocated_expense:'0.20',purchase_value:'1.03456789012345678901',
          landed_value:'1.23456789012345678901',base_unit:'piece',entered_unit:'carton',conversion_factor:10}}}]};
    await query(`INSERT INTO stock_sale_allocations(movement_id,sale_reference,branch_batch_id,branch_id,product_name,quantity,snapshot,created_at)
      VALUES($1,$1,$1,$2,$3,3,$4,'2020-02-01')`,[known,b,p,JSON.stringify(snapshot)]);
    const data=await getStockCostAudit({aliases:[b],productName:p,from:'2020-02-01',to:'2020-02-01'});
    expect(data.records).toHaveLength(2);
    const row=data.records.find(r=>r.movement_id===known),unknown=data.records.find(r=>r.movement_id===legacy);
    expect(row.source_batch_id).toBe('FROZEN-DEPLETED-SOURCE');
    expect(row.exact_received_unit_cif).toBe('0.123456789012345678901');
    expect(row.exact_received_layer_cost).toBe('0.370370367037037036703');
    expect(row.actual_sale_revenue_first_layer).toBe('20.00');
    expect(Number(row.landed_expenses_for_sold_layer)).toBe(.06);
    expect(row.complete_audit_profit_first_layer).not.toBeNull();
    expect(unknown.missing_cost).toBe(true);expect(unknown.missing_revenue).toBe(true);
    expect(unknown.exact_received_unit_cif).toBeNull();
    expect(unknown.complete_audit_profit_first_layer).toBeNull();
    expect(data.summary.completeAuditProfit).toBeNull();
    expect(data.summary.knownRevenueSubtotal).toBe('20.00');
    const response=await invoke(costReport,{}, {role:'finance'},'GET',
      `/api/stock/cost-report?audit=json&branchId=${encodeURIComponent(b)}&productName=${encodeURIComponent(p)}&from=2020-02-01&to=2020-02-01&pageSize=1`);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body.content).records).toHaveLength(2);
    expect(response.body.filename).toMatch(/\.json$/);
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
  it('keeps blank and unapproved zero costs unknown; only explicit approval makes zero known',async()=>{
    const result=await invoke(receive,{receiptKey:`${prefix}-blank`,items:[
      {productName:`${prefix}-Unknown`,quantity:1,batchNo:'UNKNOWN',expiryDate:'2035-12-31'},
      {productName:`${prefix}-Free`,quantity:1,batchNo:'FREE',expiryDate:'2035-12-31',unitCIF:0,unitDP:0},
    ]});
    expect(result.status).toBe(201);
    const projection=(await getStockCostProjection()).filter(r=>r.productName.startsWith(prefix));
    expect(projection.find(r=>r.productName.endsWith('Unknown')).missingCostQuantity).toBe(1);
    expect(projection.find(r=>r.productName.endsWith('Free')).missingCostQuantity).toBe(1);
    // Synthetic approved source evidence only; not an approval API or history repair.
    await query(`UPDATE stock_batches SET metadata=COALESCE(metadata,'{}'::jsonb)||'{"zeroCostApproved":true}'::jsonb WHERE description=$1`,[`${prefix}-Free`]);
    const approved=(await getStockCostProjection()).find(r=>r.productName===`${prefix}-Free`);
    expect(approved).toMatchObject({unitCIF:0,unitDPC:0,zeroCostApproved:true,missingCostQuantity:0,missingDPCQuantity:0});
  });
  it('preserves the stored NUMERIC received cost through real import, partial warehouse/branch receipts, sale and both downloads',async()=>{
    await invoke(packs,{productName:product,baseUnit:'unit',packs:[
      {unit:'unit',factor:1},{unit:'carton',factor:12},{unit:'crate',factor:7},
    ]},stockUser,'PUT');
    const imported=await invoke(receive,{receiptKey:`${prefix}-precision`,expenses:{freight:.07},
      items:[{productName:product,quantity:1,enteredUnit:'crate',batchNo:'PRECISION-LOT',
        expiryDate:'2034-12-31',unitCIF:100,unitDP:70}]});
    expect(imported.status).toBe(201);
    const batch=imported.body.items[0].batchId,b=`${prefix.toLowerCase()}_pb`;
    const exact=(await query('SELECT original_unit_cif::text AS exact FROM stock_batches WHERE id=$1',[batch])).rows[0].exact;
    expect(exact).not.toBe(String(Number(exact))); // actually exceeds Number round-trip precision
    const country=await makeTransfer(`${prefix}-pc`,'country_stock','windhoek_warehouse',3,
      'PRECISION-LOT','2034-12-31','approved');
    expect((await invoke(warehouseReceive,{transferId:country.transfer.id,action:'accept'})).status).toBe(200);
    const shipment=await makeTransfer(`${prefix}-pb`,'windhoek_warehouse',b,2,'PRECISION-LOT','2034-12-31');
    await withTransaction(client=>allocateTransferTx(client,shipment.transfer,shipment.line,2));
    await withTransaction(client=>receiveTransferTx(client,{transferId:shipment.transfer.id,user:stockUser,
      items:[{productName:product,batchNo:'PRECISION-LOT',expiryDate:'2034-12-31',quantity:2}]}));
    await withTransaction(async client=>{
      expect((await deductStock(client,b,product,1,'walk_in_non_member_sale','exact source proof',
        `${prefix}-PS`,999,stockUser.id,50)).short).toBe(0);
    });
    const frozen=(await query('SELECT snapshot FROM stock_sale_allocations WHERE sale_reference=$1',[`${prefix}-PS`])).rows[0].snapshot;
    expect(frozen.cost_layers[0].source.received_unit_cif_exact).toBe(exact);
    for(const format of ['json','csv']){
      const response=await invoke(costReport,{}, {role:'finance'},'GET',
        `/api/stock/cost-report?audit=${format}&branchId=${encodeURIComponent(b)}`);
      expect(response.status).toBe(200);
      if(format==='json'){
        const row=JSON.parse(response.body.content).records[0];
        expect(row.exact_received_unit_cif).toBe(exact);
        expect(row.source_batch_id).toBe(batch);
        expect(typeof row.receipt_base_quantity).toBe('string');
        expect(Number(row.receipt_base_quantity)).toBe(7); // not warehouse receipt 3 or branch receipt 2
        expect(Number(row.landed_expenses_for_sold_layer)).toBe(.01);
        expect(row.missing_expense_evidence).toBe(false);
      }else expect(response.body.content).toContain(`"${exact}"`);
    }
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
