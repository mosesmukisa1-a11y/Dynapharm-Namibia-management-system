import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import bcrypt from 'bcryptjs';
import { getOne, query } from '../db.js';
import {
  applyAuthCors,
  createAuthToken,
  setAuthCookie,
  sanitizeUser } from
'../_lib/auth.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';
import { comparePassword, sessionVersion, consumeTemporaryLogin } from '../services/credentialSecurity.js';

async function autoClockIn(user) {
  const role = (user.role || '').toLowerCase();
  if (role === 'distributor' || role === 'guest') return;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5);
  const fullName = user.full_name || user.username;
  try {
    const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/auth/login.js:21:0"),

    [fullName, dateStr]);

    if (!existing) {
      const dow = now.getDay();
      if (dow === 0) return;
      const [h, m] = timeStr.split(':').map(Number);
      const mins = h * 60 + m;
      const shiftStart = dow === 6 ? 8 * 60 + 10 : 8 * 60 + 30;
      const subtype = mins > shiftStart ? 'Late' : 'Present';
      await __qd_executePlan(query, __qd_registeredPlan("api/auth/login.js:32:1"),


      [fullName, String(user.id || ''), subtype, dateStr, timeStr]);

    }
  } catch (e) {
    console.warn('[auto-attendance] clock-in failed:', e.message);
  }
}

async function parseRequestBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body || '{}');
      } catch (error) {
        throw new Error('Invalid JSON payload');
      }
    }
    return req.body;
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = await parseRequestBody(req);
    const username = body?.username?.trim();
    const password = body?.password || '';

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await __qd_executePlan(getOne, __qd_registeredPlan("api/auth/login.js:95:2"),


    [username]);


    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (user.is_active === false) {
      return res.status(403).json({ error: 'Your account is pending admin approval. Please wait for the administrator to activate your account.' });
    }

    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (user.must_change_password && !(await consumeTemporaryLogin(user.id, user.password_hash)))
    return res.status(401).json({ error: 'Temporary sign-in already used. Complete the password change in your existing session or request a new reset.' });

    const BRANCH_REQUIRED_ROLES = new Set(['consultant', 'frontdesk', 'dispenser', 'branch_manager']);
    const normalizedBranch = normalizeBranchSlug(user.branch);

    if (!normalizedBranch && BRANCH_REQUIRED_ROLES.has(user.role)) {
      return res.status(403).json({
        error: 'Your account does not have a branch assigned. Please contact your administrator to assign a branch before logging in.'
      });
    }

    if (normalizedBranch && normalizedBranch !== user.branch) {
      await __qd_executePlan(query, __qd_registeredPlan("api/auth/login.js:125:3"), [normalizedBranch, user.id]);
      user.branch = normalizedBranch;
    }

    const payload = {
      sv: sessionVersion(user),
      sub: user.id,
      username: user.username,
      fullName: user.full_name || user.username,
      role: user.role,
      branch: normalizedBranch || null,
      branches: user.branches || []
    };

    const token = createAuthToken(payload);
    setAuthCookie(res, token);

    const previousLastLogin = user.last_login || null;
    await __qd_executePlan(query, __qd_registeredPlan("api/auth/login.js:143:4"), [user.id]);

    autoClockIn(user).catch(() => {});

    const sanitized = sanitizeUser(user);
    sanitized.previousLastLogin = previousLastLogin;

    return res.status(200).json({ success: true, user: sanitized });
  } catch (error) {
    console.error('Login failed internally');
    return res.status(500).json({ error: 'Internal server error' });
  }
}
