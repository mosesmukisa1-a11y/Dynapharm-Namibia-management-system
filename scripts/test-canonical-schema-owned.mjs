// Only reviewed repository sources; never invent the redacted activity defaults.
import fs from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import net from 'node:net';
import pg from 'pg';
import {querySpec} from './lib/production-schema-policy.mjs';
if(process.env.NODE_ENV==='production'||['true','1'].includes(process.env.REPLIT_DEPLOYMENT))throw Error('Disposable tests only');
const out='generated-artifacts/sql-security-final-closure/canonical-contract';
await fs.mkdir(out,{recursive:true});
const id=randomUUID(),directory='/tmp/canonical-schema-'+id;
const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{
  const p=s.address().port;s.close(()=>r(p));});});
const owner={id,directory,createdAt:new Date().toISOString(),processId:process.pid,
  hostFingerprint:createHash('sha256').update('127.0.0.1:'+port).digest('hex'),
  businessFixtureSource:'repository migrations only; no hand-created business tables'};
await fs.writeFile(out+'/contract-ownership.json',JSON.stringify(owner,null,2));
await fs.mkdir(out+'/contract-runs',{recursive:true});
await fs.writeFile(out+'/contract-runs/'+id+'.json',JSON.stringify(owner,null,2));
const command=(bin,args)=>promisify(execFile)(bin,args,{env:{PATH:process.env.PATH,HOME:directory},maxBuffer:1024*1024});
const contract=JSON.parse(await fs.readFile('tests/fixtures/canonical-schema-contract.json','utf8'));
const migrations=['migrations/036_canonical_branches.sql','migrations/037_canonical_branch_distributor_profit.sql',
  'migrations/038_canonical_users_additional_roles.sql','migrations/039_canonical_branch_activity_transactions.sql'];
const cases=[];
let cluster=false,client;
try{
  await fs.mkdir(directory,{mode:0o700});
  await command('initdb',['-D',directory+'/data','-U','local_contract_probe','--auth=trust','--no-locale']);
  await command('pg_ctl',['-D',directory+'/data','-l',directory+'/postgres.log','-o',
    `-p ${port} -h 127.0.0.1 -k ${directory}`,'-w','start']);cluster=true;
  client=new pg.Client({host:'127.0.0.1',port,user:'local_contract_probe',password:'',database:'postgres',
    ssl:false,connectionTimeoutMillis:4000,query_timeout:10000});await client.connect();
  await client.query(await fs.readFile('migrations/004_create_users_table.sql','utf8'));
  let previous;
  for(let pass=1;pass<=2;pass++){
    for(const file of migrations)await client.query(await fs.readFile(file,'utf8'));
    const snapshot=[];
    for(const object of contract.objects){
      const values=['public',object.table,object.columnScope];
      const columns=await client.query(`SELECT a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,
        NOT a.attnotnull AS nullable,pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default,
        a.attidentity,a.attgenerated
        FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class t ON t.oid=a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
        LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
        WHERE n.nspname=$1 AND t.relname=$2 AND a.attnum>0 AND NOT a.attisdropped
        AND ($3::text IS NULL OR a.attname=$3) ORDER BY a.attnum`,values);
      assert.deepEqual(columns.rows.map(c=>[c.attname,c.type,c.nullable,c.default]),object.columns);
      assert(columns.rows.every(c=>c.attidentity===''&&c.attgenerated===''),
        'Captured columns have no identity/generated behavior');
      const relation=await client.query(`SELECT t.relkind,t.relispartition
        FROM pg_catalog.pg_class t JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname=$1 AND t.relname=$2`,values.slice(0,2));
      assert.deepEqual(relation.rows,[{relkind:'r',relispartition:false}]);
      const constraints=await client.query(querySpec('constraints',{schema:'public',table:object.table,
        column:object.columnScope}).text,values);
      const definitions=constraints.rows.map(c=>[c.name,c.definition]).sort();
      assert.deepEqual(definitions,object.constraints.toSorted());
      assert(constraints.rows.every(c=>!c.condeferrable&&!c.condeferred&&c.convalidated));
      const indexes=await client.query(querySpec('indexes',{schema:'public',table:object.table,
        column:object.columnScope}).text,values);
      assert.deepEqual(indexes.rows.map(i=>i.definition).sort(),object.indexes.toSorted());
      assert(indexes.rows.every(i=>i.indisvalid&&i.predicate===null));
      snapshot.push({table:object.table,columns:columns.rows,constraints:constraints.rows,indexes:indexes.rows});
      cases.push({name:object.table+' contract pass '+pass,status:'PASS'});
    }
    if(pass===2)assert.deepEqual(snapshot,previous);
    previous=snapshot;
  }
  cases.push({name:'Second migration application leaves scoped schema unchanged',status:'PASS'});
}catch(error){cases.push({name:'Contract execution',status:'FAIL',
  code:error.code||'ASSERTION_FAILED',message:error.code==='ERR_ASSERTION'?'Captured contract differs from migrated result':'Private database operation failed'});process.exitCode=1;}
finally{
  await client?.end();if(cluster)await command('pg_ctl',['-D',directory+'/data','-m','fast','-w','stop']);
  await fs.rm(directory,{recursive:true,force:true});
  await fs.writeFile(out+'/contract-cleanup.json',JSON.stringify({ownedId:id,clusterStopped:true,
    directoryRemoved:true,historicalCandidatesInspected:0,historicalCandidatesDeleted:0},null,2));
  await fs.writeFile(out+'/contract-results.json',JSON.stringify({status:cases.every(x=>x.status==='PASS')?'PASS':'FAIL',
    completeFoundation:contract.provenance.completeFoundation,activityDefaultsBlocked:contract.provenance.blockedDefaults,
    tests:cases,productionOperations:0},null,2));
  await fs.writeFile(out+'/contract-runs/'+id+'-cleanup.json',JSON.stringify({
    id,clusterStopped:true,directoryRemoved:true},null,2));
}
console.log('Scoped canonical migration contracts and idempotency completed; sanitized results saved.');
