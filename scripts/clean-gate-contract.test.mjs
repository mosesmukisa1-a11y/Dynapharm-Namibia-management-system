import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertFreshPrerequisites,sourceDigest,assertStagePassed} from './lib/clean-gate-contract.mjs';
const files=Object.fromEntries(['scripts/security-final-clean-gate.mjs',
  'scripts/security-runtime-boundary-audit.mjs','.replit','package-lock.json','server.js'].map(f=>[f,'a'.repeat(64)]));
const proof={status:'PASS',scope:'CURRENT_PACKAGING_PREREQUISITES',sourceDigest:sourceDigest(files)};
test('current exact input set passes',()=>assertFreshPrerequisites(proof,files));
test('historical status without current hash proof rejected',()=>{
  assert.throws(()=>assertFreshPrerequisites({status:'PASS'},files),/STALE/);
});
for(const file of Object.keys(files))test(`drift rejected: ${file}`,()=>{
  assert.throws(()=>assertFreshPrerequisites(proof,{...files,[file]:'b'.repeat(64)}),/STALE/);
});
test('added or missing inputs rejected',()=>{
  assert.throws(()=>assertFreshPrerequisites(proof,{...files,'new.js':'c'.repeat(64)}),/STALE/);
  const copy={...files};delete copy['server.js'];
  assert.throws(()=>assertFreshPrerequisites(proof,copy),/STALE/);
});
for(const outcome of [{exitCode:1},{exitCode:null,signal:'SIGTERM'},{exitCode:null,spawnCode:'ENOENT'}])
  test(`failure stops subsequent stages and finally cleanup runs: ${JSON.stringify(outcome)}`,async()=>{
    const seen=[];
    await assert.rejects(async()=>{
      try{seen.push('first');assertStagePassed(outcome);seen.push('later');}
      finally{seen.push('cleanup');}
    },/CLEAN_GATE_STAGE_FAILED/);
    assert.deepEqual(seen,['first','cleanup']);
  });
