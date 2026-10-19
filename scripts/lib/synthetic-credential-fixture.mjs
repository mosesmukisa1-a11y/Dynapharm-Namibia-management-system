// TEST ONLY. Public deterministic canaries, never a credential source.
// No credential/environment-value, filesystem, network or retained-state inputs.
// The sole environment check is a fail-closed test-mode guard.
function requireTestMode() {
  if (process.env.NODE_ENV !== 'test') throw Error('SYNTHETIC_FIXTURE_TEST_MODE_REQUIRED');
}
export function syntheticCredential(label = 'default') {
  requireTestMode();
  if (!/^[a-z0-9-]{1,64}$/.test(label)) throw Error('INVALID_SYNTHETIC_LABEL');
  return ['SYNTHETIC', 'NOT', 'AUTHENTICATION', label, '00000000'].join('_');
}
export function syntheticCredentialUrl({local = false, sslmode} = {}) {
  requireTestMode();
  const url = new URL('postgresql://' + (local ? '127.0.0.1:15432' : 'source.invalid') +
    '/b2_backup_test_0123456789abcdef0123456789abcdef');
  url.username = 'synthetic';
  url.password = syntheticCredential('uri');
  if (local) url.searchParams.set('sslmode', 'disable');
  if (sslmode !== undefined) url.searchParams.set('sslmode', sslmode);
  return url.href;
}
