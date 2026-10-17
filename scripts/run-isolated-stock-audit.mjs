import {randomUUID, randomBytes, createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {assertIsolatedTestDatabase} from '../api/testDatabaseGuard.js';
import {stockAuditSuites,databaseSuites} from '../tests/helpers/database-suites.js';

// Never copy data, run on production, persist credentials, or display URLs.
if(process.env.REPLIT_DEPLOYMENT==='1')throw Error('Stock audit cannot run in production');
if(!process.env.DATABASE_URL)throw Error('Development database configuration is required');
const sourceUrl=new URL(process.env.DATABASE_URL);
if(!['helium','localhost','127.0.0.1','[::1]'].includes(sourceUrl.hostname))
  throw Error('Isolated audit provisioning requires a known local development host');
const name=`stock_audit_${randomUUID().replaceAll('-','')}`;
const isolatedUrl=new URL(sourceUrl);isolatedUrl.pathname=`/${name}`;
// URL query parameters can override pg connection identity.
isolatedUrl.search='';isolatedUrl.hash='';
if(!/^stock_audit_[a-f0-9]{32}$/.test(name) || sourceUrl.pathname===isolatedUrl.pathname)
  throw Error('Unsafe isolated database identifier');
const testEnv={...process.env,DATABASE_URL:isolatedUrl.toString(),
  STOCK_AUDIT_ISOLATED:'1',STOCK_AUDIT_DATABASE:name,REPLIT_DEPLOYMENT:'0',NODE_ENV:'test',
  // Match pg's source transport rather than guessing SSL from the hostname.
  DATABASE_SSL:new pg.Client({connectionString:sourceUrl.toString()}).connectionParameters.ssl?'1':'0'};
// Real login tests must not sign disposable sessions with a business key.
const testAuthKey = randomBytes(48).toString('hex');
Object.assign(testEnv, {AUTH_SECRET:testAuthKey, JWT_SECRET:testAuthKey, SESSION_SECRET:testAuthKey});
assertIsolatedTestDatabase(testEnv);
const args=process.argv.slice(2);
const all=args.includes('--all');
const filters=args.filter(arg=>arg!=='--all');
const suites=filters.length?filters:all?databaseSuites:stockAuditSuites;
const admin=new pg.Pool({connectionString:sourceUrl.toString(),max:1});
async function recordOwnership(database, purpose) {
  if (!process.env.SECURITY_FIXTURE_OWNERSHIP_DIR) return;
  const dir=process.env.SECURITY_FIXTURE_OWNERSHIP_DIR;
  await mkdir(dir,{recursive:true});
  await writeFile(`${dir}/${database}.json`,JSON.stringify({
    database,purpose,hostFingerprint:createHash('sha256').update(sourceUrl.hostname+':'+sourceUrl.port).digest('hex'),
    processId:process.pid,createdAt:new Date().toISOString(),cleanupOwner:'run-isolated-stock-audit',
    disposable:true,production:false,cleanupVerified:false},null,2));
}
async function recordCleanup(database) {
  if (!process.env.SECURITY_FIXTURE_OWNERSHIP_DIR) return;
  const file=`${process.env.SECURITY_FIXTURE_OWNERSHIP_DIR}/${database}.json`;
  const record=JSON.parse(await readFile(file,'utf8'));
  await writeFile(file,JSON.stringify({...record,cleanupVerified:true,cleanedAt:new Date().toISOString()},null,2));
}
let created=false,target,combinedWritten=false;
async function child(command,args,{env=process.env,input,capture=false}={}){
  return new Promise((resolve,reject)=>{
    const process=spawn(command,args,{env,stdio:['pipe',capture?'pipe':'inherit','pipe']});
    let output='',errors='';
    process.stdout?.on('data',data=>{output+=data;});
    process.stderr.on('data',data=>{errors+=data;});
    process.on('error',reject);
    process.on('close',code=>{
      // Do not leak connection strings in tool errors.
      errors=errors.split(sourceUrl.toString()).join('[database]').split(isolatedUrl.toString()).join('[isolated database]')
        .replace(/postgres(?:ql)?:\/\/\S+/g,'[database URI]');
      if(code!==0)reject(Error(`${command} exited ${code}: ${errors.slice(-16000)}`));
      else{if(errors)console.error(errors);resolve(output);}
    });
    process.stdin.end(input);
  });
}
try{
  await recordOwnership(name,'owned template');
  await admin.query(`CREATE DATABASE ${name}`);created=true;
  console.log('Created separate empty stock audit database; business data is not copied.');
  const schema=await child('pg_dump',['--dbname',sourceUrl.toString(),'--schema-only','--no-owner','--no-privileges'],{
    capture:true});
  await child('psql',['--dbname',isolatedUrl.toString(),'--quiet','--set','ON_ERROR_STOP=1'],{
    input:schema,capture:true});
  target=new pg.Pool({connectionString:isolatedUrl.toString(),max:1});
  await target.query(await readFile('migrations/033_sale_evidence.sql','utf8'));
  await target.query(await readFile('migrations/034_stock_worker_journal.sql','utf8'));
  await target.query(await readFile('migrations/035_manual_price_control.sql','utf8'));
  await target.query(`INSERT INTO warehouse_locations(id,name,type)
    VALUES('windhoek_warehouse','Isolated warehouse','warehouse'),
      ('ondangwa_warehouse','Isolated second warehouse','warehouse')`);
  await mkdir('generated-artifacts/stock-audit',{recursive:true});
  if(!all){
    await child(process.execPath,['node_modules/vitest/vitest.mjs','run',...suites, '--project=database',
      '--fileParallelism=false','--reporter=default','--reporter=json',
      '--outputFile=generated-artifacts/stock-audit/test-results.json'],{env:testEnv});
  }else{
    // Each suite gets an independent empty-schema template clone. Serial execution
    // alone does not isolate a whole-company baseline from another suite's rows.
    // Client close acknowledgement is not proof that PostgreSQL has finished
    // removing its backend. Block new connections and wait for server-side drain
    // on this exact owned template only; never terminate development sessions.
    await admin.query(`ALTER DATABASE ${name} ALLOW_CONNECTIONS false`);
    await target.end();target=null;
    const drained=await admin.query(`SELECT pg_terminate_backend(pid,5000) AS stopped
      FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`,[name]);
    if(drained.rows.some(r=>!r.stopped))throw Error('Owned template backend did not drain');
    const results=[],startedAt=Date.now();let failed=0;
    for(let index=0;index<suites.length;index++){
      const owned=`stock_audit_${randomUUID().replaceAll('-','')}`;
      const suiteUrl=new URL(isolatedUrl);suiteUrl.pathname='/'+owned;
      const output=`generated-artifacts/stock-audit/${owned}.json`;
      await recordOwnership(owned,'owned suite '+suites[index]);
      await admin.query(`CREATE DATABASE ${owned} TEMPLATE ${name}`);
      try{
        await child(process.execPath,['node_modules/vitest/vitest.mjs','run',suites[index],'--project=database','--fileParallelism=false',
          '--reporter=default','--reporter=json','--outputFile='+output],{
          env:{...testEnv,DATABASE_URL:suiteUrl.toString(),STOCK_AUDIT_DATABASE:owned}});
      }catch(error){failed++;console.error(error.message);}
      finally{
        try{results.push(JSON.parse(await readFile(output,'utf8')));}
        catch{results.push({numTotalTests:0,numPassedTests:0,numFailedTests:1,numPendingTests:0,testResults:[],
          suiteFailure:{suite:suites[index],reason:'Runner did not produce a result'}});failed++;}
        await admin.query(`DROP DATABASE ${owned} WITH (FORCE)`);
        await admin.query(`DROP ROLE IF EXISTS ${owned.replace(/^stock_audit_/,'worker_audit_')}`);
        await recordCleanup(owned);
      }
    }
    const sum=key=>results.reduce((n,r)=>n+(r[key]||0),0);
    const combined={isolation:'one owned database per suite',startTime:startedAt,
      numTotalTests:sum('numTotalTests'),numPassedTests:sum('numPassedTests'),
      numFailedTests:sum('numFailedTests'),numPendingTests:sum('numPendingTests'),success:failed===0,
      testResults:results.flatMap(r=>r.testResults),suiteFailures:results.filter(r=>r.suiteFailure).map(r=>r.suiteFailure)};
    await writeFile('generated-artifacts/stock-audit/test-results.json',JSON.stringify(combined,null,2));
    combinedWritten=true;
    console.log(`Isolated full suite: ${combined.numPassedTests}/${combined.numTotalTests} passed; ${combined.numFailedTests} failed; ${combined.numPendingTests} pending`);
    if(failed)process.exitCode=1;
  }
}catch(error){
  const message=error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[database URI]');
  console.error(message);process.exitCode=1;
  if(all&&!combinedWritten){
    await mkdir('generated-artifacts/stock-audit',{recursive:true});
    await writeFile('generated-artifacts/stock-audit/test-results.json',JSON.stringify({
      success:false,harnessFailure:message,numTotalTests:0,numPassedTests:0,numFailedTests:0,
      numPendingTests:0,testResults:[],note:'No complete suite result; never reuse a previous JSON artifact'},null,2));
  }
}finally{
  await target?.end();
  if(created){
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    // Only the derived role for this exact owned fixture can be cleaned.
    const workerRole=name.replace(/^stock_audit_/,'worker_audit_');
    if(!/^worker_audit_[a-f0-9]{32}$/.test(workerRole))throw Error('Unsafe worker test role');
    await admin.query(`DROP ROLE IF EXISTS ${workerRole}`);
    await recordCleanup(name);
    console.log('Removed isolated audit database; original business database was not changed.');
  }
  await admin.end();
}
