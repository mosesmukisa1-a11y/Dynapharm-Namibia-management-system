// @vitest-environment node
import {it,expect} from 'vitest';
import {scope,queries,querySpec,assertWindow,assertReadOnlySession,sanitizeMetadata}
  from '../scripts/lib/production-schema-policy.mjs';
it('catalog protocol refuses arbitrary SQL, unrelated objects and other users columns',()=>{
  expect(()=>querySpec('SELECT 1',scope[0])).toThrow();
  for(const object of [{schema:'public',table:'users',column:null},
    {schema:'public',table:'users',column:'password_hash'},
    {schema:'other',table:'branches',column:null},
    {schema:'public',table:'branches;DROP TABLE users',column:null}])
    expect(()=>querySpec('columns',object)).toThrow();
  expect(()=>querySpec('partitions',scope[3])).toThrow();
});
it('all catalog queries are fixed with bound scope and never read business relations',()=>{
  for(const id of Object.keys(queries)){
    const spec=querySpec(id,scope[0]);
    expect(spec.text).not.toMatch(/SELECT\s+\*/i);
    expect(spec.text).not.toMatch(/(?:FROM|JOIN)\s+public\./i);
    expect(spec.text).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/i);
    expect(spec.text).toContain('$1');expect(spec.text).toContain('$2');expect(spec.text).toContain('$3');
    expect(spec.values).toEqual(['public','branches',null]);
  }
});
it('window expires at the exact threshold and cannot be lengthened',()=>{
  const a={startsAt:'2026-10-17T11:00:00Z',expiresAt:'2026-10-17T13:00:00Z'};
  expect(()=>assertWindow(a,Date.parse('2026-10-17T12:59:59.999Z'))).not.toThrow();
  expect(()=>assertWindow(a,Date.parse(a.expiresAt))).toThrow();
  expect(()=>assertWindow({...a,expiresAt:'2026-10-17T14:00:00Z'},Date.parse(a.startsAt))).toThrow();
});
it('requires both read-only flags and positive bounded statement/lock timeouts',()=>{
  const row={session_read_only:'on',transaction_read_only:'on',statement_timeout:'4s',lock_timeout:'500ms'};
  expect(()=>assertReadOnlySession(row)).not.toThrow();
  for(const delta of [{session_read_only:'off'},{transaction_read_only:'off'},
    {statement_timeout:'0'},{lock_timeout:'0'},{lock_timeout:'2s'}])
    expect(()=>assertReadOnlySession({...row,...delta})).toThrow();
});
it('redacts unreviewed SQL literal defaults rather than leaking or guessing',()=>{
  const result=sanitizeMetadata([{column_default:"'unknown_literal'::text",definition:"CHECK (status = 'active')"}]);
  expect(result.redactions).toBe(1);
  expect(result.metadata[0].column_default).toBe("'[REDACTED_LITERAL]'::text");
  expect(result.metadata[0].definition).toBe("CHECK (status = 'active')");
  for(const column_default of ["E'unknown\\\\\\'literal'::text","$$unknown_literal$$::text"]){
    const safe=sanitizeMetadata({column_default});
    expect(safe.redactions).toBeGreaterThan(0);
    expect(safe.metadata.column_default).not.toContain('unknown');
  }
});
