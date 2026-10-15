import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import {createServer} from 'vite';
import {assertIsolatedTestDatabase} from '../api/testDatabaseGuard.js';

if(['1','true'].includes(process.env.REPLIT_DEPLOYMENT)||process.env.NODE_ENV==='production'||!process.env.DATABASE_URL)throw Error('Disposable development environment required');
const source=new URL(process.env.DATABASE_URL),name=`stock_audit_${randomUUID().replaceAll('-','')}`;
if(!['helium','localhost','127.0.0.1','[::1]'].includes(source.hostname))throw Error('Local disposable source required');
const isolated=new URL(source);isolated.pathname=`/${name}`;isolated.search='';isolated.hash='';
// Disposable sessions must never be valid on the business application.
const auditAuthKey=randomBytes(48).toString('hex');
const navigationAudit=process.argv.includes('--navigation');
const lifecycleAudit=process.argv.includes('--lifecycle');
const continuation=process.argv.includes('--continuation');
const release=process.argv.includes('--release-audit');
const clientHistory=process.argv.includes('--client-history');
const branchClearance=process.argv.includes('--branch-clearance');
const saleDemo=process.argv.includes('--sale-demo');
const finalRelease=process.argv.includes('--final-release');
const salesStock=process.argv.includes('--sales-stock')||finalRelease;
const apiPort=finalRelease?3011:salesStock?3010:saleDemo?3009:branchClearance?3008:clientHistory?3007:release?3006:continuation?3005:lifecycleAudit?3004:navigationAudit?3003:3002;
const uiPort=finalRelease?5182:salesStock?5181:saleDemo?5180:branchClearance?5179:clientHistory?5178:release?5177:continuation?5176:lifecycleAudit?5175:navigationAudit?5174:5173;
const env={...process.env,DATABASE_URL:isolated.toString(),STOCK_AUDIT_ISOLATED:'1',
  STOCK_AUDIT_DATABASE:name,STOCK_AUDIT_UI_FIXTURE:'1',NODE_ENV:'test',REPLIT_DEPLOYMENT:'0',
  AUTH_SECRET:auditAuthKey,JWT_SECRET:auditAuthKey,SESSION_SECRET:auditAuthKey,
  PORT:String(apiPort),DATABASE_SSL:new pg.Client({connectionString:source.toString()}).connectionParameters.ssl?'1':'0'};
assertIsolatedTestDatabase(env);
if(finalRelease)Object.assign(env,{STARTUP_MODE:'code-only',ALLOW_SCHEMA_SYNC:'false',ALLOW_REFERENCE_SEEDS:'false',
  ALLOW_INVENTORY_SEED:'false',ALLOW_STOCK_SUMMARY_DDL:'false',ENABLE_STOCK_SCHEDULER:'false',ENABLE_STOCK_HEALTH_DIGEST:'false'});
const admin=new pg.Pool({connectionString:source.toString(),max:1});
let target,backend,frontend,created=false,cleaning=false;
const base=finalRelease?'generated-artifacts/final-release-gate/browser-evidence':salesStock?'generated-artifacts/sales-stock-integration/ui':saleDemo?'generated-artifacts/hochland-sale-demo':branchClearance?'generated-artifacts/branch-stock-clearance/ui':clientHistory?'generated-artifacts/client-history':release?'generated-artifacts/stock-release-verification':continuation?'generated-artifacts/stock-continuation-stages':lifecycleAudit?'generated-artifacts/stock-lifecycle-stages':navigationAudit?'generated-artifacts/stock-navigation-audit':'generated-artifacts/stock-ui-verification';
const authFile=finalRelease?`/tmp/dynapharm-final-${process.pid}-auth.json`:null;
let environment;
const emptyFixture=process.argv.includes('--empty');
const clean=async()=>{
  if(cleaning)return;cleaning=true;
  // Remove our disposable database before waiting on browser/socket shutdown.
  // A supervising shell may force-kill a process after a short grace period.
  if(backend && backend.exitCode===null)backend.kill('SIGTERM');
  // Close the fixture's idle pool before DROP FORCE terminates its connections.
  await target?.end();
  target=null;
  if(created){await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);created=false;}
  await frontend?.close();
  if(backend && backend.exitCode===null){
    backend.kill('SIGTERM');
    await Promise.race([new Promise(resolve=>backend.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,3000))]);
    if(backend.exitCode===null)backend.kill('SIGKILL');
  }
  await target?.end();
  await admin.end();
  if(authFile)await unlink(authFile).catch(error=>{if(error.code!=='ENOENT')throw error;});
  console.log('Disposed isolated UI environment; business records were not used.');
};
async function run(command,args,{input,childEnv=env}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{env:childEnv,stdio:['pipe','pipe','pipe']});
    let output='',errors='';
    child.stdout.on('data',d=>{output+=d;});child.stderr.on('data',d=>{errors+=d;});
    child.on('error',reject);child.on('close',code=>{
      if(code)reject(Error(`${command} failed (${code}): ${(errors || output).replaceAll(source.toString(),'[database]').replaceAll(isolated.toString(),'[isolated database]').slice(-1600)}`));
      else resolve(output);
    });child.stdin.end(input);
  });
}
process.on('SIGTERM',()=>clean().then(()=>process.exit(0)));
process.on('SIGINT',()=>clean().then(()=>process.exit(0)));
try{
  await admin.query(`CREATE DATABASE ${name}`);created=true;
  const schema=await run('pg_dump',['--dbname',source.toString(),'--schema-only','--no-owner','--no-privileges']);
  await run('psql',['--dbname',isolated.toString(),'--quiet','--set','ON_ERROR_STOP=1'],{input:schema});
  target=new pg.Pool({connectionString:isolated.toString(),max:1});
  if((await target.query('SELECT current_database() AS name')).rows[0].name!==name)throw Error('Wrong fixture database');
  await target.query(`INSERT INTO warehouse_locations(id,name,type) VALUES
    ('windhoek_warehouse','Isolated Windhoek warehouse','warehouse'),('ondangwa_warehouse','Isolated second warehouse','warehouse')`);
  await mkdir(base,{recursive:true});
  if(finalRelease)await target.query(`INSERT INTO branches(id,name,status) VALUES
    ('townshop','Windhoek CBD','active'),('swakopmund','Swakopmund','active') ON CONFLICT(id) DO NOTHING`);
  if(!emptyFixture)await run('npx',['vitest','run','tests/stock-lifecycle-end-to-end.spec.js','--project=database',
    '-t','runs the requested 100-unit','--reporter=json',`--outputFile=${base}/fixture-results.json`]);
  if(emptyFixture) {
    // Reference catalogue only; every physical unit is entered by staff in the audit.
    await target.query(`INSERT INTO products(id,sku,name,unit,dp,cp,is_active)
      VALUES('ISOLATED-TEST-ITEM','TEST-ITEM','TEST-ITEM','unit',7,9,true)`);
    await target.query(`INSERT INTO product_prices(description,product_code,dp,cp,cif,bv,updated_by)
      VALUES('TEST-ITEM','TEST-ITEM',7,9,2,0,'isolated-audit-fixture')`);
  }
  if(salesStock) {
    if(!emptyFixture)throw Error('Sales/Stock UI audit requires --empty');
    await target.query("UPDATE product_prices SET dp=341,cp=443,cif=23 WHERE description='TEST-ITEM'");
    await target.query("UPDATE products SET dp=341,cp=443 WHERE name='TEST-ITEM'");
    await target.query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,
      quantity,unit_price,status,source_batch_id,metadata) VALUES('UI-SALES-BATCH','townshop','TEST-ITEM','QA-SALES-LOT',
      '2035-12-31',10,341,'in_stock','UI-SALES-SOURCE',
      '{"original_source":{"id":"UI-SALES-SOURCE","dpc_unit_value":341,"cif_unit_cost":23}}')`);
    await target.query(`INSERT INTO inventory_balances(id,location_id,location_type,product_name,closing_qty,on_hand_qty,available_qty)
      VALUES('UI-SALES-BALANCE','townshop','branch','TEST-ITEM',10,10,10)`);
  }
  const fixturePassword=finalRelease?randomBytes(24).toString('base64url'):'DisposableStockUi-2026!';
  const passwordHash=await bcrypt.hash(fixturePassword,10);
  if(authFile)await writeFile(authFile,JSON.stringify({password:fixturePassword}),{mode:0o600});
  for(const [id,username,role,branch] of [
    ['UI-BRANCH-A','ui_branch_a','branch_manager','townshop'],
    ['UI-BRANCH-B','ui_branch_b','branch_manager','swakopmund'],
    ...(clientHistory?[['CH-FD','ch_fd','frontdesk','townshop'],['CH-C','ch_c','consultant','townshop']]:[]),
    ['UI-STOCK','ui_stock','stock',null],['UI-GM','ui_gm','gm',null]]){
    await target.query(`INSERT INTO users(id,username,password_hash,role,full_name,branch,
      is_active,must_change_password,metadata) VALUES($1,$2,$3,$4,$5,$6,true,false,'{"disposable_ui_audit":true}')`,
      [id,username,passwordHash,role,username,branch]);
  }
  if(finalRelease)for(const role of ['finance','mis','director'])await target.query(
    `INSERT INTO users(id,username,password_hash,role,full_name,is_active,must_change_password,metadata)
    VALUES($1,$2::text,$3,$4,$2::text,true,false,'{"disposable_ui_audit":true}')`,
    ['UI-'+role.toUpperCase(),'ui_'+role,passwordHash,role]);
  if(salesStock)await target.query(`INSERT INTO users(id,username,password_hash,role,full_name,branch,
    is_active,must_change_password,metadata) VALUES('UI-ADMIN','ui_admin',$1,'admin','Synthetic UI administrator',
      'townshop',true,false,'{"disposable_ui_audit":true}')`,[passwordHash]);
  function launchBackend(){
  backend=spawn('node',['server.js'],{env,stdio:['ignore','pipe','pipe']});
  backend.stdout.on('data',()=>{}); // Startup can print bootstrap credentials: never echo those.
  backend.stderr.on('data',d=>{
    const text=String(d).replaceAll(source.toString(),'[database]').replaceAll(isolated.toString(),'[isolated database]');
    if(!/password|credential|postgres:\/\//i.test(text))console.error(text.trim());
  });
  }
  launchBackend();
  if(finalRelease)process.on('SIGUSR2',async()=>{
    if(backend.exitCode===null&&backend.signalCode===null)return;
    launchBackend();
    environment.backendPid=backend.pid;
    await writeFile(`${base}/environment.json`,JSON.stringify(environment,null,2));
    console.log('Owned audit backend restarted under the same code-only profile');
  });
  for(let attempt=0;attempt<120;attempt++){
    if(backend.exitCode!==null)throw Error('Isolated backend exited during startup');
    try{const response=await fetch(`http://127.0.0.1:${apiPort}/api/auth/me`);if(response.status===401 || response.ok)break;}catch{}
    if(attempt===119)throw Error('Isolated backend did not start');
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  const proxy=Object.fromEntries(['/api','/assets','/uploads'].map(path=>[path,{target:`http://127.0.0.1:${apiPort}`,changeOrigin:true}]));
  if(emptyFixture && !salesStock){
    const result=await target.query(`SELECT
      COALESCE((SELECT SUM(remaining_quantity) FROM stock_batches),0)+
      COALESCE((SELECT SUM(quantity) FROM branch_inventory_batches),0) AS qty`);
    if(Number(result.rows[0].qty)!==0)throw Error('Empty UI fixture was unexpectedly seeded with stock');
  }
  frontend=await createServer({server:{host:'0.0.0.0',port:uiPort,strictPort:true,allowedHosts:true,proxy}});
  await frontend.listen();
  environment={
    disposable:true,frontend:`http://127.0.0.1:${uiPort}`,backendPort:apiPort,
    isolatedDatabase:name,harnessPid:process.pid,backendPid:backend.pid,...(authFile?{authFile}:{}),
    product:'TEST-ITEM',branchA:'townshop',branchB:'swakopmund',
    baseline:salesStock?{warehouse:0,branchA:10,branchB:0,company:10,returned:0,writeOff:0}:emptyFixture?{warehouse:0,branchA:0,branchB:0,company:0,returned:0,writeOff:0}:{warehouse:50,branchA:23,branchB:20,company:93,returned:2,writeOff:1}
  };
  await writeFile(`${base}/environment.json`,JSON.stringify(environment,null,2));
  console.log(`ISOLATED STOCK UI READY: port ${uiPort} — backend ${apiPort} — synthetic TEST-ITEM only`);
}catch(error){
  console.error(error.message.replaceAll(source.toString(),'[database]').replaceAll(isolated.toString(),'[isolated database]'));
  await clean();process.exitCode=1;
}
