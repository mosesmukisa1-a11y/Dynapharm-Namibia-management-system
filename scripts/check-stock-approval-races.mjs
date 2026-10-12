import {dir,manifest,db,b,report,save,balances,login,call} from './check-stock-lifecycle-stage1.mjs';
try{
 const stock=await login('ui_stock'),gm=await login('ui_gm');
 const batch=(await db.query("SELECT id,quantity FROM branch_inventory_batches WHERE branch_id='swakopmund' AND product_name='TEST-ITEM' AND quantity>0")).rows[0];
 const warehouse=(await db.query("SELECT id FROM stock_batches WHERE location='windhoek_warehouse' AND remaining_quantity>0")).rows[0];
 const create=async lines=>(await call(stock,'POST','/stock/controlled-operations',{kind:'inspection',reason:'Synthetic approval regression',lines})).operation;
 const line=(type,id,quantity)=>({batch_type:type,batch_id:id,quantity,condition:'damaged',disposition:'write_off',reason:'Synthetic damaged inspection'});
 const quarantine=await create([line('warehouse',warehouse.id,1),line('branch',batch.id,Number(batch.quantity))].map(l=>({...l,disposition:'quarantine'})));
 const held=(await call(gm,'PATCH','/stock/controlled-operations',{id:quarantine.id,action:'review',decisions:quarantine.lines.map(l=>({line_id:l.id,decision:'approve'}))})).operation;
 const warehouseHold=held.lines.find(l=>l.batch_id===warehouse.id).hold_id;
 const branchHold=held.lines.find(l=>l.batch_id===batch.id).hold_id;
 const multi=await create([line('segregated',warehouseHold,1),line('segregated',branchHold,Number(batch.quantity))]);
 const whole=await create([line('segregated',branchHold,Number(batch.quantity))]);
 report.pendingCompany=await call(stock,'GET','/stock/current-overview');
 report.pendingHeld=(await db.query('SELECT id,quantity FROM stock_segregated_batches WHERE id=ANY($1)',[[warehouseHold,branchHold]])).rows;
 report.pending=await balances();
 const review={id:whole.id,action:'review',decisions:whole.lines.map(l=>({line_id:l.id,decision:'approve'}))};
 const responses=await Promise.all([1,2].map(()=>gm.request.patch(manifest.frontend+'/api/stock/controlled-operations',{data:review})));
 report.concurrent=[];
 for(const r of responses)report.concurrent.push({status:r.status(),response:await r.json()});
 if(report.concurrent.filter(r=>r.status===200).length!==1)throw Error('Whole-batch approval did not serialize');
 report.wholeAfter=await balances();await save();
 report.wholeCompany=await call(stock,'GET','/stock/current-overview');
 if(Number(report.wholeAfter.branch_b)!==0 || Number(report.wholeAfter.warehouse)!==Number(report.pending.warehouse))throw Error('Whole-batch write-off deducted wrong stock');
 const failure=await gm.request.patch(manifest.frontend+'/api/stock/controlled-operations',{data:{id:multi.id,action:'review',decisions:multi.lines.map(l=>({line_id:l.id,decision:'approve'}))}});
 report.multiFailure={status:failure.status(),response:await failure.json(),balances:await balances()};await save();
 if(failure.ok() || JSON.stringify(report.multiFailure.balances)!==JSON.stringify(report.wholeAfter))throw Error('Multi-item failure did not roll back');
 const heldAfterFailure=Number((await db.query('SELECT quantity FROM stock_segregated_batches WHERE id=$1',[warehouseHold])).rows[0].quantity);
 if(heldAfterFailure!==1)throw Error('Multi-item failure consumed its first held line');
 await call(gm,'PATCH','/stock/controlled-operations',{id:multi.id,action:'review',decisions:multi.lines.map(l=>({line_id:l.id,decision:l.batch_id===warehouseHold?'approve':'reject',reason:'Source consumed by concurrent approved inspection'}))});
 report.afterRetry=await balances();
 if(Number(report.afterRetry.warehouse)!==Number(report.wholeAfter.warehouse))throw Error('Held write-off altered warehouse stock again');
 if(Number((await db.query('SELECT quantity FROM stock_segregated_batches WHERE id=$1',[warehouseHold])).rows[0].quantity)!==0)throw Error('Retry did not deduct exactly one held unit');
 report.finalCompany=await call(stock,'GET','/stock/current-overview');
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.message;}
finally{report.after=await balances();await save();await b.close();await db.end();}
console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;
