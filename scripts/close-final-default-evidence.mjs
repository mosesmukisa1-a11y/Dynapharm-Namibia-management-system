// Offline CSV-envelope decoding and scope validation. No database client.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {defaultScope} from './lib/final-default-expression-query.mjs';
const out='generated-artifacts/production-schema-defaults-final';
const receipt=JSON.parse(await fs.readFile(out+'/operation-receipt.json','utf8'));
assert.equal(receipt.success,true);
const csv=receipt.output.trim().split('\n').slice(1).join('\n');
const text=csv.startsWith('"')?csv.slice(1,-1).replaceAll('""','"'):csv;
const evidence=JSON.parse(text);
assert.equal(evidence.guard.allowed,true);
assert.equal(evidence.guard.transaction_read_only,'on');
assert.equal(evidence.guard.in_recovery,true);
assert.deepEqual(evidence.defaults.map(x=>x.column_name).sort(),[...defaultScope].sort());
assert(evidence.defaults.every(x=>typeof x.default_expression==='string'));
await fs.writeFile(out+'/default-expressions.json',JSON.stringify(evidence,null,2)+'\n');
const journal=JSON.parse(await fs.readFile(out+'/production-read-verification.json','utf8'));
assert.equal(journal.invocationCount,1);assert.equal(journal.accessEnded,true);
await fs.writeFile(out+'/inspection-summary.md',`# Final default-expression capture

One fixed parameterized catalog SELECT completed. Active transaction read-only
was on; recovery was true. Four exact default expressions captured. No business
rows read. No production modification. Access ended and replay prohibited.
Provider physical socket teardown is not independently observable.

${evidence.defaults.map(x=>'- '+x.column_name+': `'+x.default_expression+'`').join('\n')}

Captured at: ${evidence.guard.captured_at}
`);
console.log('Four exact defaults decoded and validated offline; no additional provider call.');
