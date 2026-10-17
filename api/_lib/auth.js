import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import crypto from 'crypto';

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'dyna_session';
const AUTH_TOKEN_TTL = parseInt(process.env.AUTH_TOKEN_TTL || '28800', 10);
const AUTH_REFRESH_TTL = parseInt(process.env.AUTH_REFRESH_TTL || '604800', 10);

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET || process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production' || ['1','true'].includes(process.env.REPLIT_DEPLOYMENT))
      throw new Error('Production authentication requires a configured signing secret');
    console.error('FATAL: No AUTH_SECRET, JWT_SECRET, or SESSION_SECRET environment variable set. Generating a temporary secret — sessions will not survive restarts.');
    const tempSecret = crypto.randomBytes(48).toString('hex');
    process.env.AUTH_SECRET = tempSecret;
    return tempSecret;
  }
  return secret;
}

const AUTH_SECRET = getAuthSecret();

const ALLOWED_ORIGINS = (process.env.AUTH_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.length === 0) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

function applyAuthCors(req, res) {
  const origin = req.headers?.get ? req.headers.get('origin') : req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (ALLOWED_ORIGINS.length === 0 && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');
}

function createAuthToken(payload, options = {}) {
  const expiresIn = options.expiresIn || AUTH_TOKEN_TTL;
  return jwt.sign(payload, AUTH_SECRET, { expiresIn });
}

function verifyAuthToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, AUTH_SECRET);
  } catch (error) {
    return null;
  }
}

function setAuthCookie(res, token, options = {}) {
  const maxAge = options.maxAge || AUTH_TOKEN_TTL;
  const secure = options.secure ?? process.env.NODE_ENV === 'production';
  const sameSite = options.sameSite || 'Strict';

  res.setHeader('Set-Cookie', cookie.serialize(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge,
  }));
}

function clearAuthCookie(res) {
  const secure = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', cookie.serialize(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure,
    sameSite: 'Strict',
    path: '/',
    maxAge: 0,
  }));
}

function getTokenFromRequest(req) {
  const rawCookieHeader = req.headers?.get ? req.headers.get('cookie') : req.headers.cookie;
  if (!rawCookieHeader) return null;
  const cookies = cookie.parse(rawCookieHeader);
  return cookies[AUTH_COOKIE_NAME] || null;
}

function sanitizeUser(user) {
  if (!user) return null;
  const parseJsonField = (val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') { try { return JSON.parse(val || '[]'); } catch { return []; } }
    return val || [];
  };
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name || user.fullName,
    email: user.email || null,
    phone: user.phone || null,
    role: user.role,
    branch: user.branch || null,
    branches: parseJsonField(user.branches),
    additional_roles: parseJsonField(user.additional_roles),
    lastLogin: user.last_login || user.lastLogin || null,
    // Metadata can contain hashed reset tokens and private security audit entries.
    mustChangePassword: !!user.must_change_password,
  };
}

const BRANCH_SCOPED_ROLES = new Set(['branch', 'branch_staff', 'branch_sales', 'dispenser', 'branch_manager', 'stock_manager', 'consultant', 'frontdesk']);
const FULL_ACCESS_ROLES = new Set(['admin', 'gm', 'director']);
// Roles that see all branches but must NOT be forced to supply a branch param
// (e.g. Finance needs a full cross-branch view).
const ALL_BRANCH_ROLES = new Set(['finance', 'finance_manager', 'mis', 'super_admin', 'general_manager']);

function getBranchScope(user) {
  if (!user) return { enforced: false, branches: null, requiresBranchParam: false };
  const role = (user.role || user.sub?.role || '').trim().toLowerCase();
  // Full-access admin roles: unrestricted but should specify a branch to avoid
  // dumping every branch's data (requiresBranchParam = true for list endpoints).
  if (FULL_ACCESS_ROLES.has(role)) return { enforced: false, branches: null, requiresBranchParam: true };
  // Finance/MIS/reporting roles: all-branch access without a branch param.
  if (ALL_BRANCH_ROLES.has(role)) return { enforced: false, branches: null, requiresBranchParam: false };
  if (!BRANCH_SCOPED_ROLES.has(role)) return { enforced: false, branches: null, requiresBranchParam: false };

  const parseJsonField = (val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') { try { return JSON.parse(val || '[]'); } catch { return []; } }
    return val || [];
  };

  const primaryBranch = user.branch || null;
  const extraBranches = parseJsonField(user.branches);
  const allBranches = [...new Set([...(primaryBranch ? [primaryBranch] : []), ...extraBranches])].filter(Boolean);

  return { enforced: true, branches: allBranches, primaryBranch, requiresBranchParam: false };
}

export {
  AUTH_COOKIE_NAME,
  AUTH_TOKEN_TTL,
  AUTH_REFRESH_TTL,
  applyAuthCors,
  createAuthToken,
  verifyAuthToken,
  setAuthCookie,
  clearAuthCookie,
  getTokenFromRequest,
  sanitizeUser,
  getBranchScope,
};
