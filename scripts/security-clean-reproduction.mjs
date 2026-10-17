// External observer: never changes the archive or the extracted candidate.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {collectFixtureDiagnostics,safeFailure} from './lib/clean-gate-diagnostics.mjs';
const root=process.cwd(),base=root+'/generated-artifacts/sql-runtime-enforcement-final';
const expected='4f55d023a2f2ceeab32b97769c832db66904107d29f23aead3b7679ea5e54e51';
const archive=base+'/exact-candidate-source.tar';
const hash=b=>createHash('sha256').update(b).digest('hex');
if(hash(await fs.readFile(archive))!==expected)throw Error('Original candidate identity mismatch');
const manifest=JSON.parse(await fs.readFile(base+'/candidate-manifest.json','utf8'));
if(manifest.archiveSha256!==expected)throw Error('Original manifest mismatch');
const id=randomUUID(),out=base+'/clean-repair/'+id,temp=path.join(os.tmpdir(),'security-clean-repro-'+id);
await fs.mkdir(out,{recursive:true});
await fs.writeFile(out+'/ownership.json',JSON.stringify({temp,production:false,purpose:'Exact original clean database reproduction'}));
const result={archiveSha256:expected,startedAt:new Date().toISOString(),stages:[],
  node:process.version,npm:execFileSync('npm',['--version'],{encoding:'utf8'}).trim(),
  executables:Object.fromEntries(['node','npm','initdb','pg_ctl','pg_dump','psql'].map(x=>
    [x,execFileSync('which',[x],{encoding:'utf8'}).trim()])),workspaceDependenciesUsed:false};
try{
  await fs.mkdir(temp,{mode:0o700});await fs.mkdir(temp+'/home');await fs.mkdir(temp+'/source');
  execFileSync('tar',['-xf',archive,'-C',temp+'/source']);
  for(const [file,digest]of Object.entries(manifest.files))
    if(hash(await fs.readFile(temp+'/source/'+file))!==digest)throw Error('Extracted source mismatch');
  await fs.writeFile(temp+'/source/.verified-candidate-source.json',JSON.stringify({files:manifest.files}));
  const env={PATH:process.env.PATH,HOME:temp+'/home',XDG_CONFIG_HOME:temp+'/config',CI:'true',NODE_ENV:'test'};
  for(const [name,command,args]of [
    ['clean npm ci','npm',['ci']],
    ['complete isolated database suite',process.execPath,['scripts/security-closure-fixture.mjs','--database-suites']]]){
    let text='';
    const exit=await new Promise(resolve=>{const child=spawn(command,args,{cwd:temp+'/source',env,stdio:['ignore','pipe','pipe']});
      child.stdout.on('data',b=>{text=(text+b).slice(-200000);});
      child.stderr.on('data',b=>{text=(text+b).slice(-200000);});
      child.once('error',e=>resolve({exitCode:null,signal:null,spawnCode:e.code}));
      child.once('close',(exitCode,signal)=>resolve({exitCode,signal}));});
    result.stages.push({name,...exit,status:exit.exitCode===0?'PASS':'FAIL',
      failure:exit.exitCode===0?null:safeFailure(text)});
    result.fixtures=await collectFixtureDiagnostics(temp+'/source');
    await fs.writeFile(out+'/result.json',JSON.stringify(result,null,2));
    if(exit.exitCode!==0)break;
  }
  result.candidateUnchanged=true;
  for(const [file,digest]of Object.entries(manifest.files))
    if(hash(await fs.readFile(temp+'/source/'+file))!==digest)result.candidateUnchanged=false;
}finally{
  await fs.rm(temp,{recursive:true,force:true});
  result.disposableCopyRemoved=true;result.finishedAt=new Date().toISOString();
  await fs.writeFile(out+'/result.json',JSON.stringify(result,null,2));
}
console.log('Safe reproduction evidence: '+out+'/result.json');
