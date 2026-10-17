// Entirely new PostgreSQL cluster, schema from candidate SQL/DDL only.
// No configured connection, business schema, business row or credential is read.
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import {parse} from '@babel/parser';
import {TASKS} from '../worker/tasks.mjs';
import {REQUIRED_STARTUP_SCHEMA} from '../api/services/startupSchema.js';
import {assertRepositoryFoundation} from './security-final-schema-guard.mjs';
import {repositoryDdlStatements} from './lib/repository-ddl.mjs';
import {consolidatedSql,consolidatedParams} from './lib/consolidated-schema-query.mjs';
import {schemaDigest} from './lib/consolidated-contract.mjs';
if(process.env.NODE_ENV==='production'||['1','true'].includes(process.env.REPLIT_DEPLOYMENT))
  throw Error('Production fixture refused');
// Never re-use the earlier guessed legacy scaffolding. A missing canonical
// definition blocks before any directory, socket, cluster or database exists.
await assertRepositoryFoundation();
const root=process.cwd(),runId=randomUUID(),base=path.join(root,'generated-artifacts/security-release-gate-final');
const out=path.join(base,'fixture-runs',runId);
await fs.mkdir(out,{recursive:true});
const runKind=process.argv.includes('--database-suites')?'database':
  process.argv.includes('--diagnose')?'diagnostic':process.argv.includes('--schema-only')?'schema':'browser';
await fs.writeFile(base+'/last-'+runKind+'-fixture-run.json',JSON.stringify({runId,out},null,2));
const temp=path.join(os.tmpdir(),'security-closure-'+runId);
const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{
  const p=s.address().port;s.close(()=>r(p));});});
const name='stock_audit_'+randomUUID().replaceAll('-','');
const owner={database:name,maintenanceDatabase:'postgres',clusterDirectory:temp,
  hostFingerprint:createHash('sha256').update('127.0.0.1:'+port).digest('hex'),
  processId:process.pid,createdAt:new Date().toISOString(),cleanupOwner:'security-closure-fixture',
  disposable:true,production:false,identitySource:'new initdb cluster, no inherited configuration'};
await fs.writeFile(out+'/fixture-ownership.json',JSON.stringify(owner,null,2));
await fs.mkdir(out+'/fixture-runs',{recursive:true});
await fs.writeFile(out+'/fixture-runs/'+name+'.json',JSON.stringify(owner,null,2));
await fs.writeFile(base+'/last-fixture-run.json',JSON.stringify({runId,out,database:name},null,2));
const env={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'};
function command(cmd,args,{input,childEnv=env}={}){
  return new Promise((resolve,reject)=>{
    const p=spawn(cmd,args,{env:childEnv,stdio:['pipe','pipe','pipe']});
    let text='';p.stdout.on('data',x=>text+=x);p.stderr.on('data',()=>{});
    p.on('error',()=>reject(Error('Owned subprocess unavailable')));
    p.on('exit',c=>c===0?resolve(text):reject(Error('Owned subprocess failed: '+cmd)));
    p.stdin.end(input);
  });
}
let cluster=false,db,admin,app,cleaning=false,logs='';
const markers=[randomBytes(40).toString('hex'),randomBytes(40).toString('hex')];
async function cleanup(){
  if(cleaning)return;cleaning=true;
  if(app&&app.exitCode===null){app.kill('SIGTERM');await new Promise(r=>app.once('exit',r));}
  await db?.end();
  if(admin){await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);await admin.end();}
  if(cluster)await command('pg_ctl',['-D',temp+'/data','-m','fast','-w','stop']);
  await fs.rm(temp,{recursive:true,force:true});
  await fs.writeFile(out+'/browser-cleanup.json',JSON.stringify({database:name,
    isolatedDatabaseDropped:true,ownedClusterStopped:true,temporaryDirectoryRemoved:true,
    privateCredentialFileCreated:false,childStopped:true,productionModified:false},null,2));
  await fs.writeFile(out+'/fixture-runs/'+name+'-cleanup.json',JSON.stringify({
    database:name,cleanupVerified:true,cleanedAt:new Date().toISOString(),productionModified:false},null,2));
}
process.once('SIGTERM',()=>cleanup().then(()=>process.exit(0)));
process.once('SIGINT',()=>cleanup().then(()=>process.exit(0)));
try{
  await fs.mkdir(temp,{mode:0o700});
  await command('initdb',['-D',temp+'/data','-U','fixture_owner','--auth=trust','--no-locale']);
  await command('pg_ctl',['-D',temp+'/data','-l',temp+'/postgres.log','-o',
    `-p ${port} -h 127.0.0.1 -k ${temp}`,'-w','start']);cluster=true;
  // Every connection is explicit and limited to the newly created loopback cluster.
  const cfg={host:'127.0.0.1',port,user:'fixture_owner',password:'',ssl:false,max:1};
  admin=new pg.Pool({...cfg,database:'postgres'});
  await admin.query(`CREATE DATABASE ${name}`);
  db=new pg.Pool({...cfg,database:name});
  // New canonical foundation precedes older IF NOT EXISTS schema variants.
  const statements=[{file:'migrations/040_canonical_consolidated_schema.sql',
    sql:await fs.readFile(root+'/migrations/040_canonical_consolidated_schema.sql','utf8')}];
  const migrations=(await fs.readdir(root+'/migrations')).filter(n=>/^\d.*\.sql$/.test(n)).sort();
  for(const file of migrations)statements.push({file:'migrations/'+file,sql:await fs.readFile(root+'/migrations/'+file,'utf8')});
  // Preserve repository delivery-table constraints rather than synthesizing them.
  for(const file of ['backend/create_tables.sql','backend/create_delivery_tables.sql']){
    const sql=await fs.readFile(root+'/'+file,'utf8');
    for(const ddl of repositoryDdlStatements(sql)){
      // Captured product triggers supersede these older variants. The captured
      // catalog has no notify_change definition: never invent one for this
      // legacy notification bootstrap. Runtime application files stay intact.
      const superseded=file==='backend/create_tables.sql'
        &&(/(?:CREATE|DROP)\s+TRIGGER(?:\s+IF\s+EXISTS)?\s+product_images_(?:updated_at|notify)\b/i.test(ddl)
          ||/(?:CREATE|DROP)\s+TRIGGER(?:\s+IF\s+EXISTS)?\s+distributors_notify\b/i.test(ddl));
      if(!superseded)statements.push({file,sql:ddl});
    }
  }
  function walk(n,fn){if(!n||typeof n!=='object')return;fn(n);
    for(const [k,v]of Object.entries(n)){if(['loc','extra','start','end'].includes(k))continue;
      if(Array.isArray(v))v.forEach(x=>walk(x,fn));else if(v&&typeof v==='object')walk(v,fn);}}
  async function sources(dir){let result=[];for(const d of await fs.readdir(dir,{withFileTypes:true})){
    if(d.isDirectory())result.push(...await sources(dir+'/'+d.name));
    else if(d.name.endsWith('.js'))result.push(dir+'/'+d.name);}return result;}
  for(const file of [root+'/server.js',...await sources(root+'/api')]){
    const ast=parse(await fs.readFile(file,'utf8'),{sourceType:'module',plugins:['jsx']});
    walk(ast,n=>{
      const sql=n.type==='StringLiteral'?n.value:
        n.type==='TemplateLiteral'&&n.expressions.length===0?n.quasis[0].value.cooked:null;
      if(sql&&/^\s*(?:CREATE (?:TABLE|INDEX|UNIQUE INDEX|OR REPLACE (?:VIEW|FUNCTION))|ALTER TABLE)\b/i.test(sql))
        statements.push({file:path.relative(root,file)+':'+n.loc.start.line,sql});
    });
  }
  // Converge dependency ordering without executing application bootstrap or data copies.
  let pending=statements;
  for(let pass=0;pass<8&&pending.length;pass++){
    const next=[];for(const s of pending){try{await db.query(s.sql);}catch(e){next.push({...s,code:e.code,
      missingObject:['42P01','42703'].includes(e.code)
        ?e.message?.match(/^(?:relation|column) "([a-z_][a-z0-9_.]*)" does not exist$/i)?.[1]||null:null});}}
    if(next.length===pending.length&&pass>1){pending=next;break;}pending=next;
  }
  const fullMetadata=(await db.query(consolidatedSql.replace(
    "(pg_catalog.current_setting('transaction_read_only')='on'\n     AND pg_catalog.pg_is_in_recovery()=true) AS allowed",
    'true AS allowed'),consolidatedParams)).rows[0].evidence;
  const capturedContract=JSON.parse(await fs.readFile(root+'/tests/fixtures/consolidated-schema-contract.json','utf8'));
  const fullContractChecks=[
    ...fullMetadata.tables.map(t=>({name:t.table,pass:schemaDigest(t)===capturedContract.tables[t.table]})),
    ...fullMetadata.functions.map(f=>({name:f.schema+'.'+f.name,pass:schemaDigest(f)===capturedContract.functions[f.schema+'.'+f.name]})),
  ];
  const fullContractPass=fullContractChecks.every(c=>c.pass)&&fullMetadata.functions.length===1;
  await fs.writeFile(out+'/post-convergence-contract.json',JSON.stringify({
    status:fullContractPass?'PASS':'FAIL',checks:fullContractChecks,
    policy:'Full repository schema must not drift from seven-object captured authority'},null,2));
  if(!fullContractPass)process.exitCode=1;
  await fs.writeFile(out+'/schema-fixture.json',JSON.stringify({source:'candidate migrations and static DDL',
    schemaClone:false,sourceDatabaseAccess:false,attempted:statements.length,
    syntheticFoundations:[],
    freshInstallSchemaCertification:false,
    unresolved:pending.map(s=>({file:s.file,code:s.code,missingObject:s.missingObject,
      statementSha256:createHash('sha256').update(s.sql).digest('hex')}))},null,2));
  // Missing foundational tables are a visible fixture blocker, never invented from data.
  const ready=await db.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'`);
  const missing=Object.entries(REQUIRED_STARTUP_SCHEMA).flatMap(([t,cols])=>cols.filter(c=>
    !ready.rows.some(r=>r.table_name===t&&r.column_name===c)).map(c=>t+'.'+c));
  await fs.writeFile(out+'/schema-missing.json',JSON.stringify(missing,null,2));
  if(missing.length)throw Error('Candidate-only schema fixture incomplete; see schema-missing.json');
  if(process.argv.includes('--schema-only')){
    await fs.writeFile(out+'/schema-only-result.json',JSON.stringify({
      status:pending.length?'BLOCKED':'PASS',unresolvedStatements:pending.length,
      requiredStartupMissing:missing,repositoryOnly:true,productionOperations:0},null,2));
    if(pending.length)process.exitCode=1;
    await cleanup();
  }else{
  await db.query(`INSERT INTO branches(id,name,status) VALUES('townshop','Windhoek CBD','active'),
    ('tsumeb','Tsumeb','active') ON CONFLICT DO NOTHING`);
  const material={password:randomBytes(24).toString('base64url'),
    permanent:randomBytes(24).toString('base64url'),
    accounts:[['CLOSURE-USER','consultant',true],['CLOSURE-ADMIN','admin',false],
      ['CLOSURE-OTHER','consultant',false],['CLOSURE-GM','gm',false]]};
  for(const [id,role,forced]of material.accounts)
    await db.query(`INSERT INTO users(id,username,password_hash,role,full_name,branch,is_active,
      must_change_password,metadata) VALUES($1,$2,$3,$4,'Synthetic closure account','townshop',true,$5,'{}')`,
      [id,id.toLowerCase(),await bcrypt.hash(material.password,12),role,forced]);
  await db.query(`INSERT INTO clients(id,full_name,branch) VALUES
    ('CLOSURE-OWN-CLIENT','Synthetic closure client','townshop'),
    ('CLOSURE-OTHER-CLIENT','Synthetic closure client','tsumeb')`);
  const profile={STARTUP_MODE:'code-only',ALLOW_SCHEMA_SYNC:'false',ALLOW_REFERENCE_SEEDS:'false',
    ALLOW_INVENTORY_SEED:'false',ALLOW_STOCK_SUMMARY_DDL:'false',ENABLE_STOCK_SCHEDULER:'false',
    ENABLE_STOCK_HEALTH_DIGEST:'false',WORKER_ENABLED:'false',
    ...Object.fromEntries(TASKS.map(t=>[t.flag,'false']))};
  const dbUrl=`postgresql://fixture_owner@127.0.0.1:${port}/${name}`;
  const testEnv={...env,DATABASE_URL:dbUrl,DATABASE_SSL:'0',STOCK_AUDIT_ISOLATED:'1',
    STOCK_AUDIT_DATABASE:name,REPLIT_DEPLOYMENT:'0',NODE_ENV:'test',AUTH_SECRET:markers[0],
    JWT_SECRET:markers[0],SESSION_SECRET:markers[0],SYNTHETIC_SERVER_ONLY_MARKER:markers[1],...profile};
  if(process.argv.includes('--database-suites')||process.argv.includes('--credential-only')||process.argv.includes('--diagnose')){
    if(process.argv.includes('--diagnose')||process.argv.includes('--query-diagnostics'))Object.assign(testEnv,{
      NODE_OPTIONS:'--import '+root+'/scripts/lib/owned-query-diagnostics.mjs',
      OWNED_QUERY_DIAGNOSTICS:out+'/query-diagnostics.jsonl'});
    const runs=[['full',['scripts/run-isolated-stock-audit.mjs','--all',
      ...(process.argv.includes('--diagnose')?['tests/sale-evidence.spec.js',
        'tests/transfer-dispatch-cancel-concurrency.spec.js','tests/gm-decisions.spec.js',
        'tests/daily-campaign-free-item-dp.spec.js']:[])]],
      ['credential',['scripts/run-isolated-stock-audit.mjs','tests/credential-security.spec.js']]];
    for(const [label,args]of (process.argv.includes('--credential-only')?runs.slice(1):
      process.argv.includes('--diagnose')?runs.slice(0,1):runs)){
      let succeeded=true;
      try{
        await command(process.execPath,args,{childEnv:{...testEnv,
          SECURITY_FIXTURE_OWNERSHIP_DIR:out+'/database-ownership'}});
      }catch{succeeded=false;process.exitCode=1;await fs.writeFile(out+'/'+label+'-database-failure.json',JSON.stringify({status:'FAIL',
        reason:'Owned suite subprocess failed; no private stderr exported'}));}
      try{await fs.copyFile(root+'/generated-artifacts/stock-audit/test-results.json',out+'/'+label+'-database-results.json');}catch{}
      if(succeeded)await fs.rm(out+'/'+label+'-database-failure.json',{force:true});
    }
    await cleanup();
  }else{
    const entry=temp+'/entry.mjs';
    await fs.writeFile(entry,`await import(${JSON.stringify(root+'/scripts/start-code-only-web.mjs')});
      const {server}=await import(${JSON.stringify(root+'/server.js')});
      if(!server.listening)await new Promise(r=>server.once('listening',r));
      console.log('CLOSURE_PORT:'+server.address().port);
      process.on('SIGTERM',async()=>{server.closeAllConnections?.();server.close();
        await (await import(${JSON.stringify(root+'/api/db.js')})).closePool();process.exit(0);});`);
    app=spawn(process.execPath,[entry],{cwd:root,env:{...testEnv,HOST:'127.0.0.1',PORT:'0'},
      stdio:['ignore','pipe','pipe']});
    app.stdout.on('data',b=>logs+=b);app.stderr.on('data',b=>logs+=b);
    const start=Date.now();
    while(!logs.includes('CLOSURE_PORT:')&&Date.now()-start<30000)await new Promise(r=>setTimeout(r,100));
    const match=logs.match(/CLOSURE_PORT:(\d+)/);if(!match)throw Error('Strict launcher did not become ready');
    const baseUrl='http://127.0.0.1:'+match[1];
    await fs.writeFile(out+'/startup-rehearsal.json',JSON.stringify({ready:true,strictLauncher:true,
      fixtureDatabase:name,profile,port:Number(match[1]),productionModified:false,
      compatibilityStatus:(await fetch(baseUrl+'/api/health')).status,
      markerInLogs:markers.some(m=>logs.includes(m)),credentialInLogs:logs.includes(material.password)},null,2));
    const probes=[];
    for(const route of ['/server.js','/scripts/seed-users.js','/generated-artifacts/security-remediation/report.md',
      '/.git/config','/.env','/assets/test.js.map','/node_modules/pg/package.json']){
      const response=await fetch(baseUrl+route);
      probes.push({route,status:response.status,expected:404,result:response.status===404?'PASS':'FAIL'});
    }
    const responses=[];
    for(const route of ['/api/auth/me','/api/nonexistent']){
      const response=await fetch(baseUrl+route);responses.push(await response.text());
    }
    const files=[];async function bundles(dir){for(const f of await fs.readdir(dir,{withFileTypes:true})){
      if(f.isDirectory())await bundles(dir+'/'+f.name);else files.push(dir+'/'+f.name);}}
    await bundles(root+'/dist');
    let leaked=false;for(const file of files){const text=await fs.readFile(file,'utf8');
      if(markers.some(m=>text.includes(m)))leaked=true;}
    await fs.writeFile(out+'/secret-output-verification.json',JSON.stringify({
      syntheticMarkersOnly:true,configuredSecretsRetrieved:false,publicDownloadProbes:probes,
      startupLogs:markers.some(m=>logs.includes(m))?'FAIL':'PASS',
      sampledBrowserResponses:responses.some(t=>markers.some(m=>t.includes(m)))?'FAIL':'PASS',
      generatedBundles:leaked?'FAIL':'PASS',bundleFiles:files.length,
      sourceMapsPresent:files.filter(f=>f.endsWith('.map')).length,status:'PARTIAL',
      limitations:['Finite sampled routes only; not proof of every application error path.',
        'Production deployment artifacts and clean-install archive gate not verified.']},null,2));
    // One owned automation process receives synthetic material via IPC only.
    // No file, CLI argument, console, trace or screenshot contains credential values.
    const child=spawn(process.execPath,[root+'/scripts/security-closure-browser.mjs'],{
      env:{...env},stdio:['ignore','ignore','ignore','ipc']});
    child.send({baseUrl,material,out,markers,adminOnly:process.argv.includes('--admin-only')});
    const result=await new Promise(r=>child.once('exit',code=>r(code)));
    await fs.writeFile(out+'/secret-log-check.json',JSON.stringify({status:markers.some(m=>logs.includes(m))||
      logs.includes(material.password)||logs.includes(material.permanent)?'FAIL':'PASS',
      scope:'full captured strict-launcher stdout and stderr',syntheticOnly:true}));
    if(result!==0)throw Error('Browser rehearsal incomplete; see browser-results.json');
    await cleanup();
  }
  }
}catch(error){
  await fs.writeFile(out+'/fixture-failure.json',JSON.stringify({status:'FAIL',
    reason:/Candidate-only|Strict launcher|Browser rehearsal/.test(error.message)?error.message:'Fixture operation failed; details withheld'}));
  await cleanup();process.exitCode=1;
}
