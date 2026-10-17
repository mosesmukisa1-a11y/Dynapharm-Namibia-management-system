import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import net from 'node:net';
import assert from 'node:assert/strict';
import pg from 'pg';
import {consolidatedSql,consolidatedParams} from './lib/consolidated-schema-query.mjs';
if(process.env.NODE_ENV==='production'||['true','1'].includes(process.env.REPLIT_DEPLOYMENT))throw Error('Owned test only');
const id=randomUUID(),directory='/tmp/consolidated-schema-syntax-'+id;
const out='generated-artifacts/production-schema-consolidated-final/local-syntax/'+id;
await fs.mkdir(out,{recursive:true});
const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
await fs.writeFile(out+'/ownership.json',JSON.stringify({id,directory,port,createdAt:new Date().toISOString(),
  production:false,purpose:'Empty owned cluster syntax/false-guard test, no business fixtures'},null,2));
const run=(bin,args)=>promisify(execFile)(bin,args,{env:{PATH:process.env.PATH,HOME:directory},maxBuffer:1024*1024});
let client,started=false;
try{
  await fs.mkdir(directory,{mode:0o700});
  await run('initdb',['-D',directory+'/data','-U','owned_syntax','--auth=trust','--no-locale']);
  await run('pg_ctl',['-D',directory+'/data','-l',directory+'/postgres.log','-o',`-p ${port} -h 127.0.0.1 -k ${directory}`,'-w','start']);started=true;
  client=new pg.Client({host:'127.0.0.1',port,user:'owned_syntax',password:'',database:'postgres',ssl:false});
  await client.connect();
  const {rows}=await client.query(consolidatedSql,consolidatedParams);
  assert.equal(rows[0].evidence.guard.allowed,false);
  assert.deepEqual(rows[0].evidence.tables,[]);assert.deepEqual(rows[0].evidence.functions,[]);
  assert.deepEqual(rows[0].evidence.dependencies,[]);
  await fs.writeFile(out+'/result.json',JSON.stringify({status:'PASS',syntaxValid:true,
    falseGuardReturnsNoMetadata:true,productionOperations:0},null,2));
}catch(e){
  await fs.writeFile(out+'/result.json',JSON.stringify({status:'FAIL',code:e.code||'ASSERTION',
    reason:'Owned syntax/guard execution failed'},null,2));process.exitCode=1;
}finally{
  await client?.end();if(started)await run('pg_ctl',['-D',directory+'/data','-m','fast','-w','stop']);
  await fs.rm(directory,{recursive:true,force:true});
  await fs.writeFile(out+'/cleanup.json',JSON.stringify({id,clusterStopped:true,directoryRemoved:true},null,2));
}
console.log('Owned consolidated-query syntax and guard check finished.');
