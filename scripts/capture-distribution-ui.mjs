// Focused, non-stock-mutating visual check against the disposable audit only.
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile('generated-artifacts/stock-ui-verification/environment.json','utf8'));
if(!manifest.disposable || manifest.frontend!=='http://127.0.0.1:5173' ||
  !/^stock_audit_[a-f0-9]{32}$/.test(manifest.isolatedDatabase)) throw Error('Disposable environment required');
const output='generated-artifacts/distribution-ui';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/repl/tools/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({baseURL:manifest.frontend,viewport:{width:1440,height:1000}});
const page=await context.newPage();
const evidence={scope:'Authenticated rendering only; no stock transactions',viewports:[],errors:[]};
page.on('pageerror',error=>evidence.errors.push(error.message));
try {
  const login=await context.request.post('/api/auth/login',{data:{username:'ui_stock',password:'DisposableStockUi-2026!'}});
  evidence.loginStatus=login.status();
  if(login.status()!==200) throw Error(`Synthetic staff login failed: ${login.status()}`);
  await page.goto('/stock');
  await page.getByRole('button',{name:'Distribution',exact:true}).click({timeout:30000});
  await page.getByRole('heading',{name:'Distribute stock',exact:true}).waitFor();
  await page.getByText('No eligible uncommitted country stock',{exact:false}).first().waitFor({timeout:20000});
  for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
    await page.setViewportSize({width,height});
    await page.screenshot({path:`${output}/${name}.png`,fullPage:true});
    await page.screenshot({path:`${output}/${name}-viewport.png`});
    evidence.viewports.push({name,width,height,documentWidth:await page.evaluate(()=>document.documentElement.scrollWidth)});
    await writeFile(`${output}/render-check.json`,JSON.stringify(evidence,null,2));
  }
  console.log(JSON.stringify(evidence,null,2));
} catch(error) {
  evidence.blocker=error.message;
  await page.screenshot({path:`${output}/blocked.png`,fullPage:true}).catch(()=>{});
  await writeFile(`${output}/render-check.json`,JSON.stringify(evidence,null,2));
  throw error;
} finally {await browser.close();}
