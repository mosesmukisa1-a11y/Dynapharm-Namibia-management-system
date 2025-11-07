import jwt from 'jsonwebtoken';
import cookie from 'cookie';

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'dyna_session';
const AUTH_TOKEN_TTL = parseInt(process.env.AUTH_TOKEN_TTL || '3600', 10); // seconds
const AUTH_REFRESH_TTL = parseInt(process.env.AUTH_REFRESH_TTL || '604800', 10); // seconds (7 days)
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.JWT_SECRET || 'dynapharm-insecure-secret';
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
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name || user.fullName,
    email: user.email || null,
    phone: user.phone || null,
    role: user.role,
    branch: user.branch || null,
    branches: Array.isArray(user.branches)
      ? user.branches
      : typeof user.branches === 'string'
        ? JSON.parse(user.branches || '[]')
        : user.branches || [],
    lastLogin: user.last_login || user.lastLogin || null,
    metadata: user.metadata || null,
  };
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
};
