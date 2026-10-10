import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import pg from 'pg';

// Never copy data, run on production, persist credentials, or display URLs.
if(process.env.REPLIT_DEPLOYMENT==='1')throw Error('Stock audit cannot run in production');
if(!process.env.DATABASE_URL)throw Error('Development database configuration is required');
const sourceUrl=new URL(process.env.DATABASE_URL);
const name=`stock_audit_${randomUUID().replaceAll('-','')}`;
const isolatedUrl=new URL(sourceUrl);isolatedUrl.pathname=`/${name}`;
if(!/^stock_audit_[a-f0-9]{32}$/.test(name) || sourceUrl.pathname===isolatedUrl.pathname)
  throw Error('Unsafe isolated database identifier');
const admin=new pg.Pool({connectionString:sourceUrl.toString(),max:1});
let created=false,target;
async function child(command,args,{env=process.env,input,capture=false}={}){
  return new Promise((resolve,reject)=>{
    const process=spawn(command,args,{env,stdio:['pipe',capture?'pipe':'inherit','pipe']});
    let output='',errors='';
    process.stdout?.on('data',data=>{output+=data;});
    process.stderr.on('data',data=>{errors+=data;});
    process.on('error',reject);
    process.on('close',code=>{
      // Do not leak connection strings in tool errors.
      errors=errors.split(sourceUrl.toString()).join('[database]').split(isolatedUrl.toString()).join('[isolated database]');
      if(code!==0)reject(Error(`${command} exited ${code}: ${errors.slice(-2000)}`));
      else{if(errors)console.error(errors);resolve(output);}
    });
    process.stdin.end(input);
  });
}
const stockSuites=[
  'tests/stock-lifecycle-end-to-end.spec.js',
  'tests/stock-safety-atomic.spec.js',
  'tests/stock-cost-lifecycle.spec.js',
  'tests/stock-cost-audit.spec.js',
  'tests/stock-cost-projection-sharing.spec.js',
  'tests/controlled-stock.spec.js',
  'tests/controlled-stock-register.spec.js',
  'tests/linked-reversals.spec.js',
  'tests/historical-refund-evidence.spec.js',
  'tests/transfer-b2b-receipt-increases-dest-balance.spec.js',
  'tests/branch-receipt-inventory-balance.spec.js',
  'tests/dispatch-note-cancellation.spec.js',
  'tests/transfer-cancel-voids-movements.spec.js',
  'tests/transfer-dispatch-cancel-concurrency.spec.js',
];
try{
  await admin.query(`CREATE DATABASE ${name}`);created=true;
  console.log('Created separate empty stock audit database; business data is not copied.');
  const schema=await child('pg_dump',['--dbname',sourceUrl.toString(),'--schema-only','--no-owner','--no-privileges'],{
    capture:true});
  await child('psql',['--dbname',isolatedUrl.toString(),'--quiet','--set','ON_ERROR_STOP=1'],{
    input:schema,capture:true});
  target=new pg.Pool({connectionString:isolatedUrl.toString(),max:1});
  await target.query(`INSERT INTO warehouse_locations(id,name,type)
    VALUES('windhoek_warehouse','Isolated warehouse','warehouse'),
      ('ondangwa_warehouse','Isolated second warehouse','warehouse')`);
  await mkdir('generated-artifacts/stock-audit',{recursive:true});
  await child('npx',['vitest','run',...(process.argv.slice(2).length?process.argv.slice(2):stockSuites),
    '--fileParallelism=false','--reporter=default','--reporter=json',
    '--outputFile=generated-artifacts/stock-audit/test-results.json'],{
    env:{...process.env,DATABASE_URL:isolatedUrl.toString(),
      STOCK_AUDIT_ISOLATED:'1',STOCK_AUDIT_DATABASE:name,REPLIT_DEPLOYMENT:'',NODE_ENV:'test'}});
}catch(error){
  console.error(error.message);process.exitCode=1;
}finally{
  await target?.end();
  if(created){
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    console.log('Removed isolated audit database; original business database was not changed.');
  }
  await admin.end();
}
