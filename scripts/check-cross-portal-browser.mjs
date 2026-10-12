import fs from 'node:fs/promises';
import {dir,manifest,db,b,report,save,balances,login,call} from './check-stock-lifecycle-stage1.mjs';
const out='generated-artifacts/cross-portal-reconciliation';
let gm;
let originalActor;
try{
 // Reference labels are part of this UI fixture, not copied business stock.
 await db.query("INSERT INTO branches(id,name,status) VALUES('townshop','Windhoek CBD','active') ON CONFLICT(id) DO NOTHING");
 originalActor=(await db.query("SELECT role,branch FROM users WHERE username='ui_gm'")).rows[0];
 await db.query("UPDATE users SET role='admin',branch='tsumeb' WHERE username='ui_gm'");
 report.authFixture='Synthetic ui_gm temporarily assigned administrator role and Tsumeb; real login middleware; restored after this check';
 gm=await login('ui_gm');const branch=await login('ui_branch_a');
 const realtime=await call(gm,'GET','/stock/realtime');
 const date=realtime.todayStats.date;
 const daily=await call(gm,'GET',`/gm/daily-sales?date=${date}`);
 if(daily.summary.totalRevenue!==realtime.todayStats.revenue || daily.summary.totalTransactions!==realtime.todayStats.salesCount)throw Error('Equal-scope daily totals differ');
 report.daily={date,stats:realtime.todayStats,gmSummary:daily.summary};
 const destination=realtime.recentMovements.find(m=>m.destination_location==='townshop');
 if(!destination || destination.destinationLocationName!=='Windhoek CBD')throw Error('Destination display mapping missing');
 report.destination=destination;
 for(const path of ['/gm/daily-sales','/stock/realtime','/branch/stock-summary?branch=swakopmund']){
  const response=await branch.request.get(manifest.frontend+'/api'+path);
  report.actions.push({action:`Branch A GET ${path}`,status:response.status(),response:await response.json()});
  if(response.status()!==403)throw Error(`Cross-scope access was not denied: ${path}`);
 }
 const director=await call(gm,'GET',`/director/summary?startDate=${date}&endDate=${date}`);
 const finance=await call(gm,'GET',`/finance/summary?startDate=${date}&endDate=${date}`);
 report.originalEvidence={director:director.finance.originalEvidence,finance:finance.financial};
 if(JSON.stringify(report.originalEvidence.director)!==JSON.stringify(report.originalEvidence.finance))throw Error('Original-evidence metrics differ for equal scope');
 await gm.goto(manifest.frontend+'/director',{waitUntil:'domcontentloaded'});
 await gm.getByText('Estimated CIF Cost',{exact:true}).first().waitFor();
 await gm.getByText('Original-evidence gross profit:',{exact:true}).waitFor();
 await gm.screenshot({path:`${out}/director-bases.jpg`,fullPage:true});
 report.screen=await gm.locator('body').innerText();
 await gm.goto(manifest.frontend+'/branch',{waitUntil:'domcontentloaded'});
 const selector=gm.locator('select').filter({has:gm.locator('option[value="tsumeb"]')}).first();
 if(await selector.inputValue()!=='tsumeb')throw Error('Branch selector differs from assigned Tsumeb scope');
 await gm.getByText('Acting as',{exact:false}).waitFor();
 report.branchContext={selector:await selector.inputValue(),text:await gm.getByText('Acting as',{exact:false}).innerText()};
 await gm.screenshot({path:`${out}/branch-effective-scope.jpg`});
 report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.message;await gm?.screenshot({path:`${out}/browser-failure.jpg`}).catch(()=>{});}
finally{if(originalActor)await db.query("UPDATE users SET role=$1,branch=$2 WHERE username='ui_gm'",[originalActor.role,originalActor.branch]);report.after=await balances();await save();await fs.writeFile(`${out}/browser-reconciliation.json`,JSON.stringify(report,null,2));await b.close();await db.end();}
console.log(JSON.stringify({status:report.status,error:report.error,daily:report.daily}));
if(report.status!=='PASS')process.exitCode=1;
