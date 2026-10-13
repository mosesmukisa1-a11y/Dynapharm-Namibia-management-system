import {getBranchScope} from '../_lib/auth.js';
import {branchSearchTerms} from '../_lib/branchUtils.js';
export const clinicalRoles = ['consultant'];
export const historyRoles = ['consultant','frontdesk','admin'];
export function canFileHistory(user) { return ['frontdesk','admin'].includes(user?.role); }
export function deny(message, statusCode=403) { throw Object.assign(new Error(message),{statusCode}); }
export function historyAccess(user, branch) {
  if (!user) deny('Authentication required',401);
  if (!historyRoles.includes(user.role)) deny('Client history is restricted to Front Desk and Consultants');
  // Admin already has cross-branch Front Desk access. The selected persisted
  // client supplies scope; never trust a branch or actor supplied in the body.
  if(user.role==='admin' && branch)return;
  const scope=getBranchScope(user);
  if (!branch || !scope.branches?.some(b=>branchSearchTerms(b).includes(branch))) deny('Client branch is outside your assigned scope');
}
