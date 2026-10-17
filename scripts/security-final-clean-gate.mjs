// --prepare only packages current source. --owner-manual installs in a disposable
// copy and must be executed by the owner, never by the remediation agent.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {execFile,execFileSync,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {eligibleUntrackedSchemaSource} from './lib/schema-candidate-files.mjs';
const root=process.cwd(),out=root+'/generated-artifacts/sql-runtime-enforcement-final';
const hash=b=>createHash('sha256').update(b).digest('hex');
const archive=out+'/exact-candidate-source.tar';
await fs.mkdir(out,{recursive:true});
if(process.argv.includes('--prepare')){
  const readiness=JSON.parse(await fs.readFile(out+'/release-gate.json','utf8'));
  if(readiness.status!=='PASS'||readiness.unresolvedLocations!==0||readiness.uncoveredFamilies!==0)
    throw Error('All offline release gates must pass before candidate preparation');
  const files=[...new Set([
    ...execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0'),
    ...execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0')
      .filter(eligibleUntrackedSchemaSource)])].filter(Boolean).sort();
  const temp=path.join(os.tmpdir(),'security-source-'+randomUUID());
  await fs.writeFile(out+'/candidate-preparation-ownership.json',JSON.stringify({
    directory:temp,createdAt:new Date().toISOString(),production:false,
    purpose:'Source-only archive staging; ownership before creation'},null,2));
  await fs.mkdir(temp,{mode:0o700});
  const manifest={recordedAt:new Date().toISOString(),
    head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),
    files:{},lockfileSha256:hash(await fs.readFile(root+'/package-lock.json')),
    exclusions:['Git','dependencies','generated evidence','runtime/private data','attachments','environment files']};
  try{
    for(const file of files){
      if(/^(?:\.git\/|node_modules\/|generated-artifacts\/|attached_assets\/|\.agents\/|\.local\/|\.cache\/|dist\/|uploads\/|backend\/dynapharm_data\/)/.test(file)||
        file.split('/').some(p=>p.startsWith('.env'))||
        /(?:\.log|\.db|\.sqlite|\.dump|\.zip|\.tar|\.tgz|\.gz|\.pem|\.key|\.csv|\.xlsx?)$/.test(file)||
        /^(?:reports_data\.json|portal-errors-report\.json)$/.test(file)||
        /(?:^|\/)(?:browser-private|service-account|credentials)(?:\.|\/)/i.test(file))continue;
      if(path.isAbsolute(file)||file.split('/').includes('..'))throw Error('Unsafe source path');
      const stat=await fs.lstat(root+'/'+file);if(!stat.isFile())continue;
      const body=await fs.readFile(root+'/'+file);
      manifest.files[file]=hash(body);
      await fs.mkdir(path.dirname(temp+'/'+file),{recursive:true});
      await fs.writeFile(temp+'/'+file,body);
    }
    await promisify(execFile)('tar',['-cf',archive,'-C',temp,'.']);
    manifest.archiveSha256=hash(await fs.readFile(archive));
    await fs.writeFile(out+'/candidate-manifest.json',JSON.stringify(manifest,null,2));
  }finally{await fs.rm(temp,{recursive:true,force:true});}
  await fs.writeFile(out+'/clean-install.json',JSON.stringify({status:'NOT VERIFIED',
    preparedOnly:true,installationAttempted:false,exactSourceArchivePrepared:true,
    temporaryPreparationCopyRemoved:true,existingNodeModulesCopied:false,
    manualCommand:'node scripts/security-final-clean-gate.mjs --owner-manual'},null,2));
  console.log('Exact candidate source prepared; installation NOT VERIFIED.');
}else if(process.argv.includes('--owner-manual')){
  if(process.env.NODE_ENV==='production'||['1','true'].includes(process.env.REPLIT_DEPLOYMENT))
    throw Error('Production execution refused');
  const manifest=JSON.parse(await fs.readFile(out+'/candidate-manifest.json','utf8'));
  if(hash(await fs.readFile(archive))!==manifest.archiveSha256)throw Error('Candidate archive changed');
  for(const[file,digest]of Object.entries(manifest.files))
    if(hash(await fs.readFile(root+'/'+file))!==digest)throw Error('Candidate source changed; prepare/review a new candidate');
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'security-clean-install-'));
  const source=temp+'/source',home=temp+'/home';await fs.mkdir(source);await fs.mkdir(home);
  const result={status:'NOT VERIFIED',startedAt:new Date().toISOString(),
    archiveSha256:manifest.archiveSha256,lockfileBefore:manifest.lockfileSha256,stages:[]};
  try{
    await promisify(execFile)('tar',['-xf',archive,'-C',source]);
    if(await fs.stat(source+'/node_modules').then(()=>true,()=>false))throw Error('Source unexpectedly has dependencies');
    for(const[file,digest]of Object.entries(manifest.files))
      if(hash(await fs.readFile(source+'/'+file))!==digest)throw Error('Extracted candidate mismatch');
    await fs.writeFile(source+'/.verified-candidate-source.json',JSON.stringify({files:manifest.files}));
    const env={PATH:process.env.PATH,HOME:home,XDG_CONFIG_HOME:temp+'/config',CI:'true',NODE_ENV:'test'};
    async function stage(name,command,args,extra={}){
      const code=await new Promise(resolve=>{
        const child=spawn(command,args,{cwd:source,env:{...env,...extra},stdio:['ignore','pipe','pipe']});
        // No request/private/provider/npm environment output is emitted or retained.
        child.stdout.resume();child.stderr.resume();
        child.once('error',()=>resolve(null));child.once('exit',resolve);
      });
      result.stages.push({name,exitCode:code,status:code===0?'PASS':'FAIL',at:new Date().toISOString()});
      await fs.writeFile(out+'/clean-install.json',JSON.stringify(result,null,2));
      return code===0;
    }
    const installed=await stage('genuine lockfile-only clean install','npm',['ci']);
    if(installed){
      await stage('production build',process.execPath,['node_modules/vite/bin/vite.js','build'],{NODE_ENV:'production'});
      await stage('unit suite',process.execPath,['node_modules/vitest/vitest.mjs','run','--project','unit']);
      await stage('complete isolated database suite',process.execPath,['scripts/security-closure-fixture.mjs','--database-suites']);
      await stage('credential-specific suite',process.execPath,['scripts/security-closure-fixture.mjs','--credential-only']);
      await stage('23 startup contracts',process.execPath,['--test','scripts/predeployment-startup-contract.test.mjs'],
        {PREDEPLOY_TARGET_ROOT:source});
      await stage('strict-launcher and browser rehearsal',process.execPath,['scripts/security-closure-fixture.mjs']);
    }
    result.lockfileAfter=hash(await fs.readFile(source+'/package-lock.json'));
    result.candidateAfterMatches=true;
    for(const[file,digest]of Object.entries(manifest.files))
      if(hash(await fs.readFile(source+'/'+file))!==digest)result.candidateAfterMatches=false;
    result.status=installed&&result.stages.every(s=>s.status==='PASS')&&result.candidateAfterMatches&&
      result.lockfileAfter===result.lockfileBefore?'PASS':'BLOCKED';
  }catch{result.status='BLOCKED';result.reason='Clean-copy operation failed; private details withheld';}
  finally{
    await fs.rm(temp,{recursive:true,force:true});
    result.disposableCopyRemoved=true;result.finishedAt=new Date().toISOString();
    result.productionModified=false;
    await fs.writeFile(out+'/clean-install.json',JSON.stringify(result,null,2));
  }
  console.log('Sanitized clean-install result saved; no raw package or test output displayed.');
}else throw Error('Use --prepare, or owner-only --owner-manual');
