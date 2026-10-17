import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {consolidatedQueryId,consolidatedTables,consolidatedParams,consolidatedSql} from './lib/consolidated-schema-query.mjs';
const out='generated-artifacts/production-schema-consolidated-final';
const source='attached_assets/Pasted--Consolidated-schema-authority-capture-and-release-gate_1792244359982.txt';
const hash=x=>createHash('sha256').update(x).digest('hex');
await fs.mkdir(out,{recursive:true});
try{
  const old=JSON.parse(await fs.readFile(out+'/production-read-verification.json','utf8'));
  if(old.invocationCount||old.invocationReserved||old.accessEnded)throw Error('Terminal inspection: replay prohibited');
}catch(e){if(e.code!=='ENOENT')throw e;}
const stat=await fs.stat(source),body=await fs.readFile(source);
const startsAt=stat.mtime.toISOString(),expiresAt=new Date(stat.mtimeMs+7200000).toISOString();
if(Date.now()<stat.mtimeMs||Date.now()>=Date.parse(expiresAt))throw Error('Authorization not current');
const auth={fingerprint:hash(body),startsAt,expiresAt,timestampBasis:'Conservative upload timestamp',
  maxManagedOperations:1,tables:consolidatedTables.map(table=>({schema:'public',table})),
  functions:'public.notify_change and non-internal trigger functions directly attached to authorized objects',
  dependencies:'Direct identities only; no unrelated object definitions',exactExpressionsAuthorized:true,
  requiredGuards:{transaction_read_only:'on',in_recovery:true}};
const save=(n,d)=>fs.writeFile(out+'/'+n,JSON.stringify(d,null,2)+'\n');
await save('authorization.json',auth);
await save('query-definition.json',{queryId:consolidatedQueryId,sql:consolidatedSql,
  sqlSha256:hash(consolidatedSql),params:consolidatedParams,everyMetadataSectionGuarded:true,
  applicationRelationSources:[],arbitrarySqlAccepted:false});
await save('production-read-verification.json',{queryId:consolidatedQueryId,
  authorizationFingerprint:auth.fingerprint,startsAt,expiresAt,invocationCount:0,invocationReserved:false,
  accessEnded:false,replayProhibited:true,additionalManagedCallsAllowed:true,
  productionBusinessRowsRead:false,productionModified:false,status:'PREPARED'});
console.log('Consolidated immutable scope and zero-call journal prepared offline.');
