// @vitest-environment node
import {it,expect} from 'vitest';
import {defaultSql,defaultParams,defaultScope} from '../scripts/lib/final-default-expression-query.mjs';
it('limits one parameterized SELECT to the exact authorized catalog scope',()=>{
  expect(defaultParams).toEqual(['public','branch_activity_transactions','stock_status',
    'prescription_status','consultation_status','reporting_status']);
  expect(defaultScope).toHaveLength(4);
  expect(defaultSql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|SET|BEGIN|COMMIT|ROLLBACK)\b/i);
  expect(defaultSql).not.toContain('information_schema');
  expect(defaultSql).not.toMatch(/\bFROM\s+(?:public\.)?branch_activity_transactions\b/i);
  expect(defaultSql).not.toMatch(/pg_(?:roles|authid)|current_user|current_database|inet_server/i);
});
it('materializes both mandatory guards and gates expression extraction',()=>{
  expect(defaultSql).toContain('guard AS MATERIALIZED');
  expect(defaultSql).toContain("current_setting('transaction_read_only')='on'");
  expect(defaultSql).toContain('pg_is_in_recovery()=true');
  expect(defaultSql).toContain('WHERE g.allowed AND a.attnum>0');
  expect(defaultSql).toContain('pg_catalog.pg_get_expr(d.adbin,d.adrelid)');
  expect(defaultSql).not.toContain('regexp_replace');
  expect(defaultSql).not.toContain('default_transaction_read_only');
});
