// Review-only exports + local schema-only owned database. Never restart workflows,
// publish, run application legacy bootstrap, copy data, or write production.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
const root=process.cwd(),priorOut=path.join(root,'generated-artifacts/sales-stock-integration/predeployment');
const out=process.argv.includes('--stock-worker')
  ?path.join(root,'generated-artifacts/stock-worker/test-evidence/web-rollback-rehearsal'):priorOut;
if(process.env.REPLIT_DEPLOYMENT==='1')throw Error('Rehearsal prohibited in production');
const source=new URL(process.env.DATABASE_URL);
if(!['helium','localhost','127.0.0.1'].includes(source.hostname))throw Error('Known local development database required; remote database provisioning forbidden');
const name='stock_audit_'+randomUUID().replaceAll('-',''),url=new URL(source);
url.pathname='/'+name;url.search='';url.hash='';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'owned-predeployment-'));
const admin=new pg.Pool({connectionString:source.toString(),max:1});
let created=false,target,activeChild;
const result={startedAt:new Date().toISOString(),ownedDatabase:name,sourceDataCopied:false,
  fixture:'schema-only; no staff/business seed rows',stages:[],cleanup:false};
const hash=s=>createHash('sha256').update(s).digest('hex');
const redact=s=>String(s).replaceAll(source.toString(),'[development database]').replaceAll(url.toString(),'[owned database]')
  .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/g,'[database URI]');
async function save(){await fs.writeFile(path.join(out,'rehearsal.json'),JSON.stringify(result,null,2));}
async function command(cmd,args,{cwd=root,env=process.env,input,log}={}){
  const start=new Date().toISOString();
  const r=await new Promise((resolve,reject)=>{
    const child=spawn(cmd,args,{cwd,env,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
    child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
    child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));child.stdin.end(input);
  });
  if(log)await fs.writeFile(path.join(out,log),redact(r.stdout+r.stderr));
  if(r.code!==0)throw Error(`${cmd} failed with exit${r.code}; see ${log||'owned tool output'}`);
  return {...r,startedAt:start,finishedAt:new Date().toISOString()};
}
function pgEnv(u){const p=new pg.Client({connectionString:u.toString()}).connectionParameters;
  return {...process.env,PGHOST:p.host,PGPORT:String(p.port),PGUSER:p.user,PGPASSWORD:p.password,
    PGDATABASE:p.database,PGSSLMODE:p.ssl?'require':'disable'};}
async function snapshot(){
  const {rows:tables}=await target.query("SELECT relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY relname");
  const counts=[];let totalRows=0;
  for(const {relname}of tables){const quoted='"'+relname.replaceAll('"','""')+'"';
    const {rows:[r]}=await target.query(`SELECT COUNT(*)::text AS count,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS digest FROM public.${quoted} t`);
    counts.push({table:relname,...r});totalRows+=Number(r.count);
  }
  const {rows:columns}=await target.query("SELECT c.relname,a.attname,a.atttypid,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) AS default_expression FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum");
  const dump=await command('pg_dump',['--schema-only','--no-owner','--no-privileges'],{env:pgEnv(url)});
  // pg_dump's randomized \restrict nonce is not a schema change.
  const normalized=dump.stdout.replace(/^\\(?:un)?restrict .*$/gm,'');
  return {totalRows,tableCount:tables.length,dataHash:hash(JSON.stringify(counts)),
    columnsHash:hash(JSON.stringify(columns)),schemaHash:hash(normalized)};
}
async function exportSource(commit,dir){
  await fs.mkdir(dir);
  await new Promise((resolve,reject)=>{
    const a=spawn('git',['archive','--format=tar',commit],{cwd:root,stdio:['ignore','pipe','pipe']});
    const b=spawn('tar',['-x','-C',dir],{stdio:['pipe','ignore','pipe']});a.stdout.pipe(b.stdin);
    let statuses=[];for(const c of [a,b]){c.on('error',reject);c.on('close',code=>{statuses.push(code);if(statuses.length===2)statuses.every(v=>v===0)?resolve():reject(Error('Owned source export failed'));});}
  });
  await fs.symlink(path.join(root,'node_modules'),path.join(dir,'node_modules'),'dir');
}
try{
  await fs.mkdir(out,{recursive:true});await save();
  const rollback=JSON.parse(await fs.readFile(path.join(priorOut,'guarded-rollback.json'),'utf8'));
  const release=(await command('git',['rev-parse','HEAD'])).stdout.trim();
  const targets=[{kind:'release',commit:release},{kind:'rollback',commit:rollback.commit}];
  for(const t of targets){
    t.dir=path.join(temp,t.kind);await exportSource(t.commit,t.dir);
    const build=await command('npm',['run','build'],{cwd:t.dir,log:`${t.kind}-build.log`});
    const unit=process.argv.includes('--reuse-unit-evidence')?
      {code:0,startedAt:null,finishedAt:null,reused:'initial unchanged-source23/23; HTTP transport correction only'}:
      await command(process.execPath,['--test',path.join(root,'scripts/predeployment-startup-contract.test.mjs')],{
        cwd:t.dir,env:{...process.env,PREDEPLOY_TARGET_ROOT:t.dir},log:`${t.kind}-startup-tests.log`});
    result.stages.push({stage:`${t.kind} offline build/startup tests`,commit:t.commit,result:'PASS',
      build:{exit:build.code,startedAt:build.startedAt,finishedAt:build.finishedAt},
      unit:{exit:unit.code,startedAt:unit.startedAt,finishedAt:unit.finishedAt,reused:unit.reused}});
    await save();
  }
  const dump=await command('pg_dump',['--schema-only','--no-owner','--no-privileges'],{env:pgEnv(source)});
  if(/CREATE (?:FOREIGN TABLE|SERVER|USER MAPPING)|dblink|postgres_fdw/i.test(dump.stdout))
    throw Error('External-access schema objects refused in owned fixture');
  await admin.query(`CREATE DATABASE ${name}`);created=true;
  await command('psql',['--quiet','--set','ON_ERROR_STOP=1'],{env:pgEnv(url),input:dump.stdout});
  target=new pg.Pool({connectionString:url.toString(),max:1});
  // This setting affects this owned fixture only, before the baseline.
  await target.query(`ALTER DATABASE ${name} SET default_transaction_read_only=on`);
  const baseline=await snapshot();result.baseline=baseline;await save();
  if(baseline.totalRows!==0)throw Error('Schema-only fixture unexpectedly contains rows');
  const secret=randomBytes(48).toString('hex');
  const token=jwt.sign({sub:'owned-predeploy-admin',role:'admin',branch:'townshop',fullName:'Synthetic rehearsal'},secret,{expiresIn:'15m'});
  const allow=JSON.parse(await fs.readFile(path.join(priorOut,'safe-smoke-allowlist.json'),'utf8'));
  if(allow.globalMiddlewareIssues.length)throw Error('Unresolved global middleware; no smoke requests allowed');
  const apiPaths=['/api/health','/api/version','/api/prices','/api/stock/valuation',
    '/api/branch/inventory?branch=townshop','/api/stock/branch-batches',
    '/api/stock-movements','/api/gm/daily-sales?date=2026-10-15',
    '/api/stock/trace?search=OWNED-EMPTY','/api/stock-batches',
    '/api/gm/summary','/api/finance/summary','/api/director/summary',
    '/api/stock/current-overview','/api/stock/ai-reorder'];
  for(const p of apiPaths)if(!allow.paths.includes(p.split('?')[0]))throw Error('Requested path not statically allowlisted: '+p);
  const htmlPaths=['/branch','/finance','/gm','/director','/mis',...['aiDashboard','branchStock','inventory','batch','stockReports','costReport','valuation','reorder','barcode','trace'].map(v=>'/stock?view='+v)];
  for(const t of targets){
    const metricsFile=path.join(temp,t.kind+'-query-metrics.json'),entry=path.join(temp,t.kind+'-entry.mjs');
    await fs.writeFile(entry,`import {server} from ${JSON.stringify(path.join(t.dir,'server.js'))};\nimport * as db from ${JSON.stringify(path.join(t.dir,'api/db.js'))};\nif(!server.listening)await new Promise((r,j)=>{server.once('listening',r);server.once('error',j);});console.log('OWNED_PORT:'+server.address().port);process.on('SIGTERM',async()=>{server.closeAllConnections?.();await new Promise(r=>server.close(r));await db.closePool?.();process.exit(0);});`);
    const ssl=new pg.Client({connectionString:source.toString()}).connectionParameters.ssl;
    const env={...process.env,NODE_ENV:'test',REPLIT_DEPLOYMENT:'0',DATABASE_URL:url.toString(),
      DATABASE_SSL:ssl?'1':'0',HOST:'127.0.0.1',PORT:'0',PGOPTIONS:'-c default_transaction_read_only=on',
      STOCK_AUDIT_ISOLATED:'1',STOCK_AUDIT_DATABASE:name,AUTH_SECRET:secret,JWT_SECRET:secret,SESSION_SECRET:secret,
      AUTH_COOKIE_NAME:'owned_predeploy_session',
      STARTUP_MODE:'code-only',ALLOW_SCHEMA_SYNC:'false',ALLOW_REFERENCE_SEEDS:'false',ALLOW_INVENTORY_SEED:'false',
      ALLOW_STOCK_SUMMARY_DDL:'false',ENABLE_STOCK_SCHEDULER:'false',ENABLE_STOCK_HEALTH_DIGEST:'false',
      PREDEPLOY_OWNED_ROOT:temp,PREDEPLOY_METRICS:metricsFile};
    const child=spawn(process.execPath,['--import',path.join(root,'scripts/predeployment-query-guard.mjs'),entry],{cwd:t.dir,env,stdio:['ignore','pipe','pipe']});
    activeChild=child;let logs='',port,exit;
    const closed=new Promise(resolve=>child.on('close',code=>{exit=code;resolve(code);}));
    child.stdout.on('data',b=>{logs+=b;const m=logs.match(/OWNED_PORT:(\d+)/);if(m)port=Number(m[1]);});
    child.stderr.on('data',b=>logs+=b);
    const deadline=Date.now()+20000;while(!port&&exit===undefined&&Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
    if(!port){await fs.writeFile(path.join(out,t.kind+'-startup.log'),redact(logs));throw Error(`${t.kind} failed before owned readiness; no endpoints called`);}
    const checks=[];
    for(const p of [...apiPaths,...htmlPaths]){
      result.currentAction={kind:t.kind,method:'GET',path:p,status:null};await save();
      const started=Date.now();
      const response=await fetch('http://127.0.0.1:'+port+p,{method:'GET',redirect:'manual',headers:{Cookie:'owned_predeploy_session='+token},signal:AbortSignal.timeout(8000)});
      if(response.redirected||(response.status>=300&&response.status<400))throw Error('Owned smoke redirect refused: '+p);
      const text=await response.text();let error=null;
      if(!response.ok){try{error=JSON.parse(text).error||JSON.parse(text).message;}catch{error='Non-JSON error';}}
      checks.push({method:'GET',path:p,status:response.status,durationMs:Date.now()-started,result:response.ok?'PASS':'FAIL',
        error:response.ok?undefined:redact(error),contentType:response.headers.get('content-type'),
        ...(p==='/api/health'?{startup:JSON.parse(text).startup}:{})});
      result.currentStage={kind:t.kind,checks};await save();
    }
    child.kill('SIGTERM');await Promise.race([closed,new Promise((_,reject)=>setTimeout(()=>reject(Error('Owned child did not stop')),6000))]);
    activeChild=null;
    const metrics=JSON.parse(await fs.readFile(metricsFile,'utf8'));
    const after=await snapshot(),unchanged=JSON.stringify(after)===JSON.stringify(baseline);
    await fs.writeFile(path.join(out,t.kind+'-startup.log'),redact(logs));
    await fs.writeFile(path.join(out,t.kind+'-query-metrics.json'),JSON.stringify(metrics,null,2));
    const pass=checks.every(c=>c.result==='PASS')&&unchanged&&metrics.rejected.length===0&&metrics.intervalAttempts===0&&metrics.filesystemAttempts.length===0;
    result.stages.push({stage:t.kind+' owned HTTP rehearsal',commit:t.commit,result:pass?'PASS':'FAIL',
      session:'synthetic signed JWT, actual session middleware; no staff records/login POST',checks,
      databaseAfter:after,databaseUnchanged:unchanged,queryMetrics:metrics,childExit:exit});
    delete result.currentStage;delete result.currentAction;await save();
  }
}catch(error){result.error=redact(error.message);result.result='FAIL';process.exitCode=1;}
finally{
  if(activeChild){activeChild.kill('SIGTERM');await new Promise(r=>setTimeout(r,1500));if(activeChild.exitCode===null)activeChild.kill('SIGKILL');}
  if(result.error&&target)result.failureSnapshot=await snapshot().catch(()=>({unavailable:true}));
  await target?.end();
  if(created){await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[name]);await admin.query(`DROP DATABASE ${name}`);
    const check=await admin.query('SELECT COUNT(*)::int AS count FROM pg_database WHERE datname=$1',[name]);result.cleanup=check.rows[0].count===0;}
  await admin.end();await fs.rm(temp,{recursive:true,force:true});result.finishedAt=new Date().toISOString();
  result.result??=result.stages.every(s=>s.result==='PASS')?'PASS':'FAIL';await save();
  if(result.result!=='PASS')process.exitCode=1;
  console.log(JSON.stringify({result:result.result,stages:result.stages.map(s=>({stage:s.stage,result:s.result})),error:result.error,cleanup:result.cleanup}));
}
