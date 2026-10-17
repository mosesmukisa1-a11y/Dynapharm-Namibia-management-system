// Non-production tool namespace. Import before creating any driver, loading
// data or considering tool-specific arguments. No production escape flag.
import {readFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
if(process.env.NODE_ENV!=='test'||process.env.STOCK_AUDIT_ISOLATED!=='1'||
  process.env.REPLIT_DEPLOYMENT!=='0')
  throw Error('This tool requires a positively owned disposable test context');
const name=process.env.STOCK_AUDIT_DATABASE,output=process.env.OWNED_AUDIT_OUTPUT;
if(!/^stock_audit_[a-f0-9]{32}$/.test(name||'')||!output)
  throw Error('Owned tool identity is missing');
let target;
try{target=new URL(process.env.DATABASE_URL);}catch{
  throw Error('Owned tool target is malformed');
}
if(!['postgres:','postgresql:'].includes(target.protocol)||target.hostname!=='127.0.0.1'||
  target.pathname!=='/'+name||target.search||target.hash||target.username!=='fixture_owner')
  throw Error('Owned tool target is refused');
const parent=path.dirname(path.resolve(output)),root=path.resolve('generated-artifacts/sql-runtime-enforcement-final/fixture-runs');
if(!parent.startsWith(root+path.sep)||realpathSync(parent)!==parent)
  throw Error('Owned tool journal is outside its fixed evidence namespace');
const owner=JSON.parse(readFileSync(parent+'/fixture-ownership.json','utf8'));
if(!/^[a-f0-9-]{36}$/.test(owner.runId)||owner.runId!==path.basename(parent)||
  owner.database!==name||owner.disposable!==true||owner.production!==false||
  owner.cleanupOwner!=='security-closure-fixture'||
  createHash('sha256').update(target.hostname+':'+target.port).digest('hex')!==owner.hostFingerprint)
  throw Error('Owned tool journal does not match the target');
const expected='/tmp/security-closure-'+owner.runId;
if(owner.clusterDirectory!==expected||realpathSync(expected)!==expected)
  throw Error('Owned cluster directory is not current');
const postmaster=readFileSync(expected+'/data/postmaster.pid','utf8').split('\n');
if(postmaster[1]!==expected+'/data'||postmaster[3]!==target.port||!/^[1-9]\d*$/.test(postmaster[0]))
  throw Error('Owned postmaster identity is not current');
process.kill(Number(postmaster[0]),0); // Existence check only; never stops a process.
export const ownedToolContext=Object.freeze({runId:owner.runId,database:name,production:false});
