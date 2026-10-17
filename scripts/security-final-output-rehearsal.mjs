// Isolated HTTP component check using the actual public static boundary.
// It is NOT authenticated application workflow or strict-launcher proof.
import fs from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import express from 'express';
import {publicAssetBoundary} from '../api/services/publicAssetPolicy.js';
const out='generated-artifacts/security-remediation-final';
await fs.mkdir(out,{recursive:true});
const temp='/tmp/security-output-'+randomUUID(),marker=randomBytes(40).toString('hex');
await fs.mkdir(temp,{mode:0o700});
const routes=['/server.js','/scripts/tool.js','/generated-artifacts/report.md','/.git/config',
  '/.env','/assets/canary.js.map'];
const checks=[];let server;
try{
  for(const route of routes){const file=temp+route;await fs.mkdir(file.slice(0,file.lastIndexOf('/')),{recursive:true});
    await fs.writeFile(file,route.endsWith('.map')?'{"version":3,"sources":[],"mappings":""}':'harmless synthetic file');}
  const app=express();app.use(publicAssetBoundary);
  app.use(express.static(temp,{dotfiles:'allow'}));app.use((req,res)=>res.status(500).json({error:'Synthetic operation failed'}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;
  for(const route of routes){
    const response=await fetch(base+route);
    checks.push({name:'public denial',route,fixtureFileExists:true,status:response.status,
      pass:response.status===404,markerExposed:(await response.text()).includes(marker)});
  }
  const error=await fetch(base+'/synthetic-error');
  checks.push({name:'component HTTP error response',status:error.status,pass:!(await error.text()).includes(marker)});
  // Run the real production build with server-only synthetic markers and no
  // inherited secret/configuration environment. Never emit or retain raw output.
  const build=await new Promise(resolve=>{
    const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','build'],{
      env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'production',
        SYNTHETIC_SERVER_ONLY_CANARY:marker},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',b=>{output+=b.toString();});
    child.stderr.on('data',b=>{output+=b.toString();});
    child.once('error',()=>resolve({exitCode:null,markerSeen:false}));
    child.once('exit',exitCode=>resolve({exitCode,markerSeen:output.includes(marker)}));
  });
  const scanned=[];async function scan(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const file=dir+'/'+entry.name;if(entry.isDirectory())await scan(file);else{
      const text=await fs.readFile(file,'utf8');scanned.push({file,markerPresent:text.includes(marker)});}}}
  await scan('dist');
  const reports=[];for(const file of await fs.readdir(out))if(/\.(?:json|md)$/.test(file)){
    const text=await fs.readFile(out+'/'+file,'utf8');reports.push({file,markerPresent:text.includes(marker)});}
  await fs.writeFile(out+'/secret-output-verification.json',JSON.stringify({
    status:'PARTIAL',syntheticOnly:true,configuredSecretsRetrieved:false,
    httpChecks:checks,build,buildFiles:scanned,reportsChecked:reports,
    generatedSourceMaps:scanned.filter(f=>f.file.endsWith('.map')).length,
    realSourceMapCanaryDenied:checks.find(c=>c.route.endsWith('.map'))?.pass,
    fullApplicationStartupLogs:'BLOCKED: canonical application schema unavailable',
    fullApplicationLogs:'NOT VERIFIED across every handler',
    authenticatedBrowserErrors:'BLOCKED: canonical application schema unavailable',
    componentOnly:true,canaryContentsRecorded:false},null,2));
  if(build.exitCode!==0||build.markerSeen||scanned.some(f=>f.markerPresent)||checks.some(c=>!c.pass))
    process.exitCode=1;
}finally{
  if(server)await new Promise(r=>server.close(r));
  await fs.rm(temp,{recursive:true,force:true});
  await fs.writeFile(out+'/output-cleanup.json',JSON.stringify({canaryFilesRemoved:true,
    componentServerStopped:true,temporaryDirectoryRemoved:true,productionModified:false}));
}
console.log('Synthetic output component verification completed; actual source-map canary removed.');
