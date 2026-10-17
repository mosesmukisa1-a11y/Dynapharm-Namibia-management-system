// Knowledge of email/date of birth is not password-reset authority.
// No account lookup or mutation; use an operator-issued one-time reset.
import {applyAuthCors} from '../_lib/auth.js';
export default function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(403).json({error:'Contact an authorized administrator for a private one-time password reset.'});
}
