import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const base='generated-artifacts/hochland-sale-demo';
const before=JSON.parse(await readFile(`${base}/before-database.json`,'utf8'));
const after=JSON.parse(await readFile(`${base}/after-database.json`,'utf8'));
assert.equal(before.synthetic,true);assert.equal(after.synthetic,true);
const number=value=>Number(value);
assert.equal(number(before.balances.branch),10);
assert.equal(number(before.balances.warehouse),20);
assert.equal(number(before.balances.completed_sales),0);
assert.equal(number(after.balances.branch),8);
assert.equal(number(after.balances.warehouse),20);
const sales=after.tables.branch_walkin_sales;
assert.equal(sales.length,1);
const sale=sales[0];
assert.equal(sale.status,'completed');assert.equal(sale.branch_id,'hochland-park');
assert.equal(sale.payment_method,'cash');assert.equal(number(sale.total),18);
assert.equal(after.tables.stock_movements.length,1);
assert.equal(after.tables.branch_inventory_movements.length,1);
assert.equal(after.tables.stock_sale_allocations.length,1);
const sm=after.tables.stock_movements[0],bim=after.tables.branch_inventory_movements[0],allocation=after.tables.stock_sale_allocations[0];
assert.equal(sm.reference_id,sale.id);assert.equal(bim.reference,sale.id);
assert.equal(allocation.sale_reference,sale.id);
assert.equal(number(sm.quantity),2);assert.equal(number(bim.quantity),2);assert.equal(number(allocation.quantity),2);
assert.equal(number(allocation.snapshot.revenue_total),18);
assert.equal(number(allocation.snapshot.financial_dp_unit)*number(allocation.quantity),14);
const originalCOGS=allocation.snapshot.cost_layers.reduce((sum,layer)=>sum+number(layer.quantity)*number(layer.source.cif_unit_cost),0);
assert.equal(originalCOGS,4);
assert.equal(number(sale.total)-originalCOGS,14);
const activity=after.tables.branch_activity_transactions;
assert.equal(activity.length,1);assert.equal(activity[0].form_reference_id,sale.id);
assert.equal(number(activity[0].grand_total),18);assert.equal(number(activity[0].product_total_dp),14);
assert.equal(activity[0].payment_status,'paid');
assert.equal(after.tables.branch_distributor_profit.length,1);
assert.equal(number(after.tables.branch_distributor_profit[0].profit_amount),4);
assert.equal(after.tables.branch_distributor_profit[0].status,'pending');
for(const table of ['branch_payments','branch_expenses','stock_transfers','branch_refund_requests','stock_linked_reversals','stock_control_operations','stock_control_financial_entries','stock_segregated_batches'])
  assert.equal(after.tables[table]?.length || 0,0,`${table} unexpectedly changed`);
const result={status:'PASS',saleId:sale.id,receipt:sale.sale_number,branchBefore:10,branchAfter:8,
  warehouseBefore:20,warehouseAfter:20,companyBefore:30,companyAfter:28,chargedRevenue:18,dpRevenue:14,
  originalCOGS,grossProfit:14,referralAccrual:4,stockMovementRows:1,branchMovementRows:1,transactions:1,
  limitation:'Synthetic opening stock directly seeded; this is not import/distribution verification.',
  observedReferralIdentifier:{activity:activity[0].nb_number,profit:after.tables.branch_distributor_profit[0].distributor_nb}};
await writeFile(`${base}/assertions.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
