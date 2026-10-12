import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const dir='generated-artifacts/stock-navigation-audit';
const env=JSON.parse(await fs.readFile(`${dir}/environment.json`,'utf8'));
if(!env.disposable || env.frontend!=='http://127.0.0.1:5174')throw Error('Isolated fixture required');
const b=await chromium.launch({executablePath:'/repl/tools/bin/chromium',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1440,height:960}});
const report=process.argv.includes('--resume')
 ? JSON.parse(await fs.readFile(`${dir}/browser-stages.json`,'utf8'))
 : {scope:'Synthetic isolated staff session; read-only tab smoke tests, not full workflow verification',stages:[],errors:[]};
let current=null;
p.on('pageerror',e=>report.errors.push({view:current,error:e.message}));
p.on('response',r=>{if(r.url().includes('/api/') && r.status()>=400 && current)report.errors.push({view:current,status:r.status(),endpoint:new URL(r.url()).pathname});});
const save=()=>fs.writeFile(`${dir}/browser-stages.json`,JSON.stringify(report,null,2));
try{
 await p.goto(env.frontend+'/stock');
 await p.getByRole('button',{name:'Sign In',exact:true}).first().click();
 await p.getByPlaceholder('Enter your username').fill('ui_stock');
 await p.getByPlaceholder('Enter your password').fill('DisposableStockUi-2026!');
 await p.locator('form').filter({has:p.getByPlaceholder('Enter your username')}).getByRole('button',{name:'Sign In',exact:true}).click();
 await p.locator('.stock-sidebar').waitFor({timeout:20000});
 const records=JSON.parse(await fs.readFile(`${dir}/initial-matrix.json`,'utf8'));
 for(const record of records){
  if(report.stages.some(s=>s.view===record.id))continue;
  current=record.id;
  try{
   await p.goto(env.frontend+record.route);
   await p.locator('.stock-main h1').waitFor({timeout:15000});
   await p.waitForTimeout(700);
   const active=await p.locator('.stock-nav-link[aria-current="page"]').getAttribute('aria-label');
   if(!active)throw Error('No active navigation item');
   await p.screenshot({path:`${dir}/${record.id}.jpg`,quality:65});
   report.stages.push({view:current,result:'RENDERED ONLY',active,heading:await p.locator('.stock-main h1').innerText(),workflow:'NOT VERIFIED'});
  }catch(e){report.stages.push({view:current,result:'FAILED',error:e.message});}
  await save();
 }
 current='navigation-history';
 await p.goto(env.frontend+'/stock?view=writeOffs');
 await p.locator('.stock-nav-link[aria-label="Overview"]').click();
 await p.goBack();
 if(!p.url().includes('view=writeOffs'))throw Error('History failed');
 await p.reload();
 await p.getByRole('heading',{name:'Write-Offs',exact:true}).waitFor();
 report.stages.push({view:current,result:'PASS',checks:['direct link','active state','back','refresh']});
 await p.screenshot({path:`${dir}/writeOffs.jpg`,quality:80});
 await p.setViewportSize({width:390,height:844});
 await p.screenshot({path:`${dir}/mobile-writeoffs.jpg`,quality:80});
 report.mobile={width:390,overflow:await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)};
 await save();
}catch(e){report.failure={action:current || 'Open staff login and fill username',error:e.message,url:p.url()};await p.screenshot({path:`${dir}/failure.jpg`,quality:75}).catch(()=>{});await save();process.exitCode=1;}
finally{await b.close();}
console.log(JSON.stringify({stages:report.stages.length,errors:report.errors,failure:report.failure,mobile:report.mobile},null,2));
