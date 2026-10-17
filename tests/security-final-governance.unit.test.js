// @vitest-environment node
import {it,expect} from 'vitest';
import {requireAuthoritativeFoundation} from '../scripts/security-final-schema-guard.mjs';
it('missing canonical schema cannot be waived with synthetic test scaffolding',()=>{
  for(const blocked of [['branches'],['users.additional_roles']])
    expect(()=>requireAuthoritativeFoundation({repositoryOnly:true,productionInspected:false,
      parseFailures:[],blocked})).toThrow('SCHEMA_GOVERNANCE_BLOCKED');
  expect(()=>requireAuthoritativeFoundation({repositoryOnly:true,productionInspected:false,
    parseFailures:[{file:'unknown'}],blocked:[]})).toThrow();
});
