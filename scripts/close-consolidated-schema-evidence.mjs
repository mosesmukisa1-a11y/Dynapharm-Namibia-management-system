// Offline only: immutable provider CSV envelope -> exact schema evidence.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {consolidatedTables} from './lib/consolidated-schema-query.mjs';
const out='generated-artifacts/production-schema-consolidated-final';
const receipt=JSON.parse(await fs.readFile(out+'/operation-receipt.json','utf8'));
assert.equal(receipt.success,true);
const csv=receipt.output.trim().split('\n').slice(1).join('\n');
const text=csv.startsWith('"')?csv.slice(1,-1).replaceAll('""','"'):csv;
assert(!/postgres(?:ql)?:\/\/|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|re_[A-Za-z0-9]{25,}/.test(text),
  'Unsafe expression evidence requires blocked offline review');
const evidence=JSON.parse(text),journal=JSON.parse(await fs.readFile(out+'/production-read-verification.json','utf8'));
assert.equal(evidence.guard.allowed,true);assert.equal(evidence.guard.transaction_read_only,'on');
assert.equal(evidence.guard.in_recovery,true);assert.equal(journal.invocationCount,1);
assert.equal(journal.accessEnded,true);assert.equal(journal.additionalManagedCallsAllowed,false);
assert.deepEqual(evidence.tables.map(t=>t.table).sort(),[...consolidatedTables].sort());
assert(evidence.tables.every(t=>t.schema==='public'));
const save=(n,d)=>fs.writeFile(out+'/'+n,JSON.stringify(d,null,2)+'\n');
for(const t of evidence.tables)await save(t.table+'.schema.json',{guard:evidence.guard,...t});
await save('notify-change.schema.json',{guard:evidence.guard,requestedFunction:'public.notify_change',
  requestedFunctionExists:evidence.functions.some(f=>f.schema==='public'&&f.name==='notify_change'),
  functions:evidence.functions});
await save('dependency-graph.json',{guard:evidence.guard,dependencies:evidence.dependencies,
  limitation:'pg_depend is direct catalog linkage, not a complete PL/pgSQL dynamic-body dependency proof. Bodies require offline review.'});
await fs.writeFile(out+'/inspection-summary.md',`# Consolidated schema-authority capture

Status: BLOCKED - DO NOT PUBLISH (release gate not evaluated by capture).

One fixed parameterized managed catalog SELECT completed at ${evidence.guard.captured_at}.
Active transaction_read_only=on, pg_is_in_recovery=true. Seven authorized
table metadata sections; ${evidence.functions.length} directly authorized function definitions.
No business rows read. No production modification. Access ended; no replay or
additional managed call permitted. Physical pooled socket teardown is not independently observed.

Exact defaults and function bodies are owner-authorized schema metadata and are
retained without executing them against production. Direct dependencies are
identities, not authority to capture their definitions or use production rows.

${evidence.tables.map(t=>`- public.${t.table}: exists=${t.exists}, columns=${t.columns.length}, constraints=${t.constraints.length}, indexes=${t.indexes.length}, triggers=${t.triggers.length}, sequences=${t.sequences.length}`).join('\n')}
`);
console.log(JSON.stringify({guard:evidence.guard,tables:evidence.tables.map(t=>({name:t.table,exists:t.exists,
  columns:t.columns.length,triggers:t.triggers.length,sequences:t.sequences.length})),
functions:evidence.functions.map(f=>({schema:f.schema,name:f.name,language:f.language})),
directDependencies:evidence.dependencies.length}));
