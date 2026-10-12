import {dir,manifest,db,b,report,save,balances,login,call} from './check-stock-lifecycle-stage1.mjs';
let a;
try{
 report.before=await balances();
 a=await login('ui_branch_a');
 const stock=await login('ui_stock');
 await call(a,'POST','/branch/walkin-sales',{id:'UI-LIFECYCLE-SALE-8',receipt_number:'UI-LIFE-0001',saleNumber:'UI-LIFE-0001',
 branch:'townshop',customerType:'non_member',customerName:'Synthetic audit customer',
 products:[{name:'TEST-ITEM',quantity:8,unitPrice:9,dpPrice:7}],subtotal:72,total:72,offline_id:'UI-LIFECYCLE-SALE-8'});
 await a.goto(manifest.frontend+'/branch',{waitUntil:'domcontentloaded'});
 await a.getByRole('button',{name:/Walk-in Sales/}).first().click();
 const displayed=a.getByText('UI-LIFE-0001',{exact:true}).first();
 await displayed.waitFor();
 report.displayedReceipt=await displayed.innerText();
 await a.screenshot({path:`${dir}/stage-2-displayed-receipt.jpg`});
 const caps=await call(a,'GET','/branch/refund-allocations?branch_id=townshop&sale_reference='+encodeURIComponent(report.displayedReceipt));
 const allocation=caps.allocations?.[0];
 if(!allocation)throw Error('Displayed receipt did not resolve an allocation');
 const requested=await call(a,'POST','/branch/refund-requests',{allocation_id:allocation.movement_id,quantity:2,
 operation_key:'UI-LIFECYCLE-RETURN-2',reason:'Two sealed synthetic units physically returned',physical_return_confirmed:true});
 const id=requested.request?.id || requested.refund?.id || requested.id;
 await call(stock,'PATCH','/stock/refund-requests',{id,action:'approve',return_condition:'saleable',
 physical_return_confirmed:true,inspection_reason:'Sealed original-lot synthetic units inspected'});
 report.after=await balances();
 if(Number(report.after.branch_a)!==24 || Number(report.after.physical_total)!==94)throw Error('Sale/return balances differ from expected 24 / 94');
 report.status='PASS';
}catch(e){report.error=e.message;report.status=report.actions.some(x=>x.status>=400)?'FAIL':'BLOCKED';report.after=await balances();await a?.screenshot({path:`${dir}/stage-2-failure.jpg`}).catch(()=>{});}
finally{await save();await b.close();await db.end();}
console.log(JSON.stringify({stage:report.stage,status:report.status,error:report.error,balances:report.after,receipt:report.displayedReceipt}));
if(report.status!=='PASS')process.exitCode=1;
