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
    const distributorCode = (body?.distributorCode || '').toString().trim().toUpperCase();
    const email = (body?.email || '').trim().toLowerCase();
    const dob = (body?.dob || '').trim();
    const newPassword = (body?.newPassword || '').trim();

    if (!distributorCode) {
      return res.status(400).json({ error: 'NB number is required' });
    }
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }
    if (!dob) {
      return res.status(400).json({ error: 'Date of birth is required' });
    }
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const username = distributorCode.toLowerCase();
    const user = await getOne(
      `SELECT u.id, u.username, u.email, u.role
       FROM users u
       WHERE u.username = $1 AND u.role = 'distributor'`,
      [username]
    );

    if (!user) {
      return res.status(404).json({ error: 'No account found for this NB number. Please sign up first.' });
    }

    const distributor = await getOne(
      'SELECT id, email, birthdate FROM distributors WHERE distributor_code = $1',
      [distributorCode]
    );

    if (!distributor) {
      return res.status(404).json({ error: 'Distributor record not found' });
    }

    const storedEmail = (user.email || distributor.email || '').toLowerCase();
    if (!storedEmail || storedEmail !== email) {
      return res.status(400).json({ error: 'Email does not match our records' });
    }

    if (!distributor.birthdate) {
      return res.status(400).json({ error: 'No date of birth on file. Please contact support to reset your password.' });
    }

    const storedDate = new Date(distributor.birthdate).toISOString().split('T')[0];
    if (storedDate !== dob) {
      return res.status(400).json({ error: 'Date of birth does not match our records' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, user.id]
    );

    return res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
