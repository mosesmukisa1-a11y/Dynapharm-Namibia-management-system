// Build with synthetic environment material only; never inherit configured keys.
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
const out='generated-artifacts/sql-security-final-closure',id=randomUUID();
const markers=[randomBytes(40).toString('hex'),randomBytes(40).toString('hex')];
const digest=b=>createHash('sha256').update(b).digest('hex');
await fs.mkdir(out,{recursive:true});
await fs.writeFile(out+'/build-ownership.json',JSON.stringify({
  id,purpose:'Local production-mode bundle build; no publication',configuredSecretsInherited:false,
  output:'dist',productionModified:false,createdAt:new Date().toISOString(),
},null,2));
const result=await new Promise(resolve=>{
  let log='';
  const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','build'],{
    env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'production',
      JWT_SECRET:markers[0],SESSION_SECRET:markers[0],SYNTHETIC_SERVER_ONLY_MARKER:markers[1]},
    stdio:['ignore','pipe','pipe'],
  });
  child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});
  child.once('error',()=>resolve({code:1,log:'Build process could not start'}));
  child.once('close',code=>resolve({code,log}));
});
const files=[];
async function walk(dir){
  for(const f of await fs.readdir(dir,{withFileTypes:true})){
    if(f.isDirectory())await walk(dir+'/'+f.name);
    else{
      const bytes=await fs.readFile(dir+'/'+f.name);
      files.push({file:dir+'/'+f.name,sha256:digest(bytes),bytes:bytes.length,
        markerPresent:markers.some(m=>bytes.includes(Buffer.from(m)))});
    }
  }
}
if(result.code===0)await walk('dist');
const report={
  id,status:result.code===0&&!files.some(f=>f.markerPresent)?'PASS':'FAIL',exitCode:result.code,
  command:'node node_modules/vite/bin/vite.js build (synthetic-only child environment)',
  configuredSecretsRetrieved:false,syntheticMarkersPersisted:false,publicationAttempted:false,
  outputHash:digest(result.log),syntheticMarkerInOutput:markers.some(m=>result.log.includes(m)),
  sourceMaps:files.filter(f=>f.file.endsWith('.map')).length,files,
};
if(report.syntheticMarkerInOutput)report.status='FAIL';
await fs.writeFile(out+'/build-results.json',JSON.stringify(report,null,2)+'\n');
console.log('Private build '+report.status+'; provider/publication calls: 0.');
process.exitCode=report.status==='PASS'?0:1;
