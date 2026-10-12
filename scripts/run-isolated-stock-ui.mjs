import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import {createServer} from 'vite';
import {assertIsolatedTestDatabase} from '../api/testDatabaseGuard.js';

if(process.env.REPLIT_DEPLOYMENT==='1' || !process.env.DATABASE_URL)throw Error('Disposable development environment required');
const source=new URL(process.env.DATABASE_URL),name=`stock_audit_${randomUUID().replaceAll('-','')}`;
const isolated=new URL(source);isolated.pathname=`/${name}`;isolated.search='';isolated.hash='';
// Disposable sessions must never be valid on the business application.
const auditAuthKey=randomBytes(48).toString('hex');
const navigationAudit=process.argv.includes('--navigation');
const lifecycleAudit=process.argv.includes('--lifecycle');
const continuation=process.argv.includes('--continuation');
const release=process.argv.includes('--release-audit');
const apiPort=release?3006:continuation?3005:lifecycleAudit?3004:navigationAudit?3003:3002;
const uiPort=release?5177:continuation?5176:lifecycleAudit?5175:navigationAudit?5174:5173;
const env={...process.env,DATABASE_URL:isolated.toString(),STOCK_AUDIT_ISOLATED:'1',
  STOCK_AUDIT_DATABASE:name,STOCK_AUDIT_UI_FIXTURE:'1',NODE_ENV:'test',REPLIT_DEPLOYMENT:'',
  AUTH_SECRET:auditAuthKey,JWT_SECRET:auditAuthKey,SESSION_SECRET:auditAuthKey,
  PORT:String(apiPort),DATABASE_SSL:new pg.Client({connectionString:source.toString()}).connectionParameters.ssl?'1':'0'};
assertIsolatedTestDatabase(env);
const admin=new pg.Pool({connectionString:source.toString(),max:1});
let target,backend,frontend,created=false,cleaning=false;
const base=release?'generated-artifacts/stock-release-verification':continuation?'generated-artifacts/stock-continuation-stages':lifecycleAudit?'generated-artifacts/stock-lifecycle-stages':navigationAudit?'generated-artifacts/stock-navigation-audit':'generated-artifacts/stock-ui-verification';
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
  if(!emptyFixture)await run('npx',['vitest','run','tests/stock-lifecycle-end-to-end.spec.js','--project=database',
    '-t','runs the requested 100-unit','--reporter=json',`--outputFile=${base}/fixture-results.json`]);
  if(emptyFixture) {
    // Reference catalogue only; every physical unit is entered by staff in the audit.
    await target.query(`INSERT INTO products(id,sku,name,unit,dp,cp,is_active)
      VALUES('ISOLATED-TEST-ITEM','TEST-ITEM','TEST-ITEM','unit',7,9,true)`);
    await target.query(`INSERT INTO product_prices(description,product_code,dp,cp,cif,bv,updated_by)
      VALUES('TEST-ITEM','TEST-ITEM',7,9,2,0,'isolated-audit-fixture')`);
  }
  const passwordHash=await bcrypt.hash('DisposableStockUi-2026!',10);
  for(const [id,username,role,branch] of [
    ['UI-BRANCH-A','ui_branch_a','branch_manager','townshop'],
    ['UI-BRANCH-B','ui_branch_b','branch_manager','swakopmund'],
    ['UI-STOCK','ui_stock','stock',null],['UI-GM','ui_gm','gm',null]]){
    await target.query(`INSERT INTO users(id,username,password_hash,role,full_name,branch,
      is_active,must_change_password,metadata) VALUES($1,$2,$3,$4,$5,$6,true,false,'{"disposable_ui_audit":true}')`,
      [id,username,passwordHash,role,username,branch]);
  }
  backend=spawn('node',['server.js'],{env,stdio:['ignore','pipe','pipe']});
  backend.stdout.on('data',()=>{}); // Startup can print bootstrap credentials: never echo those.
  backend.stderr.on('data',d=>{
    const text=String(d).replaceAll(source.toString(),'[database]').replaceAll(isolated.toString(),'[isolated database]');
    if(!/password|credential|postgres:\/\//i.test(text))console.error(text.trim());
  });
  for(let attempt=0;attempt<120;attempt++){
    if(backend.exitCode!==null)throw Error('Isolated backend exited during startup');
    try{const response=await fetch(`http://127.0.0.1:${apiPort}/api/auth/me`);if(response.status===401 || response.ok)break;}catch{}
    if(attempt===119)throw Error('Isolated backend did not start');
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  const proxy=Object.fromEntries(['/api','/assets','/uploads'].map(path=>[path,{target:`http://127.0.0.1:${apiPort}`,changeOrigin:true}]));
  if(emptyFixture){
    const result=await target.query(`SELECT
      COALESCE((SELECT SUM(remaining_quantity) FROM stock_batches),0)+
      COALESCE((SELECT SUM(quantity) FROM branch_inventory_batches),0) AS qty`);
    if(Number(result.rows[0].qty)!==0)throw Error('Empty UI fixture was unexpectedly seeded with stock');
  }
  frontend=await createServer({server:{host:'0.0.0.0',port:uiPort,strictPort:true,allowedHosts:true,proxy}});
  await frontend.listen();
  await writeFile(`${base}/environment.json`,JSON.stringify({
    disposable:true,frontend:`http://127.0.0.1:${uiPort}`,backendPort:apiPort,
    isolatedDatabase:name,harnessPid:process.pid,
    product:'TEST-ITEM',branchA:'townshop',branchB:'swakopmund',
    baseline:emptyFixture?{warehouse:0,branchA:0,branchB:0,company:0,returned:0,writeOff:0}:{warehouse:50,branchA:23,branchB:20,company:93,returned:2,writeOff:1}
  },null,2));
  console.log(`ISOLATED STOCK UI READY: port ${uiPort} — backend ${apiPort} — synthetic TEST-ITEM only`);
}catch(error){
  console.error(error.message.replaceAll(source.toString(),'[database]').replaceAll(isolated.toString(),'[isolated database]'));
  await clean();process.exitCode=1;
}
