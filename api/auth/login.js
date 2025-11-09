import bcrypt from 'bcryptjs';
import { getOne, query } from '../db.js';
import {
  applyAuthCors,
  createAuthToken,
  setAuthCookie,
  sanitizeUser
} from '../_lib/auth.js';

async function parseRequestBody(req) {
  if (typeof req.json === 'function') {
    return req.json();
  }

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

    const user = await getOne(
      `SELECT id, username, password_hash, role, full_name, email, phone, branch, branches, is_active, metadata, last_login
         FROM users WHERE username = $1`,
      [username]
    );

    if (!user || user.is_active === false) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      branch: user.branch || null,
      branches: user.branches || [],
    };

    const token = createAuthToken(payload);
    setAuthCookie(res, token);

    await query('UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);

    return res.status(200).json({ success: true, user: sanitizeUser(user) });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
