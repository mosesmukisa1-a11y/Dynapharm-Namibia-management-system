import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const script=new URL('./post-merge.sh',import.meta.url).pathname;
test('automatic merge hook only syntax checks and never installs migrates or builds',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'merge-hook-test-'));
  try {
    await fs.writeFile(path.join(temp,'node'),'#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS"\n[ "$1" = "--check" ]\n',{mode:0o700});
    await fs.writeFile(path.join(temp,'npm'),'#!/bin/sh\nexit 99\n',{mode:0o700});
    const calls=path.join(temp,'calls');
    const result=spawnSync('/bin/bash',[script],{cwd:temp,env:{PATH:temp,CALLS:calls},encoding:'utf8'});
    assert.equal(result.status,0);
    const lines=(await fs.readFile(calls,'utf8')).trim().split('\n');
    assert.equal(lines.length,4);
    assert(lines.every(s=>s.startsWith('--check ')));
    assert(result.stdout.includes('Frontend dist may be stale'));
    for(const marker of [{NODE_ENV:'production'},{REPLIT_DEPLOYMENT:'true'}]){
      await fs.rm(calls);
      const blocked=spawnSync('/bin/bash',[script],{cwd:temp,env:{PATH:temp,CALLS:calls,...marker}});
      assert.equal(blocked.status,1);
      assert.equal(await fs.stat(calls).then(()=>true,()=>false),false);
      await fs.writeFile(calls,'');
    }
  } finally {await fs.rm(temp,{recursive:true,force:true});}
});
test('failed syntax check aborts immediately',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'merge-hook-fail-'));
  try {
    await fs.writeFile(path.join(temp,'node'),'#!/bin/sh\nprintf "call\\n" >> "$CALLS"\nexit 3\n',{mode:0o700});
    const calls=path.join(temp,'calls');
    const result=spawnSync('/bin/bash',[script],{cwd:temp,env:{PATH:temp,CALLS:calls},encoding:'utf8'});
    assert.equal(result.status,3);
    assert.equal((await fs.readFile(calls,'utf8')).trim(),'call');
    assert(!result.stdout.includes('source checks complete'));
  } finally {await fs.rm(temp,{recursive:true,force:true});}
});
