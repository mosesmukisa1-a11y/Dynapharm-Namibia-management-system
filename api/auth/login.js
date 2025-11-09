import bcrypt from 'bcryptjs';
import { getOne, query } from '../db.js';
import {
  applyAuthCors,
  createAuthToken,
  setAuthCookie,
  sanitizeUser
} from '../_lib/auth.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = await req.json();
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
    return res.status(500).json({
      error: 'Internal server error',
      details:
        process.env.NODE_ENV === 'production'
          ? error.message || 'unknown'
          : error.stack || error.message || 'unknown'
    });
  }
}
