// @vitest-environment node
import {it,expect} from 'vitest';
import {isFreshCredentialLogin} from '../api/services/sessionPolicy.js';
it('only exact credential POST routes bypass stale-session resolution',()=>{
  expect(isFreshCredentialLogin('POST','/api/auth/login')).toBe(true);
  expect(isFreshCredentialLogin('POST','/api/distributor-login')).toBe(true);
  for(const route of ['/api/auth/me','/api/auth/credential-security','/api/auth/logout',
    '/api/auth/login/extra','/api/users','/api/prices','/api/distributor-login-other'])
    expect(isFreshCredentialLogin('POST',route)).toBe(false);
  expect(isFreshCredentialLogin('GET','/api/auth/login')).toBe(false);
});
