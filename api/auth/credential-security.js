import {applyAuthCors, clearAuthCookie} from '../_lib/auth.js';
import {revokeAccountSessions, issuePasswordReset, completePasswordReset,
  changeOwnPassword} from '../services/credentialSecurity.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    let result;
    if (body.action === 'complete-reset')
      result = await completePasswordReset(body.accountId, body.token, body.password);
    else if (body.action === 'issue-reset')
      result = await issuePasswordReset(req.user, body.accountId);
    else if (body.action === 'revoke-sessions')
      result = await revokeAccountSessions(req.user, body.accountIds,
        {dryRun:body.dryRun !== false, reason:body.reason});
    else if (body.action === 'change-own-password') {
      result = await changeOwnPassword(req.user, body.currentPassword, body.password);
      clearAuthCookie(res);
    } else return res.status(400).json({error:'Unknown credential action'});
    return res.status(200).json(result);
  } catch (error) {
    // Do not log request bodies, database parameters, hashes, or tokens.
    return res.status(error.status || 500).json({
      error:error.status ? error.message : 'Credential operation failed'});
  }
}
