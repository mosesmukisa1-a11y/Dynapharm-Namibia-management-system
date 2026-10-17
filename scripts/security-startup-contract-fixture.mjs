// Non-installable three-module test export; not a final release candidate.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const base='generated-artifacts/sql-runtime-enforcement-final',id=randomUUID();
const directory=path.resolve(base,'startup-contract-fixtures',id);
await fs.mkdir(base,{recursive:true});
await fs.writeFile(base+'/startup-contract-ownership.json',JSON.stringify({
  id,directory,production:false,purpose:'Pure startup contracts; no database, bootstrap, worker or final candidate',
},null,2));
const files=['api/services/startupPolicy.js','api/services/startupSchema.js','worker/tasks.mjs'];
// Copy the closed source-module dependency graph, not a live application or its
// DB module. Descriptor/catalog imports were introduced by the real migration.
for(let index=0;index<files.length;index++){
  const source=await fs.readFile(files[index],'utf8');
  for(const match of source.matchAll(/\bfrom\s+['"]([.][^'"]+)['"]/g)){
    const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(files[index]),match[1]));
    if(!dependency.startsWith('api/services/')&&!dependency.startsWith('worker/'))
      throw Error('Pure startup fixture dependency escaped its source-only boundary');
    if(!files.includes(dependency))files.push(dependency);
  }
}
const sourceHashes={};let result;
try{
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  for(const file of files){
    const content=await fs.readFile(file);sourceHashes[file]=createHash('sha256').update(content).digest('hex');
    await fs.mkdir(path.dirname(directory+'/'+file),{recursive:true});
    await fs.writeFile(directory+'/'+file,content);
  }
  const execution=await new Promise(resolve=>{
    const child=spawn(process.execPath,['--test','scripts/predeployment-startup-contract.test.mjs'],{
      env:{PATH:process.env.PATH,HOME:directory,NODE_ENV:'test',PREDEPLOY_TARGET_ROOT:directory},
      stdio:['ignore','pipe','pipe'],
    });let output='';
    child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});
    child.once('error',()=>resolve({code:null,output}));child.once('exit',code=>resolve({code,output}));
  });
  const tests=Number(execution.output.match(/^# tests (\d+)$/m)?.[1]||0);
  const failed=Number(execution.output.match(/^# fail (\d+)$/m)?.[1]??-1);
  result={status:execution.code===0&&tests===23&&failed===0?'PASS':'FAIL',tests,failed,sourceHashes,
    exitCode:execution.code,outputSha256:createHash('sha256').update(execution.output).digest('hex'),
    databaseAccess:false,finalReleaseCandidatePrepared:false,cleanInstallAttempted:false,
  };
}finally{
  await fs.rm(directory,{recursive:true,force:true});
  await fs.writeFile(base+'/startup-contract-cleanup.json',JSON.stringify({id,ownedExportRemoved:true,production:false},null,2));
}
await fs.writeFile(base+'/startup-contract-results.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,tests:result.tests,failed:result.failed}));
if(result.status!=='PASS')process.exitCode=1;
