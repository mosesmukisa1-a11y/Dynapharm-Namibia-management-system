// @vitest-environment node
import {it,expect} from 'vitest';
import {identitySql,requireManagedReadOnly,managedSpec,scope} from '../scripts/lib/managed-schema-policy.mjs';
it('managed renewal requires both exact read-only flags and a sanitized identity',()=>{
  const row={sessionReadOnly:'on',transactionReadOnly:'on',databaseIdentityFingerprint:'a'.repeat(64),
    lockTimeout:'0',statementTimeout:'5s'};
  expect(()=>requireManagedReadOnly(row)).not.toThrow();
  expect(()=>requireManagedReadOnly({...row,sessionReadOnly:'off'})).toThrow();
  expect(()=>requireManagedReadOnly({...row,transactionReadOnly:'off'})).toThrow();
  expect(()=>requireManagedReadOnly({...row,databaseIdentityFingerprint:'invalid'})).toThrow();
});
it('identity has bound fingerprint input and no username/host or configuration mutation',()=>{
  expect(identitySql).toContain('$1::text');
  expect(identitySql).not.toMatch(/\b(?:current_user|session_user|inet_server_addr|set_config|BEGIN|SET)\b/i);
});
it('managed route accepts catalog IDs only and never broadens users scope',()=>{
  expect(()=>managedSpec('begin',scope[0])).toThrow();
  expect(()=>managedSpec('SELECT 1',scope[0])).toThrow();
  expect(()=>managedSpec('columns',{schema:'public',table:'users',column:null})).toThrow();
  expect(managedSpec('columns',scope[3]).values).toEqual(['public','users','additional_roles']);
});
