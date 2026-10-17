// Offline preparation only: this script has no database connection or helper.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {scope,identitySql,metadataIds,managedSpec} from './lib/managed-schema-policy.mjs';
const out='generated-artifacts/production-schema-metadata-managed';
const attachment='attached_assets/Pasted--Renewed-managed-read-only-schema-authorization-The-own_1792237680470.txt';
const digest=s=>createHash('sha256').update(s).digest('hex');
await fs.mkdir(out,{recursive:true});
const save=(file,value)=>fs.writeFile(out+'/'+file,JSON.stringify(value,null,2));
const source=await fs.readFile(attachment),stat=await fs.stat(attachment);
const start=Math.min(Number(attachment.match(/_(\d{13})\.txt$/)[1]),stat.mtimeMs);
let auth=JSON.parse(await fs.readFile(out+'/authorization.json','utf8').catch(()=> 'null'));
if(auth&&auth.authorizationFingerprint!==digest(source))throw Error('Different authorization; no implicit reset');
auth||={reference:attachment,authorizationFingerprint:digest(source),startsAt:new Date(start).toISOString(),
  expiresAt:new Date(start+7200000).toISOString(),timezone:'Africa/Windhoek',utcOffset:'+02:00',
  timestampBasis:'Conservative earliest platform upload timestamp/local mtime; message timestamp not separately exposed',
  managedInterfaceAuthorized:true,providerManagedTransportAccepted:true,
  independentPreconnectionTlsTimeoutAttestationRequired:false,
  readOnlyFlagsBothOnRequired:true,objects:scope.map(({schema,table,column})=>({schema,table,column}))};
if(Date.now()<Date.parse(auth.startsAt)||Date.now()>=Date.parse(auth.expiresAt))throw Error('Authorization expired');
await save('authorization.json',auth);
await save('managed-route.json',{interface:'executeSql',target:'replit_database',environment:'production',
  routeBasis:'Owner-approved current-project managed production database route',
  readOnlyReplicaRoutingDocumented:true,providerManagedTransportAccepted:true,
  independentTlsTimeoutAttestationAvailable:false,configurationStatementsPermitted:false,
  operatorSqlAccepted:false,sessionReadOnlyFlagsRequired:['default_transaction_read_only','transaction_read_only']});
const entries=[{id:'identity',sql:identitySql,sqlSha256:digest(identitySql),parameters:['per-inspection fingerprint nonce'],
  catalogRelations:[],functionsOnly:true}];
for(const id of metadataIds){const spec=managedSpec(id,scope[0]);entries.push({id,sql:spec.text,
  sqlSha256:digest(spec.text),parameters:['authorized schema','authorized table','authorized column or null'],
  catalogRelations:spec.relations});}
await save('query-allowlist.json',{immutableQueryIds:true,scope:auth.objects,entries,
  noSetBeginOrConfigurationStatements:true,noBusinessRelationSqlSources:true});
const state=JSON.parse(await fs.readFile(out+'/production-read-verification.json','utf8').catch(()=> 'null'));
if(state?.identityInvocationRecorded||state?.accessEnded)throw Error('Inspection already attempted; replay refused');
await save('production-read-verification.json',{phase:'PREPARED',startedAt:new Date().toISOString(),
  identityInvocationRecorded:false,managedQueryInvocations:0,catalogQueryCount:0,
  catalogRelationsAccessed:[],authorizedObjectsInspected:[],prohibitedStatementAttempted:false,
  productionBusinessRowsRead:false,productionModified:false,migrationsApplied:false,
  providerManagedTransportAccepted:true,accessEnded:false,automaticReplayAllowed:false});
for(const s of scope)await save(s.file,{scope:{schema:s.schema,table:s.table,column:s.column},
  status:'NOT CAPTURED',metadata:null});
console.log('Renewed authorization and fixed managed allowlist prepared offline; no production call.');
