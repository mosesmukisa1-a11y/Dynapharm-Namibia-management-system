import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "./services/queryDescriptors.js";import bcrypt from 'bcryptjs';
import { query, getMany, getOne, withRequestTransaction } from './db.js';
import { applyAuthCors, sanitizeUser } from './_lib/auth.js';
import { normalizeBranchSlug, normalizeBranchArray } from './_lib/branchUtils.js';
import { ensureDistributorsTable } from './distributors.js';
import { hashPassword, metadataOf } from './services/credentialSecurity.js';

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
    // Security metadata is never part of the staff directory response.
    distributor_id: user.distributor_id || null,
    distributor_branch: user.distributor_branch || null
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
    const user = await __qd_executePlan(getOne, __qd_registeredPlan("api/users.js:80:0"), [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(200).json(buildUserResponse(user));
  }

  if (username) {
    const user = await __qd_executePlan(getOne, __qd_registeredPlan("api/users.js:88:1"), [username]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(200).json(buildUserResponse(user));
  }

  let rows;
  try {
    await ensureDistributorsTable();
    rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/users.js:99:2"),







    []);

  } catch (_) {
    rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/users.js:109:3"), []);
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

  const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/users.js:124:4"), [username]);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const branches = normalizeBranchArray(parseBranches(body.branches));
  const passwordHash = await hashPassword(password);
  const id = body.id || generateUserId();
  const normalizedBranch = normalizeBranchSlug(body.branch);

  const result = await __qd_executePlan(query, __qd_registeredPlan("api/users.js:135:5"),










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
  JSON.stringify(body.metadata || {})]);



  return res.status(201).json(buildUserResponse(result.rows[0]));
}

async function handlePut(req, res) {
  const body = await parseRequestBody(req);
  const id = body?.id;

  if (!id) {
    return res.status(400).json({ error: 'User id is required' });
  }

  const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/users.js:172:6"), [id]);
  if (!existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  const updates = [];
  const params = [];

  if (body.username) {
    updates.push(__qd_registeredPlan("api/users.js:181:7", [updates.length + 1]));
    params.push(body.username.toLowerCase());
  }

  if (body.password) {
    return res.status(400).json({ error: 'Use the audited one-time credential reset procedure' });
  }

  if (body.role) {
    updates.push(__qd_registeredPlan("api/users.js:190:8", [updates.length + 1]));
    params.push(body.role.toLowerCase());
  }

  if (body.fullName || body.full_name) {
    updates.push(__qd_registeredPlan("api/users.js:195:9", [updates.length + 1]));
    params.push(body.fullName || body.full_name);
  }

  if (body.email !== undefined) {
    updates.push(__qd_registeredPlan("api/users.js:200:10", [updates.length + 1]));
    params.push(body.email);
  }

  if (body.phone !== undefined) {
    updates.push(__qd_registeredPlan("api/users.js:205:11", [updates.length + 1]));
    params.push(body.phone);
  }

  if (body.branch !== undefined) {
    const normalizedBranch = normalizeBranchSlug(body.branch);
    if (normalizedBranch) {
      updates.push(__qd_registeredPlan("api/users.js:212:12", [updates.length + 1]));
      params.push(normalizedBranch);
    } else if (body.branch === '' || body.branch === null) {
      updates.push(__qd_registeredPlan("api/users.js:215:13", [updates.length + 1]));
      params.push(null);
    }
  }

  if (body.branches !== undefined) {
    const normalizedBranches = normalizeBranchArray(parseBranches(body.branches));
    if (normalizedBranches.length > 0) {
      updates.push(__qd_registeredPlan("api/users.js:223:14", [updates.length + 1]));
      params.push(JSON.stringify(normalizedBranches));
    } else if (body.branches !== undefined && Array.isArray(body.branches) && body.branches.length === 0) {
      updates.push(__qd_registeredPlan("api/users.js:226:15", [updates.length + 1]));
      params.push(JSON.stringify([]));
    }
  }

  if (body.isActive !== undefined) {
    updates.push(__qd_registeredPlan("api/users.js:232:16", [updates.length + 1]));
    params.push(Boolean(body.isActive));
  }

  if (body.mustChangePassword !== undefined) {
    if (existing.must_change_password && body.mustChangePassword !== true)
    return res.status(400).json({ error: 'The account owner must complete the password change' });
    updates.push(__qd_registeredPlan("api/users.js:239:17", [updates.length + 1]));
    params.push(Boolean(body.mustChangePassword));
  }

  if (body.metadata !== undefined) {
    const protectedMetadata = metadataOf(existing);
    const proposed = body.metadata;
    if (!proposed || typeof proposed !== 'object' || Array.isArray(proposed))
    return res.status(400).json({ error: 'Invalid metadata' });
    const merged = { ...proposed };
    for (const key of ['sessionVersion', 'passwordReset', 'credentialAudit', 'temporaryLoginConsumed']) {
      delete merged[key];
      if (protectedMetadata[key] !== undefined) merged[key] = protectedMetadata[key];
    }
    updates.push(__qd_registeredPlan("api/users.js:253:18", [updates.length + 1]));
    params.push(JSON.stringify(merged));
  }

  if (body.additional_roles !== undefined) {
    const roles = Array.isArray(body.additional_roles) ? body.additional_roles : [];
    updates.push(__qd_registeredPlan("api/users.js:259:19", [updates.length + 1]));
    params.push(JSON.stringify(roles));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(id);

  const result = await __qd_executePlan(query, __qd_registeredPlan("api/users.js:270:20", [__qd_joinPlans(

    updates, "comma"),
  params.length]),

  params);


  const updatedUser = result.rows[0];

  // If this is a distributor user and the branch is being updated, sync to distributors table
  if (body.branch !== undefined && (updatedUser?.role === 'distributor' || existing?.role === 'distributor')) {
    const normalizedBranch = normalizeBranchSlug(body.branch);
    const branchValue = normalizedBranch || (body.branch === '' || body.branch === null ? null : undefined);
    if (branchValue !== undefined) {
      try {
        await __qd_executePlan(query, __qd_registeredPlan("api/users.js:286:21"),


        [branchValue, updatedUser.username || existing.username]);

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

  const result = await __qd_executePlan(query, __qd_registeredPlan("api/users.js:307:22"), [id]);
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
      return await withRequestTransaction(() => handlePut(req, res));
    }

    if (req.method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      return await handleDelete(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal server error' });
  }
}
