import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {syntheticCredential,syntheticCredentialUrl} from './lib/synthetic-credential-fixture.mjs';
test('public deterministic canary cannot incorporate external material',()=>{
  assert.equal(syntheticCredential('uri'),syntheticCredential('uri'));
  assert(syntheticCredential().startsWith(['SYNTHETIC','NOT','AUTHENTICATION'].join('_')));
  for(const value of ['../private','', 'A'.repeat(100), 'postgres://x'])
    assert.throws(()=>syntheticCredential(value));
});
test('URL is credential shaped and reserved by default; local mode is explicitly isolated',()=>{
  const remote=new URL(syntheticCredentialUrl());
  assert.equal(remote.hostname,'source.invalid');
  assert.equal(remote.password,syntheticCredential('uri'));
  const local=new URL(syntheticCredentialUrl({local:true}));
  assert.equal(local.hostname,'127.0.0.1');
  assert.notEqual(local.port,'5432');
  assert(local.pathname.startsWith('/b2_backup_test_'));
  assert.equal(local.searchParams.get('sslmode'),'disable');
});
test('fixture refuses unset and production modes without reading protected inputs',()=>{
  for(const mode of [undefined,'production']) {
    const env = {PATH:process.env.PATH};
    if(mode)env.NODE_ENV=mode;
    const result=spawnSync(process.execPath,['--input-type=module','-e',
      "import {syntheticCredential} from './scripts/lib/synthetic-credential-fixture.mjs'; try { syntheticCredential(); process.exit(2); } catch { process.exit(0); }"],
      {env,stdio:'ignore',timeout:5000});
    assert.equal(result.status,0);
  }
});
