// @vitest-environment node
import {it,expect} from 'vitest';
import {finalManagedSql,finalScopeBindings,finalManagedScope} from '../scripts/lib/final-managed-schema-query.mjs';
it('one SELECT requires active read-only and recovery, not session default on',()=>{
  expect(finalManagedSql).toContain("current_setting('transaction_read_only')='on'");
  expect(finalManagedSql).toContain('pg_is_in_recovery()=true');
  expect(finalManagedSql).not.toContain("current_setting('default_transaction_read_only')='on'");
  expect(finalManagedSql).not.toMatch(/\b(?:SET|BEGIN|COMMIT|ROLLBACK|CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\s/i);
  expect(finalManagedSql).not.toMatch(/(?:FROM|JOIN)\s+public\./i);
});
it('scope is fixed and the nonce is bound data only',()=>{
  expect(finalScopeBindings('a'.repeat(32)).slice(1)).toEqual([
    'public','branches','branch_activity_transactions','branch_distributor_profit','users','additional_roles']);
  expect(()=>finalScopeBindings("x'); DROP TABLE users;--")).toThrow();
  expect(finalManagedScope.filter(x=>x.table==='users')).toEqual([
    {schema:'public',table:'users',column:'additional_roles',file:'users-additional-roles.schema.json'}]);
});
it('every raw/safe metadata CTE and final projection references the SQL guard',()=>{
  for(const name of ['columns_raw','columns_safe','constraints_raw','constraints_safe','indexes_raw',
    'indexes_safe','sequences','partitions_raw','partitions_safe']){
    const start=finalManagedSql.indexOf(name+' AS MATERIALIZED');
    const end=finalManagedSql.indexOf('\n),',start);
    const section=finalManagedSql.slice(start,end<0?undefined:end);
    expect(section).toContain('guard g');expect(section).toContain('g.allowed');
  }
  expect(finalManagedSql).toContain("ELSE '[]'::jsonb END");
});
