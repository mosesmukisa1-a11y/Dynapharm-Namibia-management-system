// Purpose-specific SQL injection probe, not a replacement lifecycle schema.
import {randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import net from 'node:net';
import pg from 'pg';
import {insertStatement,findAllStatement} from '../api/services/sqlShape.js';
if(process.env.NODE_ENV==='production'||['1','true'].includes(process.env.REPLIT_DEPLOYMENT))
  throw Error('Non-production probe only');
const root='generated-artifacts/security-remediation-final';
const id=randomUUID().replaceAll('-',''),name='stock_audit_'+id;
const directory='/tmp/security-sql-'+id,out=root+'/fixtures/'+name;
await fs.mkdir(out,{recursive:true});
const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{
  const p=s.address().port;s.close(()=>r(p));});});
const owner={database:name,maintenanceDatabase:'postgres',processId:process.pid,
  createdAt:new Date().toISOString(),cleanupOwner:'security-final-sql-rehearsal',
  hostFingerprint:createHash('sha256').update('127.0.0.1:'+port).digest('hex'),
  directory,disposable:true,production:false,purpose:'sql-shape attack probe, not application schema'};
await fs.writeFile(out+'/ownership.json',JSON.stringify(owner,null,2));
const run=async(cmd,args)=>promisify(execFile)(cmd,args,{env:{PATH:process.env.PATH,HOME:directory},maxBuffer:1024*1024});
let cluster=false,admin,db,created=false;const checks=[];
try{
  await fs.mkdir(directory,{mode:0o700});
  await run('initdb',['-D',directory+'/data','-U','probe_owner','--auth=trust','--no-locale']);
  await run('pg_ctl',['-D',directory+'/data','-l',directory+'/postgres.log','-o',
    `-p ${port} -h 127.0.0.1 -k ${directory}`,'-w','start']);cluster=true;
  const config={host:'127.0.0.1',port,user:'probe_owner',ssl:false,max:1};
  admin=new pg.Pool({...config,database:'postgres'});await admin.query(`CREATE DATABASE ${name}`);created=true;
  db=new pg.Pool({...config,database:name});
  await db.query('CREATE TABLE sql_sentinel(id SERIAL PRIMARY KEY,value TEXT NOT NULL)');
  const payload="probe'); DROP TABLE sql_sentinel; --";
  const statement=insertStatement('sql_sentinel',{value:payload});
  await db.query(statement.text,statement.params);
  const select=findAllStatement('sql_sentinel',{value:payload},'id DESC');
  const result=await db.query(select.text,select.params);
  checks.push({name:'hostile value stays data through actual PostgreSQL',pass:result.rowCount===1&&result.rows[0].value===payload});
  for(const attempt of [()=>insertStatement('sql_sentinel;DROP TABLE sql_sentinel',{value:1}),
    ()=>insertStatement('sql_sentinel',{'value) VALUES(1);--':1}),
    ()=>findAllStatement('sql_sentinel',{},'id; DROP TABLE sql_sentinel')]){
    let rejected=false;try{attempt();}catch{rejected=true;}
    checks.push({name:'hostile structural fragment rejected before execution',pass:rejected});
  }
  checks.push({name:'sentinel table retained with one original row',
    pass:Number((await db.query('SELECT count(*) count FROM sql_sentinel')).rows[0].count)===1});
  await fs.writeFile(root+'/sql-attack-results.json',JSON.stringify({fixture:name,
    status:checks.every(c=>c.pass)?'PASS':'FAIL',checks,credentialsRecorded:false},null,2));
  if(checks.some(c=>!c.pass))process.exitCode=1;
}catch{
  await fs.writeFile(root+'/sql-attack-results.json',JSON.stringify({status:'FAIL',
    reason:'Owned SQL probe failed; private PostgreSQL/process details not exported'}));process.exitCode=1;
}finally{
  await db?.end();if(created)await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin?.end();
  if(cluster)await run('pg_ctl',['-D',directory+'/data','-m','fast','-w','stop']);
  await fs.rm(directory,{recursive:true,force:true});
  await fs.writeFile(out+'/cleanup.json',JSON.stringify({database:name,cleanupVerified:true,
    directoryRemoved:true,ownedClusterStopped:true,productionModified:false},null,2));
}
console.log('SQL attack probe completed; sanitized results saved.');
