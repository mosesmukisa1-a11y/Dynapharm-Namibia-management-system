import {describe,it,expect} from 'vitest';
import {assessOfflinePreflight} from '../scripts/lib/offline-rollout-preflight.mjs';
const a='a'.repeat(64),b='b'.repeat(64);
const plan={sourceHashes:{migration:a},schemaFingerprints:{object:b}};
describe('non-executing offline rollout preflight',()=>{
  it('matches exact contracts without granting access or execution',()=>{
    expect(assessOfflinePreflight(plan,plan)).toMatchObject({
      checksPassed:true,sourceMatch:true,schemaMatch:true,executionAllowed:false,productionAccessAuthorized:false,
    });
  });
  it.each([
    {},{sourceHashes:{},schemaFingerprints:{object:b}},
    {sourceHashes:{migration:b},schemaFingerprints:{object:b}},
    {sourceHashes:{migration:a},schemaFingerprints:{}},
    {sourceHashes:{migration:a},schemaFingerprints:{object:a}},
    {sourceHashes:{migration:a},schemaFingerprints:{object:b,extra:a}},
    {sourceHashes:{migration:a,extra:b},schemaFingerprints:{object:b}},
    {sourceHashes:{migration:a},schemaFingerprints:{object:'not-a-fingerprint'}},
  ])('fails closed on changed, missing or additional evidence %#',observation=>{
    expect(assessOfflinePreflight(plan,observation)).toMatchObject({checksPassed:false,executionAllowed:false});
  });
  it('does not evaluate getters or accept inherited/prototype evidence',()=>{
    let read=false;
    const getter={};Object.defineProperty(getter,'migration',{enumerable:true,get(){read=true;return a;}});
    for(const sourceHashes of [getter,Object.create({migration:a}),{...plan.sourceHashes,__proto__:{extra:b}}])
      expect(assessOfflinePreflight(plan,{sourceHashes,schemaFingerprints:plan.schemaFingerprints}).checksPassed).toBe(false);
    expect(read).toBe(false);
  });
});
