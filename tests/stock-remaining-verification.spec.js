// @vitest-environment node
import {beforeAll,afterAll,it,expect} from 'vitest';
import {writeFile} from 'node:fs/promises';
import {query,withTransaction} from '../api/db.js';
import orders from '../api/stock/supplier-orders.js';
import sales from '../api/branch/walkin-sales.js';
import requestRefund from '../api/branch/refund-requests.js';
import approveRefund from '../api/stock/refund-requests.js';
import costReport from '../api/stock/cost-report.js';
import {getSalesReturnsSummary} from '../api/services/stockFinancialReports.js';
import {getBranchSalesRevenue,getAllBranchesSalesRevenue} from '../api/services/gmFinanceMisEngine.js';
import {getStockCostProjection,getSalesCostPage} from '../api/services/stockCostReporting.js';
import {getStockReconciliation} from '../api/services/stockReadOnlyReconciliation.js';
import {businessDay,validateBusinessDates} from '../api/services/businessDates.js';
import {getSlowMovingStock} from '../api/services/slowMovingStock.js';
import gmSummary from '../api/gm/summary.js';
import financeSummary from '../api/finance/summary.js';

const p='ISOLATED-FINANCIAL-PRODUCT',branch='isolated_financial_branch',prefix='ISOLATED-FINANCIAL-';
const staff={id:prefix+'STAFF',role:'branch_manager',branch,fullName:'Synthetic branch tester'};
const stock={id:prefix+'STOCK',role:'stock',fullName:'Synthetic stock tester'};
const checks=[];
async function invoke(handler,method,body={},user=staff,url='/api/test'){
  const result={status:200};
  const response={setHeader(){},getHeader(){},status(n){result.status=n;return this;},
    json(data){result.body=data;return this;},send(data){result.body=data;return this;},end(){return this;}};
  await handler({method,body,user,url,query:Object.fromEntries(new URL(url,'http://isolated.test').searchParams),headers:{host:'isolated.test'}},response);
  return result;
}
const sum=async()=>getSalesReturnsSummary({aliases:[branch],productName:p});
const numbers=data=>Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==='string' && /^-?\d+(\.\d+)?$/.test(v)?Number(v):v]));
beforeAll(async()=>{
  const source={id:prefix+'SOURCE',cif_unit_cost:2,dpc_unit_value:7,expiry_date:'2035-12-31'};
  await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,status,metadata)
    VALUES($1,$2,$3,'F-LOT','2035-12-31',10,'in_stock',$4)`,
    [prefix+'BATCH',branch,p,JSON.stringify({cost_layers:[{quantity:10,source}]})]);
});
afterAll(async()=>{
  await writeFile('generated-artifacts/stock-audit/additional-verification.json',JSON.stringify({checks},null,2));
  await query('DELETE FROM stock_linked_reversals WHERE original_reference LIKE $1',[prefix+'%']);
  await query('DELETE FROM branch_refund_requests WHERE sale_reference LIKE $1',[prefix+'%']);
  await query('DELETE FROM branch_activity_transactions WHERE branch_id=$1',[branch]);
  await query('DELETE FROM branch_distributor_profit WHERE sale_id LIKE $1',[prefix+'%']);
  await query('DELETE FROM branch_walkin_sales WHERE branch_id=$1',[branch]);
  await query('DELETE FROM branch_inventory_movements WHERE branch_id=$1',[branch]);
  await query('DELETE FROM stock_movements WHERE product_name=$1',[p]);
  await query('DELETE FROM branch_inventory_batches WHERE branch_id=$1',[branch]);
  await query('DELETE FROM stock_segregated_batches WHERE location=$1',[branch]);
  await query('DELETE FROM inventory_balances WHERE location_id=$1',[branch]);
  await query('DELETE FROM product_prices WHERE description=$1',[p]);
  await query('DELETE FROM stock_batches WHERE description=$1',[p]);
  await query('DELETE FROM supplier_purchase_orders WHERE product_name=$1',[p]);
});
it('purchase order creation/submission/approval does not increase physical stock; unauthorised requests fail',async()=>{
  const before=await getStockCostProjection();
  expect((await invoke(orders,'POST',{product_name:p,quantity:50},null)).status).toBe(401);
  expect((await invoke(orders,'POST',{product_name:p,quantity:50},staff)).status).toBe(403);
  expect((await invoke(orders,'POST',{product_name:p,quantity:-1},stock)).status).toBe(400);
  const order=await invoke(orders,'POST',{product_name:p,quantity:50},stock);
  expect(order.status).toBe(201);
  for(const status of ['submitted','approved']){
    expect((await invoke(orders,'PATCH',{id:order.body.order.id,status},stock)).status).toBe(200);
    expect(await getStockCostProjection()).toEqual(before);
  }
  checks.push({name:'Pending purchase orders do not create physical stock',pass:true});
});
it('reconciles actual gross/refund/net revenue, original COGS and DP without mixing their bases',async()=>{
  const sale=await invoke(sales,'POST',{id:prefix+'SALE',branch,customerType:'non_member',
    products:[{name:p,quantity:8,unitPrice:9,dpPrice:7}],subtotal:72,total:72,offline_id:prefix+'OFFLINE'});
  expect(sale.status).toBe(201);
  const allocation=(await query('SELECT * FROM stock_sale_allocations WHERE sale_reference=$1',[prefix+'SALE'])).rows[0];
  const refund=await invoke(requestRefund,'POST',{allocation_id:allocation.movement_id,quantity:2,
    operation_key:prefix+'RETURN-2',reason:'Two original sealed units returned',physical_return_confirmed:true});
  expect(refund.status).toBe(200);
  expect((await invoke(approveRefund,'PATCH',{id:refund.body.id,action:'approve',return_condition:'saleable',
    physical_return_confirmed:true,inspection_reason:'Original lot inspected'},stock)).status).toBe(200);
  const expected={grossSoldQuantity:8,returnedQuantity:2,netSoldQuantity:6,grossSalesRevenue:72,refunds:18,
    netSalesRevenue:54,grossCostOfGoodsSold:16,returnedOriginalCost:4,netCostOfGoodsSold:12,
    grossProfitAfterReturns:42,grossSalesDP:56,refundsDP:14,netSalesDP:42,financialComplete:true,dpComplete:true};
  const actual=numbers(await sum());
  expect(actual).toMatchObject(expected);
  expect(await getBranchSalesRevenue(branch)).toMatchObject({totalSales:42,nonMemberSales:42,refundsDP:14,netCustomerReceipts:54});
  checks.push({name:'Original-basis financial reconciliation',expected,actual,pass:true});
});
it('screen API and financial exports agree; another branch cannot export these records',async()=>{
  const url=`/api/stock/cost-report?branchId=${branch}&productName=${p}`;
  const report=await invoke(costReport,'GET',{},staff,url);
  expect(report.status).toBe(200);expect(numbers(report.body.summary)).toMatchObject({netSalesRevenue:54,grossProfitAfterReturns:42});
  for(const format of ['financial_json','financial_csv']){
    const download=await invoke(costReport,'GET',{},staff,url+'&audit='+format);
    expect(download.status).toBe(200);
    expect(numbers(download.body.metadata.financial)).toMatchObject({netSalesRevenue:54,netCostOfGoodsSold:12});
    if(format==='financial_json')expect(numbers(JSON.parse(download.body.content)).netSalesDP).toBe(42);
    else expect(download.body.content).toContain('"netSalesDP","42');
    expect((await invoke(costReport,'GET',{}, {...staff,branch:'other_isolated_branch'},url+'&audit='+format)).status).toBe(403);
  }
  expect((await invoke(costReport,'GET',{},null,url)).status).toBe(401);
  checks.push({name:'Report/API/financial JSON/CSV parity and branch export scope',pass:true});
});
it('damaged returns reverse their original costs but remain unavailable; new catalogue prices do not reprice history',async()=>{
  await query('INSERT INTO product_prices(description,dp,cp,cif,bv) VALUES($1,99,100,50,1)',[p]);
  expect(Number((await sum()).netSalesDP)).toBe(42);
  const allocation=(await query('SELECT movement_id FROM stock_sale_allocations WHERE sale_reference=$1',[prefix+'SALE'])).rows[0];
  const refund=await invoke(requestRefund,'POST',{allocation_id:allocation.movement_id,quantity:1,
    operation_key:prefix+'RETURN-DAMAGE',reason:'Damaged original unit physically returned',physical_return_confirmed:true});
  expect((await invoke(approveRefund,'PATCH',{id:refund.body.id,action:'approve',return_condition:'damaged',
    physical_return_confirmed:true,inspection_reason:'Damaged original lot inspected'},stock)).status).toBe(200);
  expect(numbers(await sum())).toMatchObject({returnedQuantity:3,netSalesRevenue:45,netCostOfGoodsSold:10,grossProfitAfterReturns:35,netSalesDP:35});
  const rows=await getStockCostProjection({locations:[branch],productName:p});
  expect(rows.reduce((n,r)=>n+r.availableQty,0)).toBe(4);
  expect(rows.reduce((n,r)=>n+r.quarantinedQty,0)).toBe(1);
  expect((await getBranchSalesRevenue(branch)).totalSales).toBe(35);
  checks.push({name:'Damaged-return COGS and frozen historical DP',pass:true});
});
it('uses Windhoek midnight/fractional seconds and economic backdates; refund-only days stay negative',async()=>{
  const otherSales=(await getAllBranchesSalesRevenue('2030-01-02','2030-01-02')).totalSales;
  await query('UPDATE branch_walkin_sales SET sale_date=$1 WHERE id=$2',['2030-01-01 23:59:59.999999+02',prefix+'SALE']);
  await query('UPDATE branch_refund_requests SET processed_at=$1 WHERE sale_reference=$2',['2030-01-02 00:00:00+02',prefix+'SALE']);
  expect((await getSalesCostPage({aliases:[branch],from:'2030-01-01',to:'2030-01-01'})).summary.knownSalesRevenue).toBe(72);
  expect(Number((await getSalesReturnsSummary({aliases:[branch],from:'2030-01-01',to:'2030-01-01'})).refunds)).toBe(0);
  const next=await getSalesReturnsSummary({aliases:[branch],from:'2030-01-02',to:'2030-01-02'});
  expect(numbers(next)).toMatchObject({grossSalesRevenue:0,refunds:27,netSalesRevenue:-27,netCostOfGoodsSold:-6,grossProfitAfterReturns:-21});
  expect((await getBranchSalesRevenue(branch,'2030-01-02','2030-01-02')).totalSales).toBe(-21);
  expect((await getAllBranchesSalesRevenue('2030-01-02','2030-01-02')).totalSales).toBe(otherSales-21);
  expect(businessDay(new Date('2030-01-01T22:00:00Z'))).toBe('2030-01-02');
  expect(()=>validateBusinessDates('2030-02-30','2030-03-01')).toThrow();
  expect(()=>validateBusinessDates('2030-03-02','2030-03-01')).toThrow();
  for(const handler of [gmSummary,financeSummary]){
    const url='/api/summary?startDate=2030-01-02&endDate=2030-01-02';
    expect((await invoke(handler,'GET',{},null,url)).status).toBe(401);
    expect((await invoke(handler,'GET',{},staff,url)).status).toBe(403);
    const reply=await invoke(handler,'GET',{}, {...stock,role:'gm'},url);
    expect(reply.status).toBe(200);
    expect((reply.body.sales || reply.body.revenue).totalSales).toBe(otherSales-21);
    expect(Number((reply.body.financial || reply.body.finance).netCostOfGoodsSold)).toBe(-6);
    expect((await invoke(handler,'GET',{}, {...stock,role:'gm'},'/api/summary?startDate=2030-02-30')).status).toBe(422);
  }
  checks.push({name:'Africa/Windhoek boundaries, backdating and refund-only periods',pass:true});
});
it('read-only reconciliation reports mismatches without repairing quantities or stored balances',async()=>{
  const before=(await query('SELECT id,quantity,metadata FROM branch_inventory_batches WHERE branch_id=$1',[branch])).rows;
  const report=await withTransaction(async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    return getStockReconciliation(async(sql,params)=>(await client.query(sql,params)).rows,{environment:'isolated synthetic'});
  });
  const rows=report.rows.filter(r=>r.location===branch);
  expect(rows.reduce((n,r)=>n+r.physicalQty,0)).toBe(5);
  expect(rows.reduce((n,r)=>n+r.quarantinedQty,0)).toBe(1);
  expect(report.physicalCountStatus).toBe('UNVERIFIED');
  expect(rows.some(r=>r.projectionMinusMovements!==0)).toBe(true); // explicit synthetic opening stock has no receipt ledger
  expect((await query('SELECT id,quantity,metadata FROM branch_inventory_batches WHERE branch_id=$1',[branch])).rows).toEqual(before);
  checks.push({name:'Read-only reconciliation and uncertain opening history',pass:true});
});
it('defines and tests sales inactivity, configurable window, unknown history and location aliases',async()=>{
  const layers=await getStockCostProjection({locations:[branch],productName:p});
  const a=await getSlowMovingStock(layers,{locations:[branch],asOf:'2030-04-01',inactivityDays:90});
  expect(a.rows).toEqual([expect.objectContaining({availableQty:4,lastActivity:'2030-01-01',daysSinceActivity:90,status:'SLOW MOVING'})]);
  expect((await getSlowMovingStock(layers,{locations:[branch],asOf:'2030-04-01',inactivityDays:91})).rows[0].status).toBe('ACTIVE');
  expect((await getSlowMovingStock(layers,{asOf:'2030-04-01'},async()=>[])).rows[0].status).toContain('AGE UNVERIFIED');
  await expect(getSlowMovingStock(layers,{inactivityDays:0})).rejects.toThrow('1–3650');
  const aliases=await getSlowMovingStock([{location:'townshop',productName:p,availableQty:3}],
    {asOf:'2030-04-01'},async()=>[{location:'windhoek cbd',product:p.toLowerCase(),last_activity:'2030-03-31T22:00:00Z'}]);
  expect(aliases.rows[0]).toMatchObject({lastActivity:'2030-04-01',daysSinceActivity:0,status:'ACTIVE'});
  checks.push({name:'Slow-moving report inactivity and ambiguous history',pass:true});
});
it('keeps original discount evidence consistent across DP views without changing actual receipts or received CIF',async()=>{
  await query(`UPDATE branch_walkin_sales SET data=COALESCE(data,'{}'::jsonb)||'{"discount_pct":10}'::jsonb WHERE id=$1`,[prefix+'SALE']);
  const actual=numbers(await sum());
  expect(actual).toMatchObject({grossSalesDP:50.4,refundsDP:18.9,netSalesDP:31.5,netSalesRevenue:45,netCostOfGoodsSold:10,grossProfitAfterReturns:35});
  expect((await getBranchSalesRevenue(branch)).totalSales).toBeCloseTo(31.5,8);
  checks.push({name:'Original discount, frozen DP, actual receipts and CIF remain separate',pass:true});
});
it('does not expose a warehouse batch to branch staff through a shared Windhoek alias',async()=>{
  await query(`INSERT INTO stock_batches(id,description,batch_no,expiry_date,quantity,remaining_quantity,
    warehouse_id,cif_unit_cost,dpc_unit_value,status) VALUES($1,$2,'WAREHOUSE-ALIAS','2035-12-31',11,11,'windhoek',2,7,'available')`,
    [prefix+'WAREHOUSE-ALIAS',p]);
  const url=`/api/stock/cost-report?branchId=townshop&productName=${p}`;
  const reply=await invoke(costReport,'GET',{}, {...staff,branch:'townshop'},url);
  expect(reply.status).toBe(200);
  expect(reply.body.stock.some(r=>r.batchNo==='WAREHOUSE-ALIAS')).toBe(false);
  const all=await getStockCostProjection({productName:p});
  expect(all.some(r=>r.batchNo==='WAREHOUSE-ALIAS')).toBe(true);
  checks.push({name:'Warehouse/branch shared-alias data protection',pass:true});
});
