// @vitest-environment node
import {beforeAll,afterAll,it,expect} from 'vitest';
import {writeFile} from 'node:fs/promises';
import {query} from '../api/db.js';
import packs from '../api/stock/product-packs.js';
import barcode from '../api/stock/barcode.js';
import receiveImport from '../api/stock/import/receive.js';
import warehouseReceipt from '../api/stock/warehouses/receive-stock.js';
import transfers from '../api/stock/transfers.js';
import walkinSales from '../api/branch/walkin-sales.js';
import requestRefund from '../api/branch/refund-requests.js';
import approveRefund from '../api/stock/refund-requests.js';
import controlled from '../api/stock/controlled-operations.js';
import branchSummary from '../api/branch/stock-summary.js';
import currentOverview from '../api/stock/current-overview.js';
import {buildBranchPhysicalStockReport} from '../client/src/lib/branchPhysicalStockReport.js';
import {getCompanyStockSummary,getLocationStockSummary,getBranchSalesRevenue} from '../api/services/gmFinanceMisEngine.js';
import {getStockCostProjection,getSalesCostPage} from '../api/services/stockCostReporting.js';

const product='TEST-ITEM',lot='TEST-LOT',expiry='2035-12-31';
// UI fixtures still run under the mandatory isolated-database guard below.
const uiFixture=process.env.STOCK_AUDIT_UI_FIXTURE==='1';
const warehouse='windhoek_warehouse',a=uiFixture?'townshop':'test_a_branch',b=uiFixture?'swakopmund':'test_b_branch';
// Central Stock Portal staff use "stock"; "stock_manager" is branch-scoped.
const stock={id:'ISOLATED-STOCK',role:'stock',fullName:'Isolated stock tester'};
const gm={id:'ISOLATED-GM',role:'gm',fullName:'Isolated GM tester'};
const staff={id:'ISOLATED-BRANCH',role:'branch_manager',branch:a,fullName:'Isolated branch tester'};
const steps=[];
async function invoke(handler,method,body,user=stock,url='/api/test'){
  const out={status:200};
  const res={setHeader(){},getHeader(){},status(code){out.status=code;return this;},
    json(data){out.body=data;return this;},send(data){out.body=data;return this;},end(){return this;}};
  await handler({method,body,user,url,query:{},headers:{host:'isolated.test'}},res);
  return out;
}
function success(result,status=200){
  expect(result.status,JSON.stringify(result.body)).toBe(status);
  return result.body;
}
async function makeTransfer(from,to,quantity){
  success(await invoke(transfers,'POST',{fromWarehouse:from,toBranch:to,status:'prepared',
    items:[{productName:product,batchNo:lot,expiryDate:expiry,quantity}]}),201);
  const transfer=(await query('SELECT * FROM stock_transfers WHERE from_warehouse=$1 AND to_branch=$2 ORDER BY created_at DESC LIMIT 1',[from,to])).rows[0];
  success(await invoke(transfers,'PATCH',{id:transfer.id,status:'approved',gmAction:'approve'},gm));
  return transfer.id;
}
async function physical(){
  const rows=await getStockCostProjection({productName:product});
  const sum=(predicate,key='qty')=>rows.filter(predicate).reduce((n,row)=>n+Number(row[key]),0);
  return {
    warehouse:sum(row=>row.location===warehouse),branchA:sum(row=>row.location===a),
    branchB:sum(row=>row.location===b),transit:sum(()=>true,'inTransitQty'),
    availableA:sum(row=>row.location===a,'availableQty'),
    damagedA:sum(row=>row.location===a && row.condition==='damaged'),
    company:sum(()=>true),
  };
}
async function checkpoint(name,expected){
  const actual=await physical();
  steps.push({name,expected,actual,pass:Object.entries(expected).every(([k,v])=>actual[k]===v)});
  expect(actual,name).toMatchObject(expected);
}
async function inspection(batchType,batchId,condition,disposition){
  const created=success(await invoke(controlled,'POST',{kind:'inspection',reason:'Isolated inspected stock',
    lines:[{batch_type:batchType,batch_id:batchId,quantity:1,condition,disposition,reason:'Isolated inspection'}]}),201).operation;
  const approved=success(await invoke(controlled,'PATCH',{id:created.id,action:'review',
    decisions:[{line_id:created.lines[0].id,decision:'approve'}]},gm)).operation;
  return approved.lines[0].hold_id;
}
beforeAll(async()=>{
  if(process.env.STOCK_AUDIT_ISOLATED!=='1')throw Error('Run with node scripts/run-isolated-stock-audit.mjs; shared business databases are forbidden');
  const current=(await query('SELECT current_database() AS name')).rows[0].name;
  if(current!==process.env.STOCK_AUDIT_DATABASE || !/^stock_audit_[a-f0-9]{32}$/.test(current))
    throw Error('The audit must run in its own empty database');
  expect(Number((await query('SELECT COUNT(*) AS count FROM stock_batches')).rows[0].count)).toBe(0);
  await query(`INSERT INTO products(id,sku,name,unit,dp,cp,is_active)
    VALUES('ISOLATED-TEST-ITEM','TEST-ITEM',$1,'unit',7,9,true) ON CONFLICT(id) DO NOTHING`,[product]);
});
afterAll(async()=>{
  await writeFile('generated-artifacts/stock-audit/lifecycle-results.json',JSON.stringify({product,barcode:'0001234567895',conversion:'1 carton = 10 units',steps},null,2));
});

it('runs the requested 100-unit import-to-two-branches, sale, refund, damage and write-off journey',async()=>{
  success(await invoke(packs,'PUT',{productName:product,baseUnit:'unit',
    packs:[{unit:'unit',factor:1,barcode:'0001234567895'},{unit:'carton',factor:10}]}));
  const scanned=success(await invoke(barcode,'GET',{},stock,'/api/stock/barcode?barcode=0001234567895'));
  expect(scanned).toMatchObject({barcode:'0001234567895',conversionFactor:1,productName:product.toLowerCase()});
  // Duplicate barcode assignment must be rejected without changing its owner.
  expect((await invoke(packs,'PUT',{productName:'OTHER-TEST-ITEM',baseUnit:'unit',
    packs:[{unit:'unit',factor:1,barcode:'0001234567895'}]})).status).toBe(422);
  const receiptBody={receiptKey:'ISOLATED-100-RECEIPT',supplierId:'TEST-SUPPLIER',
    items:[{productName:product,quantity:10,enteredUnit:'carton',batchNo:lot,
      expiryDate:expiry,unitCIF:20,unitDP:70}]};
  success(await invoke(receiveImport,'POST',receiptBody),201);
  const beforeRetry=await physical();
  const duplicate=await invoke(receiveImport,'POST',receiptBody);
  expect([200,201]).toContain(duplicate.status);
  expect(await physical()).toEqual(beforeRetry);
  expect(beforeRetry.company).toBe(100);
  const warehouseTransfer=await makeTransfer('country_stock',warehouse,100);
  success(await invoke(warehouseReceipt,'POST',{transferId:warehouseTransfer,action:'accept'}));
  await checkpoint('A. Warehouse receives 10 cartons / 100 units',{warehouse:100,branchA:0,branchB:0,transit:0,company:100});
  const transferA=await makeTransfer(warehouse,a,30);
  // Approval is a reservation, not a physical company-stock deduction.
  await checkpoint('Reservation conserves company physical stock',{warehouse:100,branchA:0,transit:0,company:100});
  success(await invoke(transfers,'PATCH',{id:transferA,status:'dispatched'}));
  await checkpoint('B. Dispatch 30 units to Branch A',{warehouse:70,branchA:0,transit:30,company:100});
  success(await invoke(transfers,'PATCH',{id:transferA,status:'received',
    items:[{productName:product,batchNo:lot,expiryDate:expiry,quantityReceived:30}]},staff));
  await checkpoint('C. Branch A receives 30 units',{warehouse:70,branchA:30,transit:0,company:100});
  const transferB=await makeTransfer(warehouse,b,20);
  success(await invoke(transfers,'PATCH',{id:transferB,status:'dispatched'}));
  success(await invoke(transfers,'PATCH',{id:transferB,status:'received',
    items:[{productName:product,batchNo:lot,expiryDate:expiry,quantityReceived:20}]},{...staff,branch:b}));
  await checkpoint('D. Branch B receives 20 units',{warehouse:50,branchA:30,branchB:20,transit:0,company:100});
  const saleBody={id:'ISOLATED-SALE-8',branch:a,customerType:'non_member',
    customerName:'Isolated customer',products:[{name:product,quantity:8,unitPrice:9,dpPrice:7}],
    subtotal:72,total:72,offline_id:'ISOLATED-OFFLINE-8'};
  success(await invoke(walkinSales,'POST',saleBody,staff),201);
  await checkpoint('E. Sell 8 units at Branch A',{warehouse:50,branchA:22,branchB:20,company:92});
  success(await invoke(walkinSales,'POST',saleBody,staff));
  expect((await physical()).branchA).toBe(22);
  const allocation=(await query("SELECT movement_id,quantity FROM stock_sale_allocations WHERE sale_reference='ISOLATED-SALE-8'")).rows[0];
  expect(Number(allocation.quantity)).toBe(8);
  const requested=success(await invoke(requestRefund,'POST',{allocation_id:allocation.movement_id,quantity:2,
    operation_key:'ISOLATED-RETURN-2',reason:'Two sealed units physically returned',physical_return_confirmed:true},staff));
  const refundId=requested.request?.id || requested.refund?.id || requested.id;
  success(await invoke(approveRefund,'PATCH',{id:refundId,action:'approve',return_condition:'saleable',
    physical_return_confirmed:true,inspection_reason:'Sealed future-expiry original lot inspected'}));
  await checkpoint('F. Receive a saleable return of 2 units',{branchA:24,availableA:24,company:94});
  expect((await invoke(approveRefund,'PATCH',{id:refundId,action:'approve',return_condition:'saleable',
    physical_return_confirmed:true,inspection_reason:'Repeated submission'})).status).toBe(409);
  const batch=(await query('SELECT id FROM branch_inventory_batches WHERE branch_id=$1 AND product_name=$2 AND quantity>0',[a,product])).rows[0];
  const damaged=await inspection('branch',batch.id,'damaged','quarantine');
  await checkpoint('G. Segregate 1 damaged unit',{branchA:24,availableA:23,damagedA:1,company:94});
  expect(await getLocationStockSummary('branch',a)).toMatchObject({closingStock:24,availableStock:23});
  const damagedSummary=success(await invoke(branchSummary,'GET',{},staff,`/api/branch/stock-summary?branch=${a}`));
  expect(damagedSummary.branches.find(row=>row.branch_id===a)).toMatchObject({
    closing_qty:24,available_qty:23,quarantined_qty:1,qty_returned:2,qty_written_off:0,dp_value:168,cif_value:48});
  const heldReport=buildBranchPhysicalStockReport(damagedSummary.branches.find(row=>row.branch_id===a));
  expect(heldReport).toContain('Owned: 24 · Available: 23 · Reserved: 0 · Quarantined: 1');
  expect(heldReport).toContain('damaged');expect(heldReport).toMatch(/N\$ 168[,.]00/);
  expect(success(await invoke(currentOverview,'GET',{},gm)).summary).toMatchObject({
    totalQtyUnits:94,totalValueCIF:188,totalValueDP:658,availableQty:93,quarantinedQty:1,valuationComplete:true});
  await inspection('segregated',damaged,'damaged','write_off');
  await checkpoint('H. Write off the damaged unit',{warehouse:50,branchA:23,availableA:23,branchB:20,transit:0,damagedA:0,company:93});
  const valued=await getStockCostProjection({productName:product});
  expect(valued.every(row=>row.unitCIF===2)).toBe(true);
  expect(valued.reduce((n,row)=>n+row.qty*row.unitCIF,0)).toBe(186);
  const sales=await getSalesCostPage({aliases:[a],productName:product});
  expect(sales.summary).toMatchObject({knownSalesCost:16,knownSalesRevenue:72,grossProfit:56});
  expect(await getCompanyStockSummary()).toMatchObject({totalQty:93,inTransitQty:0});
  expect(success(await invoke(currentOverview,'GET',{},gm)).summary).toMatchObject({
    totalQtyUnits:93,totalValueCIF:186,totalValueDP:651,availableQty:93,quarantinedQty:0,valuationComplete:true});
  expect((await invoke(currentOverview,'GET',{},staff)).status).toBe(403);
  const summary=success(await invoke(branchSummary,'GET',{},staff,`/api/branch/stock-summary?branch=${a}`));
  const branchReport=summary.branches.find(row=>row.branch_id===a);
  expect(branchReport).toMatchObject({
    closing_qty:23,opening_qty:0,qty_received:30,qty_sold:8,qty_returned:2,qty_written_off:1});
  steps.push({name:'Stock and sales report parity',expected:{grossSold:8,returned:2,netSold:6,writeOff:1,valuationCIF:186,grossProfit:56},
    actual:{grossSold:branchReport.qty_sold,returned:branchReport.qty_returned,
      netSold:branchReport.qty_sold-branchReport.qty_returned,writeOff:branchReport.qty_written_off,
      valuationCIF:valued.reduce((n,row)=>n+row.qty*row.unitCIF,0),grossProfit:sales.summary.grossProfit},pass:true});
});

it('concurrent completed sales cannot oversell and consume eligible stock in FEFO order',async()=>{
  const p='TEST-CONCURRENT',location='test_concurrent_branch';
  for(const [id,date,qty] of [['expired','2000-01-01',2],['earlier','2030-01-01',2],['later','2035-01-01',3]]){
    const source={id:`ISOLATED-${id}-source`,cif_unit_cost:2,dpc_unit_value:7,expiry_date:date};
    await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,
      quantity,status,metadata) VALUES($1,$2,$3,$1,$4,$5,'in_stock',$6)`,
    [`ISOLATED-${id}`,location,p,date,qty,JSON.stringify({cost_layers:[{quantity:qty,source}]})]);
  }
  const sale=id=>invoke(walkinSales,'POST',{id,branch:location,customerType:'member',
    products:[{name:p,quantity:4,unitPrice:7}],subtotal:28,total:28},{...staff,branch:location});
  const results=await Promise.all([sale('ISOLATED-RACE-1'),sale('ISOLATED-RACE-2')]);
  expect(results.map(row=>row.status).sort()).toEqual([201,409]);
  const rows=(await query('SELECT id,quantity FROM branch_inventory_batches WHERE product_name=$1 ORDER BY expiry_date',[p])).rows;
  expect(rows.map(row=>Number(row.quantity))).toEqual([2,0,1]);
  expect(Number((await query('SELECT COUNT(*) AS count FROM branch_walkin_sales WHERE branch_id=$1',[location])).rows[0].count)).toBe(1);
  expect((await sale('ISOLATED-INSUFFICIENT')).status).toBe(409);
  steps.push({name:'Concurrent sales, FEFO, expired-stock exclusion and failed-sale rollback',
    expected:{successfulSales:1,blockedSales:1,expiredUnsold:2,remainingEligible:1},
    actual:{successfulSales:results.filter(row=>row.status===201).length,
      blockedSales:results.filter(row=>row.status===409).length,
      expiredUnsold:Number(rows[0].quantity),remainingEligible:Number(rows[2].quantity)},pass:true});
});

it('limits authenticated branch summary requests to the assigned branch and omits other inventory',async()=>{
  expect((await invoke(branchSummary,'GET',{},null,'/api/branch/stock-summary')).status).toBe(401);
  expect((await invoke(branchSummary,'GET',{},staff,`/api/branch/stock-summary?branch=${b}`)).status).toBe(403);
  const own=success(await invoke(branchSummary,'GET',{},staff,'/api/branch/stock-summary'));
  expect(own.branches.map(r=>r.branch_id)).toEqual([a]);
  expect(own.branches[0]).toMatchObject({closing_qty:23,qty_returned:2,qty_written_off:1});
  const company=success(await invoke(branchSummary,'GET',{},gm,'/api/branch/stock-summary'));
  expect(company.branches.find(r=>r.branch_id===b).closing_qty).toBe(20);
});

it('sales reports include fractional seconds on the selected end date and exclude the next day',async()=>{
  const branch='test_date_boundary_branch';
  for(const [id,date,total] of [['first','2030-01-01 10:00:00+02',1],['late','2030-01-01 23:59:59.999999+02',2],['next','2030-01-02 00:00:00+02',4]])
    await query(`INSERT INTO branch_walkin_sales(id,branch_id,sale_date,customer_type,
      payment_method,total,subtotal,status) VALUES($1,$2,$3,'member','cash',$4,$4,'completed')`,
      [`ISOLATED-DATE-${id}`,branch,date,total]);
  const actual=await getBranchSalesRevenue(branch,'2030-01-01','2030-01-01');
  steps.push({name:'End-date fractional-second sales boundary',expected:{totalSales:3},
    actual:{totalSales:actual.totalSales},pass:actual.totalSales===3});
  expect(actual.totalSales).toBe(3);
});

it('keeps unmirrored legacy branch receipts when newer central movements exist',async()=>{
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,
    expiry_date,quantity,status) VALUES('ISOLATED-LEGACY-BATCH',$1,'TEST-LEGACY','LEGACY','2035-01-01',5,'in_stock')`,[a]);
  await query(`INSERT INTO branch_inventory_movements(id,branch_id,product_name,batch_no,
    type,quantity,reference) VALUES('ISOLATED-LEGACY-RECEIVE',$1,'TEST-LEGACY','LEGACY','receive',5,'ISOLATED-LEGACY')`,[a]);
  const response=success(await invoke(branchSummary,'GET',{},staff,`/api/branch/stock-summary?branch=${a}`));
  const measured=response.branches.find(row=>row.branch_id===a);
  expect(measured).toMatchObject({closing_qty:28,qty_received:35,qty_sold:8,qty_returned:2,qty_written_off:1});
});

it.each([['katima','katima_mulilo'],['hochlandpark','hochland-park'],['walvis_bay','walvisbay']])(
  'groups legacy branch %s with canonical %s and includes held source layers',async(legacy,canonical)=>{
  const aliasBatch=`ISOLATED-ALIAS-${canonical}`,aliasProduct=`ALIAS-${canonical}`;
  const sourceId=(await query('SELECT id FROM stock_batches ORDER BY id LIMIT 1')).rows[0].id;
  const metadata={cif_unit_cost:2,cost_layers:[{quantity:5,source:{id:sourceId,cif_unit_cost:2,dpc_unit_value:7}}]};
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,metadata)
    VALUES($1,$3,$4,'ALIAS-LOT','2035-12-31',5,7,$2::jsonb)`,
    [aliasBatch,JSON.stringify(metadata),legacy,aliasProduct]);
  await inspection('branch',aliasBatch,'damaged','quarantine');
  const actor={role:'branch_manager',branch:canonical};
  for(const alias of [canonical,legacy]){
    const report=success(await invoke(branchSummary,'GET',{},actor,`/api/branch/stock-summary?branch=${alias}`));
    expect(report.branches).toHaveLength(1);
    const br=report.branches[0];
    expect(br).toMatchObject({branch_id:canonical,closing_qty:5,available_qty:4,quarantined_qty:1,cif_value:10,dp_value:35});
    expect(buildBranchPhysicalStockReport(br)).toContain('Owned: 5 · Available: 4 · Reserved: 0 · Quarantined: 1');
    expect(buildBranchPhysicalStockReport(br)).toMatch(/N\$ 35[,.]00/);
  }
  expect((await invoke(branchSummary,'GET',{},staff,`/api/branch/stock-summary?branch=${legacy}`)).status).toBe(403);
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,metadata)
    VALUES($1,$2,$3,'ALIAS-LOT','2035-12-31',2,7,$4::jsonb)`,
    [`${aliasBatch}-CANONICAL`,canonical,aliasProduct,JSON.stringify({cost_layers:[{quantity:2,source:metadata.cost_layers[0].source}]})]);
  const overview=success(await invoke(currentOverview,'GET',{},gm));
  const stockProduct=overview.products.find(row=>row.productName===aliasProduct);
  expect(stockProduct.locations.filter(row=>row.locationType==='branch')).toHaveLength(1);
  expect(stockProduct).toMatchObject({totalQty:7,totalValueCIF:14,totalValueDP:49});
});

it('prints fully held branch stock when there are no available inventory rows',async()=>{
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,metadata)
    VALUES('ISOLATED-HELD-ONLY','outapi','HELD-ONLY','HELD-LOT','2035-12-31',1,7,$1::jsonb)`,
    [JSON.stringify({cif_unit_cost:2,cost_layers:[{quantity:1,source:{cif_unit_cost:2,dpc_unit_value:7}}]})]);
  await inspection('branch','ISOLATED-HELD-ONLY','damaged','quarantine');
  const report=success(await invoke(branchSummary,'GET',{}, {role:'branch_manager',branch:'outapi'},'/api/branch/stock-summary?branch=outapi'));
  const br=report.branches[0];
  expect(br).toMatchObject({closing_qty:1,available_qty:0,quarantined_qty:1,dp_value:7});
  expect(br.inventory.filter(row=>Number(row.quantity)>0)).toHaveLength(0);
  expect(buildBranchPhysicalStockReport(br)).toContain('Owned: 1 · Available: 0 · Reserved: 0 · Quarantined: 1');
});
