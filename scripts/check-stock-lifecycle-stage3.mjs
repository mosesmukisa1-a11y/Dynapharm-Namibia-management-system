import fs from 'node:fs/promises';
import {dir,manifest,db,b,report,save,balances,login,call} from './check-stock-lifecycle-stage1.mjs';
let stock;
try{
 stock=await login('ui_stock');const gm=await login('ui_gm');
 report.before=await balances();
 if(Number(report.before.branch_a)!==24)throw Error('Stage 2 balance 24 required');
 const batch=(await db.query("SELECT id FROM branch_inventory_batches WHERE branch_id='townshop' AND product_name='TEST-ITEM' AND quantity>0")).rows[0];
 async function inspect(type,id,disposition){
  const created=await call(stock,'POST','/stock/controlled-operations',{kind:'inspection',reason:'Synthetic held-unit lifecycle',
   lines:[{batch_type:type,batch_id:id,quantity:1,condition:'damaged',disposition,reason:'Synthetic held-unit lifecycle'}]});
  return (await call(gm,'PATCH','/stock/controlled-operations',{id:created.operation.id,action:'review',
   decisions:[{line_id:created.operation.lines[0].id,decision:'approve'}]})).operation;
 }
 const quarantine=await inspect('branch',batch.id,'quarantine');
 report.holdId=quarantine.lines[0].hold_id;
 report.held=(await db.query('SELECT id,quantity,location FROM stock_segregated_batches WHERE id=$1',[report.holdId])).rows[0];
 if(Number(report.held.quantity)!==1)throw Error('Quarantine did not hold 1');
 await save();
 const written=await inspect('segregated',report.holdId,'write_off');
 report.writeoffOperation=written.id;
 report.after=await balances();
 report.heldAfter=(await db.query('SELECT quantity FROM stock_segregated_batches WHERE id=$1',[report.holdId])).rows[0];
 if(Number(report.after.branch_a)!==23 || Number(report.after.warehouse)!==50 || Number(report.after.branch_b)!==20 || Number(report.after.physical_total)!==93 || Number(report.heldAfter.quantity)!==0)throw Error('Stage 4 physical balance mismatch');
 report.status='PASS';
 const overview=await call(stock,'GET','/stock/current-overview');
 report.stockOverview=overview.summary;
 if(Number(overview.summary.totalQtyUnits)!==93 || Number(overview.summary.inTransitQty)!==0)throw Error('Company overview not 93 / transit 0');
 await stock.goto(manifest.frontend+'/stock?view=controlledOperations',{waitUntil:'domcontentloaded'});
 await stock.locator('.stock-main').waitFor();await stock.screenshot({path:`dir/stage-3.png`.replace('dir',dir)});
 await fs.writeFile(`${dir}/stage-4.json`,JSON.stringify({stage:4,status:'PASS',balances:report.after,held:report.heldAfter,overview:report.stockOverview},null,2));
}catch(e){report.error=e.message;report.status='FAIL';report.after=await balances();await stock?.screenshot({path:`${dir}/stage-3-failure.jpg`}).catch(()=>{});}
finally{await save();await b.close();await db.end();}
console.log(JSON.stringify({stage:report.stage,status:report.status,error:report.error,balances:report.after,held:report.heldAfter,overview:report.stockOverview}));
if(report.status!=='PASS')process.exitCode=1;
