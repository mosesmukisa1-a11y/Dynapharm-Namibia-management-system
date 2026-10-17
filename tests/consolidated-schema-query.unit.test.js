import {describe,it,expect} from 'vitest';
import {consolidatedSql,consolidatedParams} from '../scripts/lib/consolidated-schema-query.mjs';
import {schemaDigest} from '../scripts/lib/consolidated-contract.mjs';
describe('one-operation consolidated schema authority',()=>{
  it('binds exactly seven tables and one function name',()=>{
    expect(consolidatedParams).toEqual(['public','products','product_images','file_uploads',
      'field_program_requests','hr_staff_change_requests','hr_leave_requests','stock_batches','notify_change']);
    expect(consolidatedSql).toContain('guard AS MATERIALIZED');
    expect(consolidatedSql).toContain("current_setting('transaction_read_only')='on'");
    expect(consolidatedSql).toContain('pg_is_in_recovery()=true');
  });
  it('reads catalog sources, never business rows, owners, privileges or sequence state',()=>{
    expect(consolidatedSql).not.toMatch(/\b(?:SET LOCAL|BEGIN|COMMIT|ROLLBACK|CREATE TABLE|INSERT INTO|UPDATE\s+\w+\s+SET|pg_advisory|pg_authid|pg_shdepend|last_value|proowner|proacl)\b/i);
    for(const match of consolidatedSql.matchAll(/(?:JOIN|FROM)\s+([a-z_][a-z_.]*)/gi))
      expect(match[1].startsWith('pg_catalog.')||['guard','requested','targets','columns','constraints',
        'indexes','sequences','triggers','selected_procs','functions','source_objects',
        'dependencies','table_metadata','lateral'].includes(match[1].toLowerCase())).toBe(true);
  });
  it('normalizes only generated RI names, not schema/default/sequence/constraint changes',()=>{
    expect(schemaDigest({triggers:['RI_ConstraintTrigger_a_123']})).toBe(schemaDigest({triggers:['RI_ConstraintTrigger_a_456']}));
    expect(schemaDigest({default:'0'})).not.toBe(schemaDigest({default:'1'}));
    expect(schemaDigest({nullable:true})).not.toBe(schemaDigest({nullable:false}));
  });
});
