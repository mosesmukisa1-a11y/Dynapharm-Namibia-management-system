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
    const emailInput = (body?.email || '').trim();
    const dobInput = (body?.dob || '').trim();

    if (!distributorIdInput && !distributorCodeInput) {
      return res.status(400).json({ error: 'Distributor id or code is required' });
    }

    if (!emailInput) {
      return res.status(400).json({ error: 'Email address is required' });
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

    if (distributor.birthdate) {
      const storedDate = new Date(distributor.birthdate).toISOString().split('T')[0];
      if (storedDate !== dobInput) {
        return res.status(400).json({ error: 'Date of birth does not match our records' });
      }
    } else if (!dobInput) {
      return res.status(400).json({ error: 'Date of birth is required' });
    }

    const normalizedCode = (distributor.distributor_code || distributorCodeInput || '').toString().trim().toUpperCase();
    if (!normalizedCode) {
      return res.status(400).json({ error: 'Distributor code could not be determined' });
    }

    const username = normalizedCode.toLowerCase();
    const existingUser = await getOne('SELECT * FROM users WHERE username = $1 AND role = $2', [username, 'distributor']);

    if (existingUser) {
      return res.status(409).json({ error: 'An account already exists for this NB number. Please use Forgot Password to reset your credentials.' });
    }

    const passwordHash = await bcrypt.hash(normalizedPassword, 10);
    const fullName = distributor.distributor_name || normalizedCode;
    const branch = distributor.branch || null;
    const email = emailInput || distributor.email || null;
    const phone = distributor.mobile_no || null;
    const branches = branch ? JSON.stringify([branch]) : JSON.stringify([]);
    const metadata = JSON.stringify({ source: 'distributor', linkedDistributor: distributor.id });

    let userId;

    {
      userId = `USR${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      await query(
        `INSERT INTO users (
            id, username, password_hash, role,
            full_name, email, phone, branch, branches,
            is_active, must_change_password, metadata, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8, $9::jsonb,
            TRUE, FALSE, $10::jsonb, NOW(), NOW()
          )`,
        [
          userId,
          username,
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
      'UPDATE distributors SET email = COALESCE($1, email), birthdate = COALESCE($2::date, birthdate), metadata = $3::jsonb, updated_at = NOW() WHERE id = $4',
      [email, dobInput || null, JSON.stringify(existingMetadata), distributor.id]
    );

    return res.status(200).json({
      success: true,
      userId,
      distributorId: distributor.id,
      distributorCode: normalizedCode
    });
  } catch (error) {
    console.error('Distributor password update error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}


