// Offline preparation only. Network invocation is separately journalled.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {finalManagedQueryId,finalManagedSql,finalManagedScope,finalManagedRelations}
  from './lib/final-managed-schema-query.mjs';
const out='generated-artifacts/production-schema-metadata-final';
const reference='attached_assets/Pasted--Final-authorized-managed-schema-inspection-The-owner-a_1792238421804.txt';
const hash=s=>createHash('sha256').update(s).digest('hex');
await fs.mkdir(out,{recursive:true});
const save=(name,data)=>fs.writeFile(out+'/'+name,JSON.stringify(data,null,2));
const read=async name=>JSON.parse(await fs.readFile(out+'/'+name,'utf8').catch(()=> 'null'));
const content=await fs.readFile(reference),stat=await fs.stat(reference);
let auth=await read('authorization.json');
if(auth&&auth.fingerprint!==hash(content))throw Error('Different authorization; implicit reset forbidden');
const start=Math.min(Number(reference.match(/_(\d{13})\.txt$/)[1]),stat.mtimeMs);
auth||={reference,fingerprint:hash(content),startsAt:new Date(start).toISOString(),
  expiresAt:new Date(start+7200000).toISOString(),timezone:'Africa/Windhoek',utcOffset:'+02:00',
  timeBasis:'Earliest attachment timestamp/local upload mtime; message timestamp not separately exposed',
  providerTransportAccepted:true,sessionDefaultOffAccepted:true,
  requiredGuards:{transaction_read_only:'on',in_recovery:true},
  maxManagedOperations:1,objects:finalManagedScope.map(({schema,table,column})=>({schema,table,column}))};
if(Date.now()<Date.parse(auth.startsAt)||Date.now()>=Date.parse(auth.expiresAt))throw Error('Authorization expired');
const old=await read('production-read-verification.json');
if(old?.invocationReserved||old?.invocationCount||old?.accessEnded)throw Error('One-operation inspection already reserved/ended; replay prohibited');
await save('authorization.json',auth);
await save('query-allowlist.json',{queryId:finalManagedQueryId,sql:finalManagedSql,sqlSha256:hash(finalManagedSql),
  boundValues:['fingerprint nonce','public','branches','branch_activity_transactions','branch_distributor_profit','users','additional_roles'],
  catalogRelations:finalManagedRelations,guardCte:'guard',everyMetadataSectionRequiresGuard:true,
  noBusinessRelationSources:true,arbitrarySqlAccepted:false,controlStatementsPermitted:false});
await save('production-read-verification.json',{queryId:finalManagedQueryId,authorizationFingerprint:auth.fingerprint,
  startsAt:auth.startsAt,expiresAt:auth.expiresAt,authorizedObjects:auth.objects,
  invocationCount:0,invocationReserved:false,replayProhibited:true,accessEnded:false,
  productionBusinessRowsRead:false,productionModified:false,prohibitedStatementAttempted:false,
  actualCatalogRelationsQueried:[],authorizedObjectsCaptured:[],status:'PREPARED'});
for(const s of finalManagedScope)await save(s.file,{scope:{schema:s.schema,table:s.table,column:s.column},
  status:'NOT CAPTURED',metadata:null});
console.log('Final one-operation authorization and immutable guarded SELECT prepared offline.');
