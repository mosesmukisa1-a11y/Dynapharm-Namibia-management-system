import bcrypt from 'bcryptjs';
import { query, getMany, getOne } from './db.js';
import { applyAuthCors, sanitizeUser } from './_lib/auth.js';
import { normalizeBranchSlug, normalizeBranchArray } from './_lib/branchUtils.js';
import { ensureDistributorsTable } from './distributors.js';

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
  const isActive = user.is_active ?? true;
  return {
    ...sanitized,
    full_name: user.full_name || user.fullName || sanitized.fullName || null,
    is_active: isActive,
    isActive,
    mustChangePassword: user.must_change_password ?? false,
    hasPassword: Boolean(user.password_hash),
    metadata: user.metadata || null,
    distributor_id: user.distributor_id || null,
    distributor_branch: user.distributor_branch || null,
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

  let rows;
  try {
    await ensureDistributorsTable();
    rows = await getMany(
      `SELECT u.*,
              COALESCE(u.full_name, d.distributor_name) AS full_name,
              d.id AS distributor_id,
              d.branch AS distributor_branch
       FROM users u
       LEFT JOIN distributors d ON LOWER(d.distributor_code) = LOWER(u.username) AND u.role = 'distributor'
       ORDER BY u.created_at DESC`,
      []
    );
  } catch (_) {
    rows = await getMany('SELECT * FROM users ORDER BY created_at DESC', []);
  }
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

  const branches = normalizeBranchArray(parseBranches(body.branches));
  const passwordHash = await bcrypt.hash(password, 10);
  const id = body.id || generateUserId();
  const normalizedBranch = normalizeBranchSlug(body.branch);

  const result = await query(
    `INSERT INTO users (
       id, username, password_hash, role, full_name, email, phone,
       branch, branches, is_active, must_change_password, metadata, created_at, updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9::jsonb, COALESCE($10::boolean, TRUE), COALESCE($11::boolean, FALSE),
       $12::jsonb, NOW(), NOW()
     )
     RETURNING *`,
    [
      id,
      username.toLowerCase(),
      passwordHash,
      role.toLowerCase(),
      body.fullName || body.full_name || null,
      body.email || null,
      body.phone || null,
      normalizedBranch,
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
    const normalizedBranch = normalizeBranchSlug(body.branch);
    if (normalizedBranch) {
      updates.push(`branch = $${updates.length + 1}`);
      params.push(normalizedBranch);
    } else if (body.branch === '' || body.branch === null) {
      updates.push(`branch = $${updates.length + 1}`);
      params.push(null);
    }
  }

  if (body.branches !== undefined) {
    const normalizedBranches = normalizeBranchArray(parseBranches(body.branches));
    if (normalizedBranches.length > 0) {
      updates.push(`branches = $${updates.length + 1}::jsonb`);
      params.push(JSON.stringify(normalizedBranches));
    } else if (body.branches !== undefined && Array.isArray(body.branches) && body.branches.length === 0) {
      updates.push(`branches = $${updates.length + 1}::jsonb`);
      params.push(JSON.stringify([]));
    }
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

  if (body.additional_roles !== undefined) {
    const roles = Array.isArray(body.additional_roles) ? body.additional_roles : [];
    updates.push(`additional_roles = $${updates.length + 1}::jsonb`);
    params.push(JSON.stringify(roles));
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

  const updatedUser = result.rows[0];

  // If this is a distributor user and the branch is being updated, sync to distributors table
  if (body.branch !== undefined && (updatedUser?.role === 'distributor' || existing?.role === 'distributor')) {
    const normalizedBranch = normalizeBranchSlug(body.branch);
    const branchValue = normalizedBranch || (body.branch === '' || body.branch === null ? null : undefined);
    if (branchValue !== undefined) {
      try {
        await query(
          `UPDATE distributors SET branch = $1, updated_at = NOW()
           WHERE LOWER(distributor_code) = LOWER($2)`,
          [branchValue, updatedUser.username || existing.username]
        );
      } catch (syncErr) {
        console.warn('[users] Failed to sync branch to distributors table:', syncErr?.message);
      }
    }
  }

  return res.status(200).json(buildUserResponse(updatedUser));
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

function requireAdmin(req, res) {
  const role = (req.user?.role || '').toLowerCase();
  if (role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return await handleGet(req, res);
    }

    if (req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      return await handlePost(req, res);
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      if (!requireAdmin(req, res)) return;
      return await handlePut(req, res);
    }

    if (req.method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      return await handleDelete(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Users API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

