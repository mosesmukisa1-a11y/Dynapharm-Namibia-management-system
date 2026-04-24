import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getOne, insert } from '../db.js';
import { applyAuthCors } from '../_lib/auth.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';

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
  'training',
  'trainer',
  'cleaner',
  'security_guard',
  'support_staff',
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
    const email = body?.email?.trim() || null;

    if (!fullName || !dob || !password || !role) {
      return res.status(400).json({ error: 'full_name, dob, password, and role are required' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Use provided username if valid, otherwise generate from full name
    const requestedUsername = (body?.username || '').trim().toLowerCase();
    let username = (requestedUsername && /^[a-z0-9._-]+$/.test(requestedUsername))
      ? requestedUsername
      : generateUsername(fullName);

    if (!username) {
      return res.status(400).json({ error: 'Could not generate username from full_name' });
    }

    const existing = await getOne('SELECT id FROM users WHERE username = $1', [username]);
    if (existing) {
      if (requestedUsername === username) {
        return res.status(409).json({ error: 'Username already taken. Please choose a different username.' });
      }
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

    const position = body?.position?.trim() || null;
    const department = body?.department?.trim() || null;
    const branch = body?.branch?.trim() || null;
    const phone = body?.phone?.trim() || null;
    const idNumber = body?.id_number?.trim() || null;
    const gender = body?.gender?.trim() || null;
    const address = body?.address?.trim() || null;

    const warehouseLocation = body?.warehouse_location?.trim() || null;
    const warehouseRole = body?.warehouse_role?.trim() || null;
    const rawEffectiveBranch = (['stock', 'warehouse'].includes(role) && warehouseLocation) ? warehouseLocation : (branch || null);
    const effectiveBranch = normalizeBranchSlug(rawEffectiveBranch) || rawEffectiveBranch || null;

    const metadata = JSON.stringify({ dob, position, department, branch: effectiveBranch, phone, id_number: idNumber, gender, address, warehouse_location: warehouseLocation, warehouse_role: warehouseRole });

    await insert('users', {
      id,
      username,
      password_hash: passwordHash,
      role,
      full_name: fullName,
      email,
      branch: effectiveBranch,
      is_active: false,
      metadata,
    });

    try {
      const empId = `EMP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await insert('employees', {
        id: empId,
        employee_id: empId,
        user_id: id,
        full_name: fullName,
        role,
        position: position || role,
        department: department || null,
        branch: branch || null,
        phone: phone || null,
        email: email || null,
        hire_date: new Date().toISOString().slice(0, 10),
        employment_status: 'pending',
        address: address || null,
        dob: dob || null,
      });
    } catch (empErr) {
      console.error('Employee record creation (non-critical):', empErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Account created! Pending admin approval before login is enabled.',
      username,
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
