import {dir,manifest,db,b,report,save,balances,login,call} from './check-stock-lifecycle-stage1.mjs';
let stock;
try{
 stock=await login('ui_stock');report.before=await balances();
 const movements=await call(stock,'GET','/stock-movements?type=write_off&limit=1000');
 report.writeoffs=movements;
 const rows=Array.isArray(movements)?movements:movements.movements || movements.data || [];
 const row=rows.find(x=>(x.product_name || x.productName)==='TEST-ITEM' && (x.movement_type || x.movementType)==='write_off');
 if(!row)throw Error('No write-off movement for the held unit is available to dispose');
 report.movement=row;
 await call(stock,'PUT','/stock-movements',{action:'dispose',id:row.id});
 report.after=await balances();
 if(JSON.stringify(report.before)!==JSON.stringify(report.after))throw Error('Physical disposal changed stock');
 const retry=await stock.request.put(manifest.frontend+'/api/stock-movements',{data:{action:'dispose',id:row.id}});
 report.retry={status:retry.status(),response:await retry.json(),balances:await balances()};
 if(retry.status()!==409 || JSON.stringify(report.retry.balances)!==JSON.stringify(report.before))throw Error('Disposal retry was not safely rejected');
 report.status='PASS';
}catch(e){report.error=e.message;report.status='FAIL';report.after=await balances();await stock?.screenshot({path:`${dir}/stage-5-failure.jpg`}).catch(()=>{});}
finally{await save();await b.close();await db.end();}
console.log(JSON.stringify({stage:report.stage,status:report.status,error:report.error,balances:report.after,movement:report.movement}));
if(report.status!=='PASS')process.exitCode=1;
