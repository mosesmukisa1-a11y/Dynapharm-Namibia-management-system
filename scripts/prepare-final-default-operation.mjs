import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {defaultQueryId,defaultScope,defaultParams,defaultSql} from './lib/final-default-expression-query.mjs';
const out='generated-artifacts/production-schema-defaults-final';
const source='attached_assets/Pasted--Final-default-expression-capture-and-offline-closure-T_1792241774256.txt';
const hash=x=>createHash('sha256').update(x).digest('hex');
await fs.mkdir(out,{recursive:true});
try{
  const old=JSON.parse(await fs.readFile(out+'/production-read-verification.json','utf8'));
  if(old.invocationCount||old.invocationReserved||old.accessEnded)throw Error('Terminal operation: replay prohibited');
}catch(e){if(e.code!=='ENOENT')throw e;}
const stat=await fs.stat(source),body=await fs.readFile(source);
const startsAt=stat.mtime.toISOString(),expiresAt=new Date(stat.mtimeMs+7200000).toISOString();
if(Date.now()<stat.mtimeMs||Date.now()>=Date.parse(expiresAt))throw Error('Authorization not current');
const authorization={fingerprint:hash(body),startsAt,expiresAt,
  timestampBasis:'Upload mtime, conservative authorization start',maxManagedOperations:1,
  exactScope:{schema:'public',table:'branch_activity_transactions',columns:defaultScope},
  requiredGuards:{transaction_read_only:'on',in_recovery:true},exactDefaultLiteralsAuthorized:true};
const save=(file,data)=>fs.writeFile(out+'/'+file,JSON.stringify(data,null,2)+'\n');
await save('authorization.json',authorization);
await save('query-definition.json',{queryId:defaultQueryId,sql:defaultSql,sqlSha256:hash(defaultSql),
  params:defaultParams,catalogRelations:['pg_catalog.pg_namespace','pg_catalog.pg_class',
    'pg_catalog.pg_attribute','pg_catalog.pg_attrdef'],allMetadataGuarded:true});
await save('production-read-verification.json',{queryId:defaultQueryId,authorizationFingerprint:authorization.fingerprint,
  startsAt,expiresAt,invocationCount:0,invocationReserved:false,replayProhibited:true,accessEnded:false,
  productionBusinessRowsRead:false,productionModified:false,status:'PREPARED'});
console.log('Fixed four-default query and zero-call durable journal prepared offline.');
