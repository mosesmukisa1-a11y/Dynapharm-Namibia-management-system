import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getOne, getMany, insert, query } from '../db.js';
import { applyAuthCors } from '../_lib/auth.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const code = (searchParams.get('code') || '').trim().toUpperCase();

    if (!code) {
      return res.status(400).json({ error: 'NB/DZ number is required' });
    }

    const distributor = await __qd_executePlan(getOne, __qd_registeredPlan("api/auth/distributor-register.js:22:0"),



    [code]);


    if (!distributor) {
      return res.status(404).json({ error: 'NB/DZ number not found in the system. Please contact your branch for registration.' });
    }

    const existingUser = await __qd_executePlan(getOne, __qd_registeredPlan("api/auth/distributor-register.js:33:1"),

    [code.toLowerCase()]);


    if (existingUser) {
      if (existingUser.is_active) {
        return res.status(409).json({ error: 'An account already exists for this number. Please login instead.' });
      } else {
        return res.status(409).json({ error: 'An account for this number is pending admin approval.' });
      }
    }

    const nameParts = (distributor.distributor_name || '').split(' ');
    const maskedName = nameParts.length > 1 ?
    `${nameParts[0]} ${'*'.repeat(nameParts.slice(1).join(' ').length)}` :
    distributor.distributor_name;

    return res.json({
      distributor_code: distributor.distributor_code,
      distributor_name: distributor.distributor_name,
      display_name: maskedName,
      branch: distributor.branch || ''
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const nbNumber = (body.nb_number || '').trim().toUpperCase();
    const password = body.password || '';
    const phone = (body.phone || '').trim();
    const email = (body.email || '').trim() || null;
    const branch = (body.branch || '').trim() || null;

    if (!nbNumber) {
      return res.status(400).json({ error: 'NB/DZ number is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!branch) {
      return res.status(400).json({ error: 'Please select your primary branch' });
    }

    const distributor = await __qd_executePlan(getOne, __qd_registeredPlan("api/auth/distributor-register.js:81:2"),



    [nbNumber]);


    if (!distributor) {
      return res.status(404).json({ error: 'NB/DZ number not found. Please contact your branch.' });
    }

    const username = nbNumber.toLowerCase();
    const existingUser = await __qd_executePlan(getOne, __qd_registeredPlan("api/auth/distributor-register.js:93:3"),

    [username]);


    if (existingUser) {
      if (existingUser.is_active) {
        return res.status(409).json({ error: 'An account already exists for this number. Please login.' });
      } else {
        return res.status(409).json({ error: 'Your account is already pending admin approval.' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const id = crypto.randomUUID();

    // Use the distributor's confirmed branch (from the sign-up form)
    const effectiveBranch = branch || distributor.branch || null;

    await insert('users', {
      id,
      username,
      password_hash: passwordHash,
      role: 'distributor',
      full_name: distributor.distributor_name || nbNumber,
      email: email || distributor.email || null,
      phone: phone || distributor.mobile_no || null,
      branch: effectiveBranch,
      is_active: false,
      metadata: JSON.stringify({
        distributor_code: nbNumber,
        registration_type: 'distributor_self_service',
        registered_at: new Date().toISOString()
      })
    });

    // Sync the confirmed branch back to the distributors table so the list stays accurate
    if (effectiveBranch) {
      await __qd_executePlan(query, __qd_registeredPlan("api/auth/distributor-register.js:132:4"),

      [effectiveBranch, nbNumber]).
      catch((err) => console.warn('Branch sync to distributors table failed (non-critical):', err.message));
    }

    return res.status(201).json({
      success: true,
      message: 'Account created! Your account is pending admin approval. You will be able to login once approved.',
      nb_number: nbNumber,
      name: distributor.distributor_name,
      branch: effectiveBranch
    });
  } catch (error) {
    console.error('Distributor registration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
