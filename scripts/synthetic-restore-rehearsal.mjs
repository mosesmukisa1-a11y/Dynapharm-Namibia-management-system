// Reads ONLY the three checked-in schema files. No environment/credential reads.
import {readFile} from 'node:fs/promises';
import {rehearse} from './lib/synthetic-restore-rehearsal.mjs';
const schemas = {};
for (const name of ['b2-backup-manifest.schema.json', 'b2-backup-set.schema.json', 'b2-authorized-object-manifest.schema.json']) {
  schemas[name] = JSON.parse(await readFile(new URL(`../docs/schemas/${name}`, import.meta.url), 'utf8'));
}
const result = await rehearse({args: process.argv.slice(2), schemas});
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === 'PASS' ? 0 : 1;
