import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { getOne, query } from '../db.js';
import {
  applyAuthCors,
  getTokenFromRequest,
  verifyAuthToken,
  sanitizeUser } from
'../_lib/auth.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';
import { validSession } from '../services/credentialSecurity.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = getTokenFromRequest(req);
    const decoded = verifyAuthToken(token);

    if (!decoded?.sub) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await __qd_executePlan(getOne, __qd_registeredPlan("api/auth/me.js:31:0"),


    [decoded.sub]);


    if (!validSession(user, decoded)) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const normalizedBranch = normalizeBranchSlug(user.branch);
    if (normalizedBranch && normalizedBranch !== user.branch) {
      await __qd_executePlan(query, __qd_registeredPlan("api/auth/me.js:42:1"), [normalizedBranch, user.id]);
      user.branch = normalizedBranch;
    }

    return res.status(200).json({ success: true, user: sanitizeUser(user) });
  } catch (error) {
    console.error('Session lookup failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
}
