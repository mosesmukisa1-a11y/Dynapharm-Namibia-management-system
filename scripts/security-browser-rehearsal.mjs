// Disposable, local schema-only browser fixture. Never copies business data.
import {randomBytes, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, readFile, rm, mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import {TASKS} from '../worker/tasks.mjs';
if (process.env.NODE_ENV === 'production' || ['1','true'].includes(process.env.REPLIT_DEPLOYMENT))
  throw Error('Production fixture execution refused');
const source = new URL(process.env.DATABASE_URL);
if (!['helium','localhost','127.0.0.1','[::1]'].includes(source.hostname))
  throw Error('Fixture requires known local development host');
const name='stock_audit_'+randomUUID().replaceAll('-','');
const url=new URL(source);url.pathname='/'+name;url.search='';url.hash='';
const root=process.cwd(), temp=await mkdtemp(path.join(os.tmpdir(),'security-browser-'));
const out='generated-artifacts/security-remediation';
await mkdir(out,{recursive:true});
await writeFile(out+'/browser-fixture-owner.json',JSON.stringify({database:name,parentPid:process.pid,
  localHostVerified:true,production:false},null,2));
const admin=new pg.Pool({connectionString:source.toString(),max:1});
let db, server, created=false, cleaning=false;
function command(cmd,args,input){
  return new Promise((resolve,reject)=>{
    const child=spawn(cmd,args,{stdio:['pipe','pipe','pipe']});
    let output='';child.stdout.on('data',x=>{output+=x;});
    child.stderr.resume();
    child.on('error',()=>reject(Error('Fixture subprocess failed; details withheld')));
    child.on('exit',code=>code===0?resolve(output):reject(Error('Fixture subprocess failed; details withheld')));
    child.stdin.end(input);
  });
}
async function cleanup(){
  if(cleaning)return;cleaning=true;
  if(server && server.exitCode === null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
  await db?.end();
  if(created)await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
  await admin.end();await rm(temp,{recursive:true,force:true});
  await rm(out+'/browser-private.json',{force:true});
  await writeFile(out+'/browser-cleanup.json',JSON.stringify({isolatedDatabaseDropped:true,
    temporaryCredentialsDeleted:true,childStopped:true,productionModified:false},null,2));
}
process.once('SIGTERM',()=>cleanup().then(()=>process.exit(0)));
process.once('SIGINT',()=>cleanup().then(()=>process.exit(0)));
try{
  await admin.query(`CREATE DATABASE ${name}`);created=true;
  const schema=await command('pg_dump',['--dbname',source.toString(),'--schema-only','--no-owner','--no-privileges']);
  if (/CREATE (?:FOREIGN TABLE|SERVER|USER MAPPING)|dblink|postgres_fdw/i.test(schema))
    throw Error('External schema refused');
  await command('psql',['--dbname',url.toString(),'--quiet','--set','ON_ERROR_STOP=1'],schema);
  db=new pg.Pool({connectionString:url.toString(),max:1});
  // Fixture-only additive setup; never delegated to web startup or production.
  for (const migration of ['033_sale_evidence.sql','034_stock_worker_journal.sql','035_manual_price_control.sql'])
    await db.query(await readFile(path.join(root,'migrations',migration),'utf8'));
  const password=randomBytes(24).toString('base64url'), secret=randomBytes(48).toString('hex');
  for(const [id,role,forced] of [['SECURITY-BROWSER-USER','consultant',true],['SECURITY-BROWSER-ADMIN','admin',false]]){
    await db.query(`INSERT INTO users(id,username,password_hash,role,full_name,branch,is_active,
      must_change_password,metadata) VALUES($1,$2,$3,$4,'Synthetic security account','townshop',true,$5,'{}')`,
      [id,id.toLowerCase(),await bcrypt.hash(password,12),role,forced]);
  }
  const entry=path.join(temp,'entry.mjs');
  await writeFile(entry,`await import(${JSON.stringify(path.join(root,'scripts/start-code-only-web.mjs'))});
    const {server}=await import(${JSON.stringify(path.join(root,'server.js'))});
    if(!server.listening)await new Promise(r=>server.once('listening',r));
    console.log('SECURITY_PORT:'+server.address().port);
    process.on('SIGTERM',async()=>{server.closeAllConnections?.();server.close();
      const db=await import(${JSON.stringify(path.join(root,'api/db.js'))});
      await db.closePool();process.exit(0);});`);
  server=spawn(process.execPath,[entry],{cwd:root,env:{...process.env,DATABASE_URL:url.toString(),
    DATABASE_SSL:new pg.Client({connectionString:source.toString()}).connectionParameters.ssl?'1':'0',
    STOCK_AUDIT_ISOLATED:'1',STOCK_AUDIT_DATABASE:name,NODE_ENV:'test',REPLIT_DEPLOYMENT:'0',
    AUTH_SECRET:secret,JWT_SECRET:secret,SESSION_SECRET:secret,
    HOST:'127.0.0.1',PORT:'0',STARTUP_MODE:'code-only',ALLOW_SCHEMA_SYNC:'false',
    ALLOW_REFERENCE_SEEDS:'false',ALLOW_INVENTORY_SEED:'false',ALLOW_STOCK_SUMMARY_DDL:'false',
    ENABLE_STOCK_SCHEDULER:'false',ENABLE_STOCK_HEALTH_DIGEST:'false',WORKER_ENABLED:'false',
    ...Object.fromEntries(TASKS.map(t=>[t.flag,'false']))},stdio:['ignore','pipe','pipe']});
  let logs='',ready=false;
  server.stdout.on('data',async chunk=>{
    logs+=chunk;
    const match=logs.match(/SECURITY_PORT:(\d+)/);
    if(match&&!ready){
      ready=true;
      await writeFile(out+'/browser-private.json',JSON.stringify({baseUrl:'http://127.0.0.1:'+match[1],
        username:'security-browser-user',adminUsername:'security-browser-admin',password}),{mode:0o600});
      await writeFile(out+'/startup-rehearsal.json',JSON.stringify({
        strictLauncher:true,isolated:true,accountsCreatedByFixture:2,productionModified:false,
        startupSkips:logs.split('\n').filter(l=>l.includes('startup.operation.skipped')).map(l=>JSON.parse(l)),
        applicationLogContainsCredentialValues:logs.includes(password)||logs.includes(secret),
        ready:true},null,2));
      console.log('Isolated security browser fixture ready; private connection file prepared without displaying credentials.');
    }
  });
  server.stderr.on('data',()=>{}); // Do not expose database errors or fixture credentials.
  server.once('exit',()=>{if(!cleaning){console.error('Isolated server exited');cleanup().then(()=>process.exit(1));}});
}catch{
  await cleanup();console.error('Isolated fixture failed; no private values emitted');process.exitCode=1;
}
