// Run against either exported candidate. No database connection or bootstrap.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=process.env.PREDEPLOY_TARGET_ROOT;
if(!root)throw Error('Owned exported target required');
const policy=await import(pathToFileURL(path.join(root,'api/services/startupPolicy.js')));
const schema=await import(pathToFileURL(path.join(root,'api/services/startupSchema.js')));
const config={STARTUP_MODE:'code-only',ALLOW_SCHEMA_SYNC:'false',ALLOW_REFERENCE_SEEDS:'false',
  ALLOW_INVENTORY_SEED:'false',ALLOW_STOCK_SUMMARY_DDL:'false',ENABLE_STOCK_SCHEDULER:'false',
  ENABLE_STOCK_HEALTH_DIGEST:'false'};
test('proposed explicit configuration is nonmutating',()=>{
  const p=policy.createStartupPolicy(config);
  assert.equal(p.startupMode,'code-only');assert.equal(p.writesAllowed,false);assert.equal(p.enableStockScheduler,false);
});
for(const flag of ['ALLOW_SCHEMA_SYNC','ALLOW_REFERENCE_SEEDS','ALLOW_INVENTORY_SEED','ALLOW_STOCK_SUMMARY_DDL','ENABLE_STOCK_SCHEDULER']){
  test(`${flag}=true rejected in code-only`,()=>assert.throws(()=>policy.createStartupPolicy({...config,[flag]:'true'})));
  test(`${flag} malformed rejected`,()=>assert.throws(()=>policy.createStartupPolicy({...config,[flag]:'invalid'})));
}
for(const value of ['invalid','','CODE-ONLY'])test(`invalid startup mode ${JSON.stringify(value)} rejected`,
  ()=>assert.throws(()=>policy.createStartupPolicy({...config,STARTUP_MODE:value})));
test('all registered callbacks skipped and logged without execution',()=>{
  let calls=0;const logs=[];
  for(const op of Object.keys(policy.STARTUP_OPERATIONS))
    policy.runStartupOperation(policy.createStartupPolicy(config),op,()=>{calls++;},s=>logs.push(JSON.parse(s)));
  assert.equal(calls,0);assert(logs.length>Object.keys(policy.STARTUP_OPERATIONS).length);
  assert(logs.every(x=>x.event==='startup.operation.skipped'));
});
test('legacy/default callback dispatch retained without executing real bootstrap',()=>{
  let calls=0;
  for(const op of Object.keys(policy.STARTUP_OPERATIONS))
    policy.runStartupOperation(policy.createStartupPolicy({}),op,()=>{calls++;});
  assert.equal(calls,Object.keys(policy.STARTUP_OPERATIONS).length);
});
const rows=Object.entries(schema.REQUIRED_STARTUP_SCHEMA).flatMap(([table,names])=>
  names.map(column=>({table_name:table,column_name:column,readable:true})));
test('exact complete contract uses metadata SELECT only',async()=>{
  let calls=0;const result=await schema.checkStartupCompatibility(async sql=>{
    calls++;assert.match(sql,/^\s*SELECT/i);assert(!/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(sql));return {rows};
  },policy.createStartupPolicy(config));
  assert.equal(result.compatible,true);assert.equal(calls,1);
});
test('missing table and actor column fail without repair',async()=>{
  const result=await schema.checkStartupCompatibility(async()=>({rows:rows.filter(r=>
    r.table_name!=='users'&&!(r.table_name==='stock_requests'&&r.column_name==='updated_by'))}),
  policy.createStartupPolicy(config));
  assert.equal(result.compatible,false);assert(result.missingTables.includes('users'));
  assert(result.missingColumns.includes('stock_requests.updated_by'));
});
test('unreadable relation fails',async()=>{
  const result=await schema.checkStartupCompatibility(async()=>({rows:rows.map(r=>({...r,readable:false}))}),
    policy.createStartupPolicy(config));assert.equal(result.compatible,false);
});
test('catalogue error is redacted and not repaired',async()=>{
  const result=await schema.checkStartupCompatibility(async()=>{throw Error('private sentinel');},
    policy.createStartupPolicy(config));assert.equal(result.compatible,false);
  assert(!JSON.stringify(result).includes('private sentinel'));
});
test('incompatible gate is visible503 and never calls business handler',()=>{
  schema.setStartupReadiness({startupMode:'code-only',compatible:false});
  let status;schema.startupReadinessGate({},{
    status(s){status=s;return this;},json(v){assert.equal(v.status,'not-ready');},
  },()=>assert.fail('business handler executed'));assert.equal(status,503);
});
test('compatible gate admits request',()=>{
  schema.setStartupReadiness({startupMode:'code-only',compatible:true});
  let admitted=false;schema.startupReadinessGate({}, {},()=>{admitted=true;});assert(admitted);
});
test('digest setting validated independently when supported; rollback has no worker',()=>{
  if(policy.healthDigestEnabled){assert.equal(policy.healthDigestEnabled(config),false);
    assert.throws(()=>policy.healthDigestEnabled({ENABLE_STOCK_HEALTH_DIGEST:'invalid'}));}
  else assert.equal(policy.createStartupPolicy(config).enableStockScheduler,false);
});
