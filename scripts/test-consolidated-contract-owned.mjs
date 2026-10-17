import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import net from 'node:net';
import assert from 'node:assert/strict';
import pg from 'pg';
import {consolidatedSql,consolidatedParams} from './lib/consolidated-schema-query.mjs';
import {schemaDigest} from './lib/consolidated-contract.mjs';
import {splitPostgresStatements} from './lib/repository-ddl.mjs';
if(process.env.NODE_ENV==='production'||['true','1'].includes(process.env.REPLIT_DEPLOYMENT))throw Error('Owned test only');
const id=randomUUID(),directory='/tmp/consolidated-schema-contract-'+id;
const base='generated-artifacts/security-release-gate-final',out=base+'/schema-contract-runs/'+id;
await fs.mkdir(out,{recursive:true});
const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
await fs.writeFile(out+'/ownership.json',JSON.stringify({id,directory,port,createdAt:new Date().toISOString(),
  production:false,purpose:'Canonical captured schema contract, no production clone'},null,2));
const run=(bin,args)=>promisify(execFile)(bin,args,{env:{PATH:process.env.PATH,HOME:directory},maxBuffer:1024*1024});
const contract=JSON.parse(await fs.readFile('tests/fixtures/consolidated-schema-contract.json','utf8'));
// Explicit private loopback client only. This local false-guard replacement is
// never written into the immutable production definition or passed to a service.
const localSql=consolidatedSql.replace(
  "(pg_catalog.current_setting('transaction_read_only')='on'\n     AND pg_catalog.pg_is_in_recovery()=true) AS allowed",
  'true AS allowed');
assert.notEqual(localSql,consolidatedSql);
const cases=[];let client,started=false,result;
try{
  await fs.mkdir(directory,{mode:0o700});
  await run('initdb',['-D',directory+'/data','-U','owned_consolidated','--auth=trust','--no-locale']);
  await run('pg_ctl',['-D',directory+'/data','-l',directory+'/postgres.log','-o',`-p ${port} -h 127.0.0.1 -k ${directory}`,'-w','start']);started=true;
  client=new pg.Client({host:'127.0.0.1',port,user:'owned_consolidated',password:'',database:'postgres',ssl:false});
  await client.connect();
  const migration=await fs.readFile('migrations/040_canonical_consolidated_schema.sql','utf8');
  let prior;
  for(let pass=1;pass<=2;pass++){
    await client.query(migration);
    if(pass===1){
      const stockMigration=await fs.readFile('migrations/010_create_stock_management_tables.sql','utf8');
      const barcode=splitPostgresStatements(stockMigration).find(s=>/CREATE TABLE IF NOT EXISTS barcode_batch_events\s*\(/i.test(s));
      assert(barcode);await client.query(barcode);
    }
    const metadata=(await client.query(localSql,consolidatedParams)).rows[0].evidence;
    await fs.writeFile(out+'/actual-pass-'+pass+'.json',JSON.stringify(metadata,null,2));
    for(const t of metadata.tables)cases.push({name:t.table+' exact schema pass '+pass,pass:schemaDigest(t)===contract.tables[t.table]});
    for(const f of metadata.functions)cases.push({name:f.schema+'.'+f.name+' exact function pass '+pass,pass:schemaDigest(f)===contract.functions[f.schema+'.'+f.name]});
    assert.equal(metadata.functions.length,Object.keys(contract.functions).length);
    const digest=schemaDigest({tables:metadata.tables,functions:metadata.functions});
    if(prior)cases.push({name:'second application identical schema',pass:prior===digest});prior=digest;
  }
  assert(cases.every(c=>c.pass),'Exact captured contract mismatch');
  const before=(await client.query(`INSERT INTO hr_leave_requests(employee_name,start_date,end_date)
    VALUES('Synthetic sequence probe','2026-10-17','2026-10-17') RETURNING id`)).rows[0].id;
  await client.query(migration);
  const after=(await client.query(`INSERT INTO hr_leave_requests(employee_name,start_date,end_date)
    VALUES('Synthetic sequence probe','2026-10-17','2026-10-17') RETURNING id`)).rows[0].id;
  cases.push({name:'repeat does not reset owned sequence or delete prior row',pass:after===before+1
    &&Number((await client.query('SELECT count(*) AS n FROM hr_leave_requests')).rows[0].n)===2});
  assert(cases.every(c=>c.pass));
  result={status:'PASS',cases,productionOperations:0};
}catch(e){result={status:'FAIL',code:e.code||'ASSERTION',cases,productionOperations:0};process.exitCode=1;}
finally{
  await client?.end();if(started)await run('pg_ctl',['-D',directory+'/data','-m','fast','-w','stop']);
  await fs.rm(directory,{recursive:true,force:true});
  await fs.writeFile(out+'/cleanup.json',JSON.stringify({id,clusterStopped:true,directoryRemoved:true},null,2));
}
await fs.writeFile(out+'/results.json',JSON.stringify(result,null,2));
await fs.writeFile(base+'/consolidated-contract-results.json',JSON.stringify({...result,runId:id},null,2));
console.log(JSON.stringify({status:result.status,checks:cases.length,failed:cases.filter(c=>!c.pass).map(c=>c.name)}));
