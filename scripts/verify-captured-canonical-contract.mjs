// Offline evidence merge only. Never invent defaults or read application rows.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const old='generated-artifacts/production-schema-metadata-final';
const current='generated-artifacts/production-schema-defaults-final';
const out='generated-artifacts/security-release-candidate-final';
await fs.mkdir(out,{recursive:true});
const base=JSON.parse(await fs.readFile(old+'/branch-activity-transactions.schema.json','utf8'));
const defaults=JSON.parse(await fs.readFile(current+'/default-expressions.json','utf8'));
assert.equal(defaults.guard.allowed,true);
assert.equal(defaults.guard.transaction_read_only,'on');assert.equal(defaults.guard.in_recovery,true);
const patched=new Map(defaults.defaults.map(d=>[d.column_name,d.default_expression]));
const metadata=structuredClone(base.metadata);
let changed=0;
for(const c of metadata.columns){
  if(c.default_redacted){
    assert(patched.has(c.column_name));c.column_default=patched.get(c.column_name);
    c.default_redacted=false;changed++;
  }
  assert.equal(c.generation_redacted,false);
  assert.equal(c.is_identity,'NO');assert.equal(c.is_generated,'NEVER');
}
assert.equal(changed,4);assert.equal(metadata.columns.length,30);
assert.deepEqual(metadata.sequences,[]);
assert.deepEqual(metadata.partitions,[{relkind:'r',key_redacted:false,parent_table:null,parent_schema:null,
  partition_key:null,bound_redacted:false,relispartition:false,partition_bound:null}]);
const contract=JSON.parse(await fs.readFile('tests/fixtures/canonical-schema-contract.json','utf8'));
const activity=contract.objects.find(o=>o.table==='branch_activity_transactions');
assert.deepEqual(activity.columns,metadata.columns.map(c=>[
  c.column_name,c.native_type,c.is_nullable==='YES',c.column_default]));
assert(metadata.constraints.every(c=>!c.definition_redacted));
assert(metadata.indexes.every(i=>!i.definition_redacted&&!i.predicate_redacted&&i.indisvalid));
assert.deepEqual(activity.constraints,metadata.constraints.map(c=>[c.name,c.definition]));
assert.deepEqual(activity.indexes.toSorted(),metadata.indexes.map(i=>i.definition).toSorted());
await fs.writeFile(out+'/merged-activity-schema.json',JSON.stringify({metadata,
  sources:{baseCapturedAt:base.capturedAt,defaultsCapturedAt:defaults.guard.captured_at},
  limitation:'Two separately authorized capture times, not one contemporaneous whole-schema snapshot',
  productionRowsCopied:false},null,2));
await fs.writeFile(out+'/captured-contract-verification.json',JSON.stringify({
  status:'PASS',columns:30,defaultsPatched:4,keys:1,indexes:4,
  partitioned:false,identities:0,generatedColumns:0,sequences:0,
  contractSha256:createHash('sha256').update(JSON.stringify(activity)).digest('hex'),
  exactDefaults:true,guessedDefinitions:false,productionOperations:0},null,2));
console.log('Captured 30-column activity definition matches repository contract offline.');
