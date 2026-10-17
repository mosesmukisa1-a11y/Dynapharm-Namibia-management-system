import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
export function requireAuthoritativeFoundation(provenance) {
  if(!provenance?.repositoryOnly||provenance.productionInspected||
    provenance.parseFailures?.length||!Array.isArray(provenance.blocked)||provenance.blocked.length)
    throw new Error('SCHEMA_GOVERNANCE_BLOCKED: repository foundation is incomplete; no database provisioned');
}
export async function assertRepositoryFoundation() {
  await promisify(execFile)(process.execPath,['scripts/security-final-inventory.mjs'],
    {cwd:process.cwd(),maxBuffer:1024*1024});
  requireAuthoritativeFoundation(JSON.parse(await readFile(
    'generated-artifacts/security-remediation-final/schema-provenance.json','utf8')));
}
