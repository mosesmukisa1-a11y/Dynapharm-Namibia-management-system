import bcrypt from 'bcryptjs';
import { applyAuthCors } from '../_lib/auth.js';
import { getOne, query } from '../db.js';

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

function normalizeMetadata(meta) {
  if (!meta) return {};
  if (typeof meta === 'string') {
    try {
      return JSON.parse(meta) || {};
    } catch (error) {
      return { note: meta };
    }
  }
  if (typeof meta === 'object') return { ...meta };
  return {};
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
    const rawPassword = body?.password;
    if (!rawPassword || typeof rawPassword !== 'string' || rawPassword.trim().length < 8) {
      return res.status(400).json({ error: 'A password of at least 8 characters is required' });
    }

    const normalizedPassword = rawPassword.trim();
    const distributorCodeInput = body?.distributorCode;
    const distributorIdInput = body?.id;

    if (!distributorIdInput && !distributorCodeInput) {
      return res.status(400).json({ error: 'Distributor id or code is required' });
    }

    let distributor = null;
    if (distributorIdInput) {
      distributor = await getOne('SELECT * FROM distributors WHERE id = $1', [distributorIdInput]);
    }
    if (!distributor && distributorCodeInput) {
      distributor = await getOne('SELECT * FROM distributors WHERE distributor_code = $1', [distributorCodeInput]);
    }

    if (!distributor) {
      return res.status(404).json({ error: 'Distributor not found' });
    }

    const normalizedCode = (distributor.distributor_code || distributorCodeInput || '').toString().trim().toUpperCase();
    if (!normalizedCode) {
      return res.status(400).json({ error: 'Distributor code could not be determined' });
    }

    const username = normalizedCode.toLowerCase();
    const passwordHash = await bcrypt.hash(normalizedPassword, 10);
    const existingUser = await getOne('SELECT * FROM users WHERE username = $1', [username]);

    const fullName = distributor.distributor_name || normalizedCode;
    const branch = distributor.branch || null;
    const email = distributor.email || null;
    const phone = distributor.mobile_no || null;
    const branches = branch ? JSON.stringify([branch]) : JSON.stringify([]);
    const metadata = JSON.stringify({ source: 'distributor', linkedDistributor: distributor.id });

    let userId;

    if (existingUser) {
      userId = existingUser.id;
      await query(
        `UPDATE users
           SET password = $1,
               password_hash = $2,
               role = $3,
               full_name = COALESCE($4, full_name),
               email = COALESCE($5, email),
               phone = COALESCE($6, phone),
               branch = COALESCE($7, branch),
               branches = COALESCE($8::jsonb, branches),
               is_active = TRUE,
               updated_at = NOW()
         WHERE id = $9`,
        [
          normalizedPassword,
          passwordHash,
          'distributor',
          fullName,
          email,
          phone,
          branch,
          branches,
          existingUser.id
        ]
      );
    } else {
      userId = `USR${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      await query(
        `INSERT INTO users (
            id, username, password, password_hash, role,
            full_name, email, phone, branch, branches,
            is_active, must_change_password, metadata, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10::jsonb,
            TRUE, FALSE, $11::jsonb, NOW(), NOW()
          )`,
        [
          userId,
          username,
          normalizedPassword,
          passwordHash,
          'distributor',
          fullName,
          email,
          phone,
          branch,
          branches,
          metadata
        ]
      );
    }

    const existingMetadata = normalizeMetadata(distributor.metadata);
    existingMetadata.passwordSet = true;
    existingMetadata.passwordUpdatedAt = new Date().toISOString();

    await query(
      'UPDATE distributors SET metadata = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(existingMetadata), distributor.id]
    );

    return res.status(200).json({
      success: true,
      userId,
      distributorId: distributor.id,
      distributorCode: normalizedCode
    });
  } catch (error) {
    console.error('Distributor password update error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}


