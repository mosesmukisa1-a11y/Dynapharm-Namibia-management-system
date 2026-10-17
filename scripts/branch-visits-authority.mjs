import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {branchVisitsQueryId,branchVisitsSql,branchVisitsParams} from './lib/branch-visits-schema-query.mjs';
const out='generated-artifacts/branch-client-visits-authority';
const source='attached_assets/Pasted--Final-branch-client-visits-authority-and-release-gate-_1792246677452.txt';
const hash=x=>createHash('sha256').update(x).digest('hex');
const save=(n,d)=>fs.writeFile(out+'/'+n,JSON.stringify(d,null,2)+'\n');
if(process.argv[2]==='prepare'){
  await fs.mkdir(out,{recursive:true});
  try{
    const old=JSON.parse(await fs.readFile(out+'/production-read-verification.json','utf8'));
    if(old.invocationCount||old.invocationReserved||old.accessEnded)throw Error('Terminal inspection: replay prohibited');
  }catch(e){if(e.code!=='ENOENT')throw e;}
  const stat=await fs.stat(source),body=await fs.readFile(source);
  const startsAt=stat.mtime.toISOString(),expiresAt=new Date(stat.mtimeMs+7200000).toISOString();
  assert(Date.now()>=stat.mtimeMs&&Date.now()<Date.parse(expiresAt),'Authorization expired/not current');
  const auth={fingerprint:hash(body),startsAt,expiresAt,timestampBasis:'Conservative upload timestamp',
    maxManagedOperations:1,objects:['public.branch_client_visits'],
    dependencies:'Only direct required FK, owned sequence, attached trigger/function or partition identities',
    exactExpressionsAuthorized:true,requiredGuards:{transaction_read_only:'on',in_recovery:true}};
  await save('authorization.json',auth);
  await save('query-definition.json',{queryId:branchVisitsQueryId,sql:branchVisitsSql,
    sqlSha256:hash(branchVisitsSql),params:branchVisitsParams,everyMetadataSectionGuarded:true});
  await save('production-read-verification.json',{queryId:branchVisitsQueryId,authorizationFingerprint:auth.fingerprint,
    startsAt,expiresAt,invocationCount:0,invocationReserved:false,accessEnded:false,replayProhibited:true,
    additionalManagedCallsAllowed:true,productionBusinessRowsRead:false,productionModified:false,status:'PREPARED'});
  console.log('Single-operation immutable catalog definition and zero-call journal prepared.');
}else if(process.argv[2]==='close'){
  const receipt=JSON.parse(await fs.readFile(out+'/operation-receipt.json','utf8'));
  assert.equal(receipt.success,true);
  const csv=receipt.output.trim().split('\n').slice(1).join('\n');
  const text=csv.startsWith('"')?csv.slice(1,-1).replaceAll('""','"'):csv;
  assert(!/postgres(?:ql)?:\/\/|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|re_[A-Za-z0-9]{25,}/.test(text));
  const evidence=JSON.parse(text),journal=JSON.parse(await fs.readFile(out+'/production-read-verification.json','utf8'));
  assert.equal(journal.invocationCount,1);assert(journal.accessEnded&&!journal.additionalManagedCallsAllowed);
  assert(evidence.guard.allowed&&evidence.guard.transaction_read_only==='on'&&evidence.guard.in_recovery===true);
  assert.deepEqual(evidence.tables.map(t=>[t.schema,t.table]),[['public','branch_client_visits']]);
  await save('branch-client-visits.schema.json',{guard:evidence.guard,...evidence.tables[0],functions:evidence.functions});
  await save('dependency-graph.json',{guard:evidence.guard,dependencies:evidence.dependencies,
    limitation:'Direct catalog identities, not full procedural-body runtime dependency proof'});
  await fs.writeFile(out+'/inspection-summary.md',`# Branch client visits authority\n\nOne fixed parameterized catalog operation completed at ${evidence.guard.captured_at}.\nRead-only on, recovery true. Access ended; replay and additional managed calls prohibited.\nNo application rows read. No production modification. Physical pooled socket teardown is not independently observable.\nTable exists: ${evidence.tables[0].exists}; columns: ${evidence.tables[0].columns.length}; functions: ${evidence.functions.length}.\nStatus: BLOCKED - DO NOT PUBLISH (release gates separate).\n`);
  console.log(JSON.stringify({guard:evidence.guard,exists:evidence.tables[0].exists,
    columns:evidence.tables[0].columns.map(c=>({name:c.column_name,type:c.native_type})),
    constraints:evidence.tables[0].constraints,functions:evidence.functions.map(f=>f.name)}));
}else throw Error('Use prepare or close; no provider callback in this offline tool.');
