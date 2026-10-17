// Read-only source inventory. Does not package or prepare an installable candidate.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {eligibleUntrackedSchemaSource} from './lib/schema-candidate-files.mjs';
const base='generated-artifacts/sql-security-final-closure';
const hash=b=>createHash('sha256').update(b).digest('hex');
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0');
const extra=execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(eligibleUntrackedSchemaSource);
const old=JSON.parse(await fs.readFile('generated-artifacts/final-security-release-gate/candidate-manifest.json','utf8'));
const files={},changed=[],excluded=[];
for(const file of [...new Set([...tracked,...extra])].filter(Boolean).sort()){
  if(file.startsWith('/')||file.split('/').includes('..'))throw Error('Unsafe source inventory path');
  if(/^(?:\.git\/|node_modules\/|generated-artifacts\/|attached_assets\/|\.agents\/|\.local\/|\.cache\/|dist\/|uploads\/|backend\/dynapharm_data\/)/.test(file)||
    file.split('/').some(p=>p.startsWith('.env'))||
    /(?:\.log|\.db|\.sqlite|\.dump|\.zip|\.tar|\.tgz|\.gz|\.pem|\.key|\.csv|\.xlsx?)$/.test(file)||
    /^(?:reports_data\.json|portal-errors-report\.json)$/.test(file)||
    /(?:^|\/)(?:browser-private|service-account|credentials)(?:\.|\/)/i.test(file)){
    excluded.push(file);continue;
  }
  const stat=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(!stat?.isFile()){excluded.push(file);continue;}
  files[file]=hash(await fs.readFile(file));
  if(old.files[file]!==files[file])changed.push({file,sha256:files[file],previousSha256:old.files[file]||null});
}
await fs.mkdir(base,{recursive:true});
await fs.writeFile(base+'/review-source-manifest.json',JSON.stringify({
  kind:'REVIEW ONLY — NOT AN INSTALLABLE CANDIDATE',recordedAt:new Date().toISOString(),
  sourceFiles:files,filesCount:Object.keys(files).length,changedSinceRetainedReview:changed,
  excludedPaths:excluded,finalReleaseCandidatePrepared:false,cleanInstallAttempted:false,
  ownerManualCommandWithheld:true,productionAccess:false,
},null,2));
await fs.writeFile(base+'/changed-files.json',JSON.stringify({
  comparison:'Retained previous release-gate source manifest, not Git HEAD or an invented per-turn baseline',
  changed,deletedPreviouslyIncluded:Object.keys(old.files).filter(f=>!Object.hasOwn(files,f)),
},null,2));
console.log(JSON.stringify({sourceFiles:Object.keys(files).length,changed:changed.length,finalCandidatePrepared:false}));
