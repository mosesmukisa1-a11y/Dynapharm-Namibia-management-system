// Syntax and SQL fail-closed test on an owned empty primary; no business DDL.
import fs from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import net from 'node:net';
import pg from 'pg';
import {finalManagedSql,finalScopeBindings} from './lib/final-managed-schema-query.mjs';
if(process.env.NODE_ENV==='production'||['true','1'].includes(process.env.REPLIT_DEPLOYMENT))throw Error('Local syntax test only');
const out='generated-artifacts/production-schema-metadata-final';
const id=randomUUID(),directory='/tmp/final-schema-syntax-'+id;
await fs.mkdir(out,{recursive:true});
const port=await new Promise(r=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{
  const p=server.address().port;server.close(()=>r(p));});});
const owner={id,directory,createdAt:new Date().toISOString(),processId:process.pid,disposable:true,
  hostFingerprint:createHash('sha256').update('127.0.0.1:'+port).digest('hex'),
  database:'postgres',databaseOrigin:'initdb-owned empty database; not a shared project target'};
await fs.writeFile(out+'/local-syntax-ownership.json',JSON.stringify(owner,null,2));
const command=(bin,args)=>promisify(execFile)(bin,args,{env:{PATH:process.env.PATH,HOME:directory},maxBuffer:1024*1024});
let cluster=false,client;
try{
  await fs.mkdir(directory,{mode:0o700});
  await command('initdb',['-D',directory+'/data','-U','local_schema_probe','--auth=trust','--no-locale']);
  await command('pg_ctl',['-D',directory+'/data','-l',directory+'/postgres.log','-o',
    `-p ${port} -h 127.0.0.1 -k ${directory}`,'-w','start']);cluster=true;
  client=new pg.Client({host:'127.0.0.1',port,database:'postgres',user:'local_schema_probe',password:'',
    ssl:false,connectionTimeoutMillis:4000,query_timeout:10000});await client.connect();
  const result=await client.query(finalManagedSql,finalScopeBindings(randomUUID()));
  const snapshot=result.rows[0]?.authorized_schema_snapshot;
  const pass=result.rowCount===1&&snapshot?.guardPassed===false&&snapshot.objects?.length===0;
  await fs.writeFile(out+'/local-syntax-result.json',JSON.stringify({status:pass?'PASS':'FAIL',
    sqlSha256:createHash('sha256').update(finalManagedSql).digest('hex'),
    guardFalseReturnsNoMetadata:pass,businessObjectsCreated:false,productionOperations:0},null,2));
  if(!pass)process.exitCode=1;
}catch(error){
  await fs.writeFile(out+'/local-syntax-result.json',JSON.stringify({status:'FAIL',
    code:/^[A-Z0-9]{5}$/.test(error.code||'')?error.code:'LOCAL_TEST_ERROR',position:error.position||null,
    sqlSha256:createHash('sha256').update(finalManagedSql).digest('hex'),productionOperations:0},null,2));process.exitCode=1;
}finally{
  await client?.end();
  if(cluster)await command('pg_ctl',['-D',directory+'/data','-m','fast','-w','stop']);
  await fs.rm(directory,{recursive:true,force:true});
  await fs.writeFile(out+'/local-syntax-cleanup.json',JSON.stringify({ownedId:id,
    clusterStopped:true,directoryRemoved:true,productionModified:false},null,2));
}
console.log('Owned empty-primary syntax/guard test completed; sanitized result saved.');
