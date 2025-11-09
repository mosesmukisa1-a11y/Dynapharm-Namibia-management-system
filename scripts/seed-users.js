#!/usr/bin/env node

/**
 * Seed staff users with hashed passwords.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/seed-users.js
 *
 * The default list below can be expanded as needed.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_USERS = [
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
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file' || arg === '-f') {
      args.file = argv[i + 1];
      i += 1;
    } else if (arg === '--append-defaults') {
      args.appendDefaults = true;
    }
  }
  return args;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = values[index] !== undefined ? values[index].trim() : '';
    });
    if (entry.branches) {
      entry.branches = entry.branches
        .split('|')
        .map((value) => value.trim())
        .filter(Boolean);
    }
    return entry;
  });
}

function loadUsersFromFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const content = readFileSync(absolutePath, 'utf8');
  const ext = path.extname(absolutePath).toLowerCase();

  if (ext === '.json') {
    const data = JSON.parse(content);
    if (!Array.isArray(data)) {
      throw new Error('JSON file must contain an array of users.');
    }
    return data;
  }

  if (ext === '.csv') {
    return parseCsv(content);
  }

  throw new Error('Unsupported file type. Use .json or .csv');
}

async function ensureBranches(client, branchIds) {
  const unique = Array.from(new Set(branchIds.filter(Boolean)));
  for (const branchId of unique) {
    await client.query(
      `INSERT INTO branches (id, name)
       VALUES ($1, INITCAP($2))
       ON CONFLICT (id) DO NOTHING`,
      [branchId, branchId]
    );
  }
}

async function upsertUser(client, user) {
  if (!user) return;
  if (!user?.username || !user?.password || !user?.role) {
    throw new Error('Each user must include username, password, and role.');
  }

  const passwordHash = await bcrypt.hash(user.password, 10);
  let branches = [];
  if (Array.isArray(user.branches)) {
    branches = user.branches;
  } else if (typeof user.branches === 'string') {
    branches = user.branches
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  const branchesJson = JSON.stringify(branches);
  const id = user.id || `USR${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const normalizedRole = user.role.toLowerCase();
  const branchId = user.branch || (branches.length > 0 ? branches[0] : null);

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
      id,
      user.username.toLowerCase(),
      user.password,
      passwordHash,
      normalizedRole,
      user.fullName || user.full_name || null,
      user.email,
      user.phone,
      branchId,
      branchesJson
    ]
  );
}

export async function seedUsers(users) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required.');
  }

  if (!Array.isArray(users) || users.length === 0) {
    console.log('No users provided; nothing to seed.');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const user of users) {
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
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function resolveUsersFromCli() {
  const cliArgs = parseArgs(process.argv.slice(2));
  let users = [];

  if (cliArgs.file) {
    users = loadUsersFromFile(cliArgs.file);
    if (cliArgs.appendDefaults) {
      users = [...users, ...DEFAULT_USERS];
    }
  } else {
    users = DEFAULT_USERS;
  }

  return users;
}

async function main() {
  try {
    const users = resolveUsersFromCli();
    if (!Array.isArray(users) || users.length === 0) {
      console.log('No users configured to seed. Update users array or provide a file.');
      process.exit(0);
    }

    await seedUsers(users);
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DEFAULT_USERS, parseArgs, loadUsersFromFile, parseCsv };

