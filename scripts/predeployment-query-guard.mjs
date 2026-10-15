// Preload only in owned rehearsal children. Never use on a real deployment.
import pg from 'pg';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {assertIsolatedTestDatabase} from '../api/testDatabaseGuard.js';
assertIsolatedTestDatabase();
const own=process.env.PREDEPLOY_OWNED_ROOT,metricsFile=process.env.PREDEPLOY_METRICS;
if(!own||!metricsFile||!metricsFile.startsWith(own+'/'))throw Error('Owned metrics path required');
const metrics={queries:0,rejected:[],intervalAttempts:0,filesystemAttempts:[],queryHashes:[]};
const originalQuery=pg.Client.prototype.query,write=fs.writeFileSync.bind(fs);
pg.Client.prototype.query=function(...args){
  const sql=String(args[0]?.text??args[0]??'');metrics.queries++;
  metrics.queryHashes.push(createHash('sha256').update(sql).digest('hex'));
  if(!/^\s*(SELECT|WITH)\b/i.test(sql)||/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+|ALTER\s+|DROP\s+|TRUNCATE\s+|nextval\s*\(|setval\s*\(|pg_notify\s*\(|pg_(?:try_)?advisory)/i.test(sql)){
    metrics.rejected.push({kind:'non-allowlisted SQL',hash:metrics.queryHashes.at(-1)});
    throw Error('Owned rehearsal rejected a non-read-only SQL attempt');
  }
  return originalQuery.apply(this,args);
};
globalThis.setInterval=()=>{metrics.intervalAttempts++;throw Error('Owned rehearsal forbids intervals');};
for(const name of ['writeFileSync','writeFile','mkdirSync','mkdir','unlinkSync','unlink','appendFileSync','appendFile'])
  fs[name]=(...args)=>{metrics.filesystemAttempts.push({operation:name});throw Error('Owned rehearsal forbids application filesystem mutations');};
process.on('exit',()=>write(metricsFile,JSON.stringify({...metrics,queryHashes:[...new Set(metrics.queryHashes)]},null,2)));
