import {it,expect} from 'vitest';
import {branchVisitsSql,branchVisitsParams} from '../scripts/lib/branch-visits-schema-query.mjs';
import contract from './fixtures/branch-client-visits-schema-contract.json';
import {schemaDigest} from '../scripts/lib/consolidated-contract.mjs';
it('uses one fixed guarded catalog operation for the authorized table and attached functions only',()=>{
  expect(branchVisitsParams).toEqual(['public','branch_client_visits']);
  expect(branchVisitsSql).toContain('guard AS MATERIALIZED');
  expect(branchVisitsSql).toContain("current_setting('transaction_read_only')='on'");
  expect(branchVisitsSql).toContain('pg_is_in_recovery()=true');
  expect(branchVisitsSql).not.toMatch(/\$[3-9]\b|notify_change|pg_authid|pg_shdepend|last_value|proowner|proacl/);
});
it('pins the readable native schema and detects default, precision, index and missing-column drift',()=>{
  expect(contract.table.columns).toHaveLength(11);
  for(const mutate of [
    t=>t.columns.pop(),t=>t.columns[0].nullable=true,
    t=>t.columns[5].default_expression=null,t=>t.columns[0].native_type='text',
    t=>t.indexes.pop(),t=>t.triggers.push({name:'invented'}),
  ]){
    const changed=structuredClone(contract.table);mutate(changed);
    expect(schemaDigest(changed)).not.toBe(schemaDigest(contract.table));
  }
});
