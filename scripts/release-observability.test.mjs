import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import express from 'express';
import {errorOutputBoundary} from '../api/services/errorOutputBoundary.js';
import {validateReleaseIdentity,loadReleaseIdentity,releaseStatus,releaseStatusHandler} from '../api/services/releaseStatus.js';
import {releaseBinding,injectReleaseIdentity,schemaFile,releaseIdentityBuildPlugin} from './lib/release-package.mjs';
import {compareReleaseStatus,verifyReleaseStatus} from './lib/verify-release-status.mjs';
import {syntheticCredential} from './lib/synthetic-credential-fixture.mjs';

const hash=v=>createHash('sha256').update(v).digest('hex');
const identity={buildDigest:hash(syntheticCredential('archive')),schemaContractDigest:hash(syntheticCredential('schema'))};
const state={startupMode:'code-only',schedulerEnabled:false,workerEnabled:false,ready:true};
const response=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
test('identity validates only exact digest fields and emits finite errors',()=>{
  assert.deepEqual(validateReleaseIdentity(identity),identity);
  for(const bad of [null,{}, {...identity,buildDigest:'bad'}, {...identity,buildDigest:'A'.repeat(64)},
    {...identity,connection:'SYNTHETIC_PRIVATE'}, {...identity,schemaContractDigest:null}]) {
    assert.throws(()=>validateReleaseIdentity(bad),{message:'RELEASE_IDENTITY_INVALID'});
    assert.throws(()=>loadReleaseIdentity({required:true,read:()=>JSON.stringify(bad)}),
      {message:'RELEASE_IDENTITY_REQUIRED'});
  }
  assert.throws(()=>loadReleaseIdentity({required:true,read:()=>{throw Error('SYNTHETIC_PRIVATE');}}),
    {message:'RELEASE_IDENTITY_REQUIRED'});
  assert.throws(()=>loadReleaseIdentity({required:true,read:()=>'{broken'}),
    {message:'RELEASE_IDENTITY_REQUIRED'});
  assert.equal(loadReleaseIdentity({required:false,read:()=>''}),null);
  assert.deepEqual(loadReleaseIdentity({required:true,read:()=>JSON.stringify(identity)}),identity);
});
for(const schedulerEnabled of [false,true])for(const workerEnabled of [false,true])
test(`strict allowlist with scheduler ${schedulerEnabled} worker ${workerEnabled}`,()=>{
  const result=releaseStatus(identity,{...state,schedulerEnabled,workerEnabled,private:'SYNTHETIC_PRIVATE'});
  assert.deepEqual(Object.keys(result),['buildDigest','schemaContractDigest','startupMode',
    'schedulerState','workerState','readiness']);
  assert.equal(result.schedulerState,schedulerEnabled?'enabled':'disabled');
  assert.equal(result.workerState,workerEnabled?'enabled':'disabled');
  assert(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE'));
  assert.throws(()=>releaseStatus(identity,{...state,ready:'SYNTHETIC_PRIVATE'}));
  assert.throws(()=>releaseStatus(identity,{...state,startupMode:'SYNTHETIC_PRIVATE'}));
});
test('public local HTTP endpoint is read-only, sanitized and available before readiness',async()=>{
  const app=express();let current={...state,ready:false};
  app.get('/api/release-status',releaseStatusHandler(identity,()=>current));
  app.use(errorOutputBoundary);
  app.use((_req,res)=>res.sendStatus(404));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try {
    const url=`http://127.0.0.1:${server.address().port}/api/release-status`;
    let r=await fetch(url);assert.equal(r.status,503);
    assert.equal((await r.json()).readiness,'not-ready');
    assert.equal(r.headers.get('cache-control'),'no-store');
    current=state;r=await fetch(url);assert.equal(r.status,200);
    assert.deepEqual(await r.json(),releaseStatus(identity,state));
    assert.equal((await fetch(url,{method:'POST'})).status,404);
    assert.deepEqual(current,state);
  } finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('verifier refuses digest/schema/state mismatches and extra information',()=>{
  const good=releaseStatus(identity,state);
  assert.deepEqual(compareReleaseStatus(good,identity),{status:'PASS'});
  for(const bad of [{...good,buildDigest:hash(syntheticCredential('other'))},{...good,schemaContractDigest:hash(syntheticCredential('other'))},
    {...good,schedulerState:'enabled'},{...good,workerState:'enabled'},{...good,readiness:'not-ready'},
    {...good,startupMode:'legacy'},{...good,private:'SYNTHETIC_PRIVATE'}])
    assert.throws(()=>compareReleaseStatus(bad,identity));
});
test('bounded verifier uses one read-only fetch; no redirects, credentials or raw errors',async()=>{
  let calls=0;
  const result=await verifyReleaseStatus({origin:'https://synthetic.invalid',expected:identity,
    fetchImpl:async(url,options)=>{
      calls++;assert.equal(url.pathname,'/api/release-status');
      assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
      assert.equal(options.credentials,'omit');return response(releaseStatus(identity,state));
    }});
  assert.deepEqual(result,{status:'PASS'});assert.equal(calls,1);
  for(const fetchImpl of [async()=>{throw Error('SYNTHETIC_PRIVATE');},
    async()=>response({private:'SYNTHETIC_PRIVATE'}),async()=>response('x'.repeat(2000)),
    async()=>new Promise(()=>{})]) {
    const fail=await verifyReleaseStatus({origin:'https://synthetic.invalid',expected:identity,timeoutMs:20,fetchImpl});
    assert.deepEqual(fail,{status:'FAIL',code:'RELEASE_VERIFICATION_FAILED'});
  }
  calls=0;
  assert.equal((await verifyReleaseStatus({origin:'http://synthetic.invalid',expected:identity,
    fetchImpl:async()=>{calls++;}})).status,'FAIL');assert.equal(calls,0);
});
test('detached packaging binds exact archive/schema/source; rejects drift and traversal',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'release-fixture-'));
  try {
    const files={};
    for(const name of [schemaFile,'server.js','package-lock.json']) {
      await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});
      const content=syntheticCredential('source')+name;
      await fs.writeFile(path.join(root,name),content);files[name]=hash(content);
    }
    const archive=path.join(root,'fixture.tar');await fs.writeFile(archive,syntheticCredential('archive'));
    const manifest={archiveSha256:identity.buildDigest,files};
    const binding=await releaseBinding(archive,manifest);
    await injectReleaseIdentity(root,binding);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'.release-identity.json'),'utf8')),binding.identity);
    await releaseIdentityBuildPlugin(root).buildStart().then(()=>assert.fail('missing binding accepted'),()=>{});
    await fs.writeFile(path.join(root,'.release-binding.json'),JSON.stringify(binding));
    await releaseIdentityBuildPlugin(root).buildStart();
    await assert.rejects(injectReleaseIdentity(root,{...binding,files:{...files,'../escape':hash(syntheticCredential('other'))}}));
    await fs.writeFile(path.join(root,'server.js'),'changed');
    await assert.rejects(injectReleaseIdentity(root,binding),{message:'RELEASE_SOURCE_MISMATCH'});
    await fs.writeFile(archive,'changed');
    await assert.rejects(releaseBinding(archive,manifest),{message:'RELEASE_ARCHIVE_MISMATCH'});
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
