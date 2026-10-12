import {readFile,writeFile} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {assertIsolatedTestDatabase} from '../api/testDatabaseGuard.js';

// Reload only the owned disposable API; preserve its UI-created test stock.
const lifecycle=process.argv.includes('--lifecycle');
const release=process.argv.includes('--release-audit');
const clientHistory=process.argv.includes('--client-history');
const port=clientHistory?3007:release?3006:lifecycle?3004:3002;
const path=clientHistory?'generated-artifacts/client-history/environment.json':release?'generated-artifacts/stock-release-verification/environment.json':lifecycle?'generated-artifacts/stock-lifecycle-stages/environment.json':'generated-artifacts/stock-ui-verification/environment.json';
const owned=JSON.parse(await readFile(path,'utf8'));
if(!owned.disposable || !/^stock_audit_[a-f0-9]{32}$/.test(owned.isolatedDatabase) || owned.backendPort!==port)
  throw Error('Untrusted isolated UI ownership manifest');
const parent=execFileSync('ps',['-ww','-p',String(owned.harnessPid),'-o','args='],{encoding:'utf8'});
if(!parent.includes('run-isolated-stock-ui.mjs'))throw Error('Owned UI harness is not running');
const source=new URL(process.env.DATABASE_URL),target=new URL(source);
target.pathname='/'+owned.isolatedDatabase;
target.search='';target.hash='';
const auth=randomBytes(48).toString('hex');
const env={...process.env,DATABASE_URL:target.toString(),NODE_ENV:'test',REPLIT_DEPLOYMENT:'',
  STOCK_AUDIT_ISOLATED:'1',STOCK_AUDIT_DATABASE:owned.isolatedDatabase,STOCK_AUDIT_UI_FIXTURE:'1',
  AUTH_SECRET:auth,JWT_SECRET:auth,SESSION_SECRET:auth,PORT:String(port),
  DATABASE_SSL:new pg.Client({connectionString:source.toString()}).connectionParameters.ssl?'1':'0'};
assertIsolatedTestDatabase(env);
const pool=new pg.Pool({connectionString:target.toString(),ssl:env.DATABASE_SSL==='1'?{rejectUnauthorized:false}:undefined});
const actors=await pool.query(`SELECT current_database() AS db,COUNT(*) AS qty FROM users WHERE metadata->>'disposable_ui_audit'='true'`);
await pool.end();
if(actors.rows[0].db!==owned.isolatedDatabase || Number(actors.rows[0].qty)!==(clientHistory?6:4))throw Error('Disposable user ownership proof missing');
const backendOwner=owned.resumedBackendHarnessPid || owned.harnessPid;
if(backendOwner!==owned.harnessPid){
  const ownerCommand=execFileSync('ps',['-ww','-p',String(backendOwner),'-o','args='],{encoding:'utf8'});
  if(!ownerCommand.includes('resume-isolated-stock-ui-backend.mjs'))throw Error('Untrusted resumed backend owner');
}
const children=execFileSync('ps',['-ww','--ppid',String(backendOwner),'-o','pid=,args='],{encoding:'utf8'})
  .split('\n').filter(line=>/node server\.js\s*$/.test(line.trim()));
if(children.length!==1)throw Error('Cannot uniquely identify owned backend');
const pid=Number(children[0].trim().split(/\s+/)[0]);
process.kill(pid,'SIGTERM');
for(let i=0;i<100;i++){
  let alive=true;try{process.kill(pid,0);}catch{alive=false;}
  if(!alive)break;
  if(i===99)throw Error('Old isolated backend did not stop');
  await new Promise(resolve=>setTimeout(resolve,100));
}
const backend=spawn('node',['server.js'],{env,stdio:['ignore','pipe','pipe']});
backend.stdout.on('data',()=>{});
backend.stderr.on('data',data=>{
  const text=String(data);
  if(!/password|credential|postgres:\/\//i.test(text))
    console.error(text.replaceAll(source.toString(),'[database]').replaceAll(target.toString(),'[isolated database]').trim());
}); // Never echo bootstrap credentials or connections.
await writeFile(path,JSON.stringify({...owned,resumedBackendHarnessPid:process.pid,backendPid:backend.pid},null,2));
const stop=()=>backend.kill('SIGTERM');
process.on('SIGTERM',stop);process.on('SIGINT',stop);
backend.on('exit',code=>process.exit(code || 0));
for(let i=0;i<120;i++){
  try{const r=await fetch(`http://127.0.0.1:${port}/api/auth/me`);if(r.status===401){console.log('Owned isolated API reloaded; preserved synthetic stock. Re-login required.');break;}}catch{}
  if(i===119)throw Error('Reloaded isolated API did not start');
  await new Promise(resolve=>setTimeout(resolve,500));
}
