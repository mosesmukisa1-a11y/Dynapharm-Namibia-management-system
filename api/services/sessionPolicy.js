// A stale cookie must not prevent authenticating fresh credentials. This does not
// grant access: these exact handlers validate password, active state and branch.
export function isFreshCredentialLogin(method,routePath) {
  return method==='POST'&&['/api/auth/login','/api/distributor-login'].includes(routePath);
}
