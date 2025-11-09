import bcrypt from 'bcryptjs';
import { query, getMany, getOne } from './db.js';
import { applyAuthCors, sanitizeUser } from './_lib/auth.js';

function parseBranches(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value || '[]');
    } catch {
      return value.split(',').map((v) => v.trim()).filter(Boolean);
    }
  }
  return [];
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

function buildUserResponse(user) {
  const sanitized = sanitizeUser(user);
  if (!sanitized) return null;
  return {
    ...sanitized,
    password: user.password || null,
    isActive: user.is_active ?? true,
    mustChangePassword: user.must_change_password ?? false,
    metadata: user.metadata || null
  };
}

function generateUserId() {
  return `USR${Date.now()}`;
}

async function handleGet(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const id = url.searchParams.get('id');
  const username = url.searchParams.get('username');

  if (id) {
    const user = await getOne('SELECT * FROM users WHERE id = $1', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(200).json(buildUserResponse(user));
  }

  if (username) {
    const user = await getOne('SELECT * FROM users WHERE username = $1', [username]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(200).json(buildUserResponse(user));
  }

  const rows = await getMany('SELECT * FROM users ORDER BY created_at DESC', []);
  return res.status(200).json(rows.map(buildUserResponse).filter(Boolean));
}

async function handlePost(req, res) {
  const body = await parseRequestBody(req);
  const username = body?.username?.trim();
  const password = body?.password || '';
  const role = body?.role?.trim();

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'username, password, and role are required' });
  }

  const existing = await getOne('SELECT id FROM users WHERE username = $1', [username]);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const branches = parseBranches(body.branches);
  const passwordHash = await bcrypt.hash(password, 10);
  const id = body.id || generateUserId();

  const result = await query(
    `INSERT INTO users (
       id, username, password, password_hash, role, full_name, email, phone,
       branch, branches, is_active, must_change_password, metadata, created_at, updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10::jsonb, COALESCE($11::boolean, TRUE), COALESCE($12::boolean, FALSE),
       $13::jsonb, NOW(), NOW()
     )
     RETURNING *`,
    [
      id,
      username.toLowerCase(),
      password,
      passwordHash,
      role.toLowerCase(),
      body.fullName || body.full_name || null,
      body.email || null,
      body.phone || null,
      body.branch || null,
      JSON.stringify(branches),
      body.isActive,
      body.mustChangePassword,
      JSON.stringify(body.metadata || {})
    ]
  );

  return res.status(201).json(buildUserResponse(result.rows[0]));
}

async function handlePut(req, res) {
  const body = await parseRequestBody(req);
  const id = body?.id;

  if (!id) {
    return res.status(400).json({ error: 'User id is required' });
  }

  const existing = await getOne('SELECT * FROM users WHERE id = $1', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  const updates = [];
  const params = [];

  if (body.username) {
    updates.push(`username = $${updates.length + 1}`);
    params.push(body.username.toLowerCase());
  }

  if (body.password) {
    const hashed = await bcrypt.hash(body.password, 10);
    updates.push(`password = $${updates.length + 1}`);
    params.push(body.password);
    updates.push(`password_hash = $${updates.length + 1}`);
    params.push(hashed);
  }

  if (body.role) {
    updates.push(`role = $${updates.length + 1}`);
    params.push(body.role.toLowerCase());
  }

  if (body.fullName || body.full_name) {
    updates.push(`full_name = $${updates.length + 1}`);
    params.push(body.fullName || body.full_name);
  }

  if (body.email !== undefined) {
    updates.push(`email = $${updates.length + 1}`);
    params.push(body.email);
  }

  if (body.phone !== undefined) {
    updates.push(`phone = $${updates.length + 1}`);
    params.push(body.phone);
  }

  if (body.branch !== undefined) {
    updates.push(`branch = $${updates.length + 1}`);
    params.push(body.branch);
  }

  if (body.branches !== undefined) {
    updates.push(`branches = $${updates.length + 1}::jsonb`);
    params.push(JSON.stringify(parseBranches(body.branches)));
  }

  if (body.isActive !== undefined) {
    updates.push(`is_active = $${updates.length + 1}`);
    params.push(Boolean(body.isActive));
  }

  if (body.mustChangePassword !== undefined) {
    updates.push(`must_change_password = $${updates.length + 1}`);
    params.push(Boolean(body.mustChangePassword));
  }

  if (body.metadata !== undefined) {
    updates.push(`metadata = $${updates.length + 1}::jsonb`);
    params.push(JSON.stringify(body.metadata));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(id);

  const result = await query(
    `UPDATE users
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length}
     RETURNING *`,
    params
  );

  return res.status(200).json(buildUserResponse(result.rows[0]));
}

async function handleDelete(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const id = url.searchParams.get('id');

  if (!id) {
    return res.status(400).json({ error: 'User id is required' });
  }

  const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.status(200).json({ success: true });
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      return await handleGet(req, res);
    }

    if (req.method === 'POST') {
      return await handlePost(req, res);
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      return await handlePut(req, res);
    }

    if (req.method === 'DELETE') {
      return await handleDelete(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Users API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

