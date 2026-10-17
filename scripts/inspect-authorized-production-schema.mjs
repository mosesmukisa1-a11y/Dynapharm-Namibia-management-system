// Dedicated, one-attempt metadata inspector. No application API/db helper,
// default DATABASE_URL, notebook query tool, dotenv or arbitrary SQL argument.
import fs from 'node:fs/promises';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {scope,queries,controls,querySpec,assertWindow,assertReadOnlySession,sanitizeMetadata}
  from './lib/production-schema-policy.mjs';
const out='generated-artifacts/production-schema-metadata';
const reference='attached_assets/Pasted--Authorized-read-only-production-schema-inspection-The-_1792235106601.txt';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function inspect({connect=false}={}) {
  await fs.mkdir(out,{recursive:true});
  const save=(name,data)=>fs.writeFile(out+'/'+name,JSON.stringify(data,null,2));
  const read=async name=>JSON.parse(await fs.readFile(out+'/'+name,'utf8'));
  let authorization=await read('authorization.json').catch(()=>null);
  const attachment=await fs.readFile(reference);
  if(!authorization){
    // Earliest upload timestamp is conservative; never extend it on reruns.
    const uploaded=Number(reference.match(/_(\d{13})\.txt$/)[1]);
    const start=Math.min(uploaded,(await fs.stat(reference)).mtimeMs);
    authorization={reference,referenceSha256:hash(attachment),
      timeBasis:'Earliest of platform attachment filename timestamp and local upload mtime; message timestamp not separately exposed',
      startsAt:new Date(start).toISOString(),expiresAt:new Date(start+7200000).toISOString(),
      timezone:'Africa/Windhoek',utcOffset:'+02:00',
      localStart:new Date(start).toLocaleString('en-GB',{timeZone:'Africa/Windhoek'}),
      localExpiry:new Date(start+7200000).toLocaleString('en-GB',{timeZone:'Africa/Windhoek'}),
      durationHours:2,scope:scope.map(({schema,table,column})=>({schema,table,column}))};
    await save('authorization.json',authorization);
  }
  if(authorization.referenceSha256!==hash(attachment))throw Error('Authorization reference changed');
  await save('query-allowlist.json',{fixed:true,arbitrarySqlAccepted:false,defaultConnectionAccepted:false,
    sessionStartupOptions:'-c default_transaction_read_only=on -c statement_timeout=4000 -c lock_timeout=500 -c idle_in_transaction_session_timeout=15000',
    controls,queries:Object.entries(queries).map(([id])=>({
      id,sql:queries[id],relations:querySpec(id,scope[0]).relations,
      scopeFilter:'$1 schema; $2 exact table; $3 exact column or null for the three authorized tables'}))});
  const prior=await read('production-read-verification.json').catch(()=>({}));
  if(prior.connectionAttempted)throw Error('Production access already attempted; no reconnection permitted');
  const verification={startedAt:new Date().toISOString(),finishedAt:null,
    connectionAttempted:false,connectionOpened:false,productionAccessEnded:null,
    queryCount:0,catalogQueryCount:0,catalogRelationsQueried:[],authorizedObjectsInspected:[],
    prohibitedStatementAttempted:false,productionBusinessRowsRead:false,productionModified:false,
    migrationsApplied:false,localConnectionMaterialCreated:false,arbitrarySqlAccepted:false,
    phase:'PREFLIGHT',status:'BLOCKED'};
  let client,transaction=false;
  const queried=new Set(),seen=[];
  try{
    assertWindow(authorization);
    const hasConnection=Boolean(process.env.PRODUCTION_SCHEMA_INSPECTION_DATABASE_URL);
    const hasApprovedTarget=Boolean(process.env.PRODUCTION_SCHEMA_APPROVED_TARGET_SHA256);
    await save('target-identity.json',{status:'BLOCKED',dedicatedConnectionConfigured:hasConnection,
      approvedFingerprintConfigured:hasApprovedTarget,targetMatched:false,defaultConnectionUsed:false,
      credentialsRecorded:false,hostnameRecorded:false});
    if(!hasConnection||!hasApprovedTarget)throw Error('DEDICATED_TARGET_NOT_CONFIGURED');
    if(!connect)throw Error('PREFLIGHT_ONLY_NO_CONNECTION');
    if(process.env.NODE_ENV==='production'||['1','true'].includes(process.env.REPLIT_DEPLOYMENT))
      throw Error('PRODUCTION_RUNTIME_EXECUTION_REFUSED');
    const url=new URL(process.env.PRODUCTION_SCHEMA_INSPECTION_DATABASE_URL);
    if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||
      ['localhost','127.0.0.1','::1'].includes(url.hostname))throw Error('TARGET_INVALID');
    if([...url.searchParams].some(([k,v])=>k!=='sslmode'||v!=='verify-full'))throw Error('TARGET_OPTIONS_REFUSED');
    const target={hostname:url.hostname.toLowerCase(),port:Number(url.port||5432),
      database:decodeURIComponent(url.pathname.slice(1))};
    const targetHash=hash(JSON.stringify(target));
    if(targetHash!==process.env.PRODUCTION_SCHEMA_APPROVED_TARGET_SHA256)
      throw Error('APPROVED_TARGET_MISMATCH');
    const safeIdentity=createHmac('sha256',randomBytes(32)).update(targetHash).digest('hex');
    assertWindow(authorization);verification.connectionAttempted=true;
    await save('production-read-verification.json',verification); // latch before network
    client=new pg.Client({host:target.hostname,port:target.port,database:target.database,
      user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),
      ssl:{rejectUnauthorized:true},connectionTimeoutMillis:4000,query_timeout:5000,
      options:'-c default_transaction_read_only=on -c statement_timeout=4000 -c lock_timeout=500 -c idle_in_transaction_session_timeout=15000'});
    client.on('error',()=>{});await client.connect();verification.connectionOpened=true;
    const control=async id=>{
      if(!Object.hasOwn(controls,id))throw Error('CONTROL_REFUSED');
      if(!['commit','rollback'].includes(id))assertWindow(authorization);
      verification.queryCount++;return client.query(controls[id]);
    };
    await control('begin');transaction=true;
    const identity=(await control('identity')).rows[0];assertReadOnlySession(identity);
    if(identity.database_name!==target.database||client.connection.stream.encrypted!==true)
      throw Error('CONNECTED_TARGET_OR_TLS_NOT_PROVEN');
    verification.sessionReadOnly=true;verification.transactionReadOnly=true;
    verification.statementTimeout=identity.statement_timeout;verification.lockTimeout=identity.lock_timeout;
    await save('target-identity.json',{status:'CONFIRMED',approvedTargetMatched:true,
      connectedDatabaseMatched:true,tlsVerified:true,identityFingerprint:safeIdentity,
      isRecovery:identity.in_recovery,hostnameRecorded:false,accountDetailsRecorded:false});
    verification.phase='CATALOG_CAPTURE';
    for(const object of scope){
      const captured={scope:{schema:object.schema,table:object.table,column:object.column},status:'CAPTURED'};
      for(const id of Object.keys(queries)){
        if(id==='partitions'&&object.table==='users')continue;
        assertWindow(authorization);
        const spec=querySpec(id,object);verification.queryCount++;verification.catalogQueryCount++;
        spec.relations.forEach(r=>queried.add(r));
        captured[id]=(await client.query(spec.text,spec.values)).rows;
      }
      if(!captured.columns?.length)throw Error('AUTHORIZED_OBJECT_NOT_FOUND');
      const safe=sanitizeMetadata(captured);safe.metadata.redactedExpressions=safe.redactions;
      await save(object.file,safe.metadata);seen.push(captured.scope);
      if(safe.redactions)throw Error('SANITIZED_EXPRESSION_REQUIRES_OFFLINE_REVIEW');
    }
    await control('commit');transaction=false;verification.status='CAPTURED';
  }catch(error){
    // Never serialize PG errors, URI parse errors, URL/config objects or identity rows.
    verification.reason=['DEDICATED_TARGET_NOT_CONFIGURED','PREFLIGHT_ONLY_NO_CONNECTION',
      'TARGET_INVALID','TARGET_OPTIONS_REFUSED','APPROVED_TARGET_MISMATCH','PRODUCTION_RUNTIME_EXECUTION_REFUSED',
      'AUTHORIZED_OBJECT_NOT_FOUND','SANITIZED_EXPRESSION_REQUIRES_OFFLINE_REVIEW'].includes(error.message)?
      error.message:'PREFLIGHT_OR_INSPECTION_REFUSED';
  }finally{
    if(client){
      if(transaction)try{verification.queryCount++;await client.query(controls.rollback);}catch{}
      try{await client.end();verification.productionAccessEnded=true;}
      catch{verification.productionAccessEnded=false;verification.status='BLOCKED';verification.reason='CONNECTION_CLOSE_NOT_CONFIRMED';}
    }
    verification.catalogRelationsQueried=[...queried].sort();
    verification.authorizedObjectsInspected=seen;
    verification.finishedAt=new Date().toISOString();
    await save('production-read-verification.json',verification);
    for(const object of scope)if(!seen.some(s=>s.table===object.table))
      await save(object.file,{scope:{schema:object.schema,table:object.table,column:object.column},
        status:'NOT CAPTURED',reason:verification.reason||'Inspection incomplete',metadata:null});
    await fs.writeFile(out+'/inspection-summary.md',`# BLOCKED - DO NOT PUBLISH\n\n`+
      `Authorization expires ${authorization.expiresAt} (${authorization.localExpiry} Africa/Windhoek). `+
      `Status: ${verification.status}. Reason: ${verification.reason||'Metadata captured; offline review still required'}.\n\n`+
      `Production connection attempted: ${verification.connectionAttempted}. Catalog queries: ${verification.catalogQueryCount}. `+
      `Business rows read: false. Production modified: false. No fallback connection or notebook query tool used.\n\n`+
      `Captured metadata is never migration authority until offline review. Missing or redacted definitions must not be guessed. `+
      `No reconnection permitted after a production connection attempt. The 14 historical ambiguous databases are untouched.\n`);
  }
  return verification;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const args=process.argv.slice(2);
    if(args.length>1||args.some(a=>!['--inspect','--preflight'].includes(a)))throw Error('CLI_REFUSED');
    const result=await inspect({connect:args.includes('--inspect')});
    console.log(JSON.stringify({status:result.status,reason:result.reason||null,
      productionConnectionAttempted:result.connectionAttempted,catalogQueries:result.catalogQueryCount}));
    if(result.status!=='CAPTURED')process.exitCode=2;
  }catch{
    console.log(JSON.stringify({status:'BLOCKED',reason:'LOCAL_PREFLIGHT_REFUSED'}));process.exitCode=2;
  }
}
