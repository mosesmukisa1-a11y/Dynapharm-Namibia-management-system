#!/usr/bin/env node

/**
 * Seed staff users with hashed passwords.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/seed-users.js
 *
 * The default list below can be expanded as needed.
 */

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const usersToSeed = [
  {
    id: 'USR001',
    username: 'admin',
    password: 'walker33',
    role: 'admin',
    fullName: 'Administrator',
    email: 'admin@dynapharm.com.na',
    phone: '061-300877',
    branch: 'townshop',
    branches: ['townshop']
  }
  // Add more user objects here.
];

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function ensureBranches(client, branchIds) {
  const unique = Array.from(new Set(branchIds.filter(Boolean)));
  for (const branchId of unique) {
    await client.query(
      `INSERT INTO branches (id, name)
       VALUES ($1, INITCAP($1))
       ON CONFLICT (id) DO NOTHING`,
      [branchId]
    );
  }
}

async function upsertUser(client, user) {
  const passwordHash = await bcrypt.hash(user.password, 10);
  const branches = Array.isArray(user.branches) ? user.branches : [];
  const branchesJson = JSON.stringify(branches);

  await client.query(
    `INSERT INTO users (
       id, username, password, password_hash, role, full_name, email, phone,
       branch, branches, is_active, must_change_password, metadata, created_at, updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10::jsonb, TRUE, FALSE, jsonb_build_object('source','seed-script'), NOW(), NOW()
     )
     ON CONFLICT (username) DO UPDATE SET
       password = EXCLUDED.password,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       full_name = EXCLUDED.full_name,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       branch = EXCLUDED.branch,
       branches = EXCLUDED.branches,
       updated_at = NOW()`,
    [
      user.id,
      user.username.toLowerCase(),
      user.password,
      passwordHash,
      user.role,
      user.fullName,
      user.email,
      user.phone,
      user.branch,
      branchesJson
    ]
  );
}

async function main() {
  if (usersToSeed.length === 0) {
    console.log('No users configured to seed. Update usersToSeed array first.');
    process.exit(0);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const user of usersToSeed) {
      const branchIds = [user.branch, ...(user.branches || [])];
      await ensureBranches(client, branchIds);
      await upsertUser(client, user);
      console.log(`✓ Seeded/updated user: ${user.username}`);
    }

    await client.query('COMMIT');
    console.log('\nAll users processed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to seed users:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

