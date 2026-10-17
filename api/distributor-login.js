import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./services/queryDescriptors.js";import { comparePassword, sessionVersion, consumeTemporaryLogin } from './services/credentialSecurity.js';
import {
  applyAuthCors,
  createAuthToken,
  setAuthCookie,
  sanitizeUser } from
'./_lib/auth.js';
import { getOne, query } from './db.js';

async function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object') {
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

function normalizeBranches(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
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
    const distributorCode = (body?.distributorCode || '').toString().trim().toUpperCase();
    const password = body?.password || '';

    if (!distributorCode || !password) {
      return res.status(400).json({ error: 'Distributor code and password are required' });
    }

    const username = distributorCode.toLowerCase();
    const user = await __qd_executePlan(getOne, __qd_registeredPlan("api/distributor-login.js:70:0"),



    [username]);


    if (!user || user.is_active === false || user.role && user.role !== 'distributor') {
      return res.status(401).json({ error: 'Invalid distributor credentials' });
    }

    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid distributor credentials' });
    }
    if (user.must_change_password && !(await consumeTemporaryLogin(user.id, user.password_hash)))
    return res.status(401).json({ error: 'Temporary sign-in already used. Request a new reset if your password-change session is unavailable.' });

    const payload = {
      sv: sessionVersion(user),
      sub: user.id,
      username: user.username,
      fullName: user.full_name || user.username,
      role: user.role || 'distributor',
      branch: user.branch || null,
      branches: normalizeBranches(user.branches)
    };

    const token = createAuthToken(payload);
    setAuthCookie(res, token);

    await __qd_executePlan(query, __qd_registeredPlan("api/distributor-login.js:100:1"), [user.id]);

    return res.status(200).json({
      success: true,
      token,
      expiresAt: null,
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('Distributor login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
