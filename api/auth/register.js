import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getOne, insert } from '../db.js';
import { applyAuthCors } from '../_lib/auth.js';

const VALID_ROLES = [
  'frontdesk',
  'consultant',
  'dispenser',
  'branch_manager',
  'finance',
  'hr_manager',
  'gm',
  'director',
  'mis',
  'stock',
  'warehouse',
];

function generateUsername(fullName) {
  const parts = fullName
    .toLowerCase()
    .trim()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts[parts.length - 1]}`;
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
    const fullName = body?.full_name?.trim();
    const dob = body?.dob?.trim();
    const password = body?.password || '';
    const role = body?.role?.trim()?.toLowerCase();

    if (!fullName || !dob || !password || !role) {
      return res.status(400).json({ error: 'full_name, dob, password, and role are required' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    let username = generateUsername(fullName);
    if (!username) {
      return res.status(400).json({ error: 'Could not generate username from full_name' });
    }

    const existing = await getOne('SELECT id FROM users WHERE username = $1', [username]);
    if (existing) {
      let suffix = 1;
      let candidate = `${username}${suffix}`;
      while (true) {
        const check = await getOne('SELECT id FROM users WHERE username = $1', [candidate]);
        if (!check) {
          username = candidate;
          break;
        }
        suffix++;
        candidate = `${username}${suffix}`;
        if (suffix > 99) {
          return res.status(409).json({ error: 'Username already exists. Please use a different name.' });
        }
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const id = crypto.randomUUID();

    const metadata = JSON.stringify({ dob });

    await insert('users', {
      id,
      username,
      password_hash: passwordHash,
      role,
      full_name: fullName,
      is_active: false,
      metadata,
    });

    return res.status(201).json({
      success: true,
      message: 'Registration pending admin approval',
      username,
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
