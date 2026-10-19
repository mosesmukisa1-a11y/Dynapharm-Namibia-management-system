import {createHash} from 'node:crypto';
export const sourceDigest = files => createHash('sha256')
  .update(JSON.stringify(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)))).digest('hex');
export function assertFreshPrerequisites(evidence, files) {
  if(evidence?.status!=='PASS'||evidence.scope!=='CURRENT_PACKAGING_PREREQUISITES'||
    evidence.sourceDigest!==sourceDigest(files)||!Object.keys(files).length)
    throw Error('STALE_PACKAGING_PREREQUISITES');
  for(const file of ['scripts/security-final-clean-gate.mjs',
    'scripts/security-runtime-boundary-audit.mjs','.replit','package-lock.json'])
    if(!/^[a-f0-9]{64}$/.test(files[file]||''))throw Error('MISSING_RELEASE_INPUT');
}
export function assertStagePassed(outcome) {
  if(outcome.exitCode!==0||outcome.signal||outcome.spawnCode)
    throw Error('CLEAN_GATE_STAGE_FAILED');
}
