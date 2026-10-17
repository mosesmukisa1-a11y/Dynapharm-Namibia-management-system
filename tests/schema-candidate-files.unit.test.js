// @vitest-environment node
import {it,expect} from 'vitest';
import {eligibleUntrackedSchemaSource,readVerifiedCandidateFiles} from '../scripts/lib/schema-candidate-files.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
it.each([
  ['migrations/036_canonical_branches.sql',true],
  ['backend/create_delivery_tables.sql',true],
  ['api/example.js',true],
  ['attached_assets/example.sql',false],
  ['generated-artifacts/example.sql',false],
  ['.local/skills/example.sql',false]
])('untracked canonical candidate policy: %s',(file,expected)=>{
  expect(eligibleUntrackedSchemaSource(file)).toBe(expected);
});
it('verifies a source-only candidate and fails on tampering/traversal without needing Git',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'schema-source-contract-'));
  try{
    expect(await readVerifiedCandidateFiles(root)).toBeNull();
    await fs.mkdir(root+'/migrations');
    const source='-- synthetic source inventory probe, no business schema';
    await fs.writeFile(root+'/migrations/probe.sql',source);
    await fs.writeFile(root+'/.verified-candidate-source.json',JSON.stringify({
      files:{'migrations/probe.sql':createHash('sha256').update(source).digest('hex')}}));
    expect(await readVerifiedCandidateFiles(root)).toEqual(['migrations/probe.sql']);
    await fs.appendFile(root+'/migrations/probe.sql','changed');
    await expect(readVerifiedCandidateFiles(root)).rejects.toThrow('hash mismatch');
    await fs.writeFile(root+'/.verified-candidate-source.json',JSON.stringify({files:{'../outside.sql':'a'.repeat(64)}}));
    await expect(readVerifiedCandidateFiles(root)).rejects.toThrow('Unsafe');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
