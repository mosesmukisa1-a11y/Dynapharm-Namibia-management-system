#!/usr/bin/env node

/**
 * Import users from inject-data.js (LOCAL_DATA.users) into PostgreSQL.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/import-local-users.js
 *
 * Optional flags:
 *   --append-defaults   Include the DEFAULT_USERS from seed-users.js as well.
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedUsers, DEFAULT_USERS } from './seed-users.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);

let localDataUsers = [];

try {
  const injectDataPath = path.resolve(__dirname, '../inject-data.js');
  const { LOCAL_DATA } = require(injectDataPath);
  if (LOCAL_DATA && Array.isArray(LOCAL_DATA.users)) {
    localDataUsers = LOCAL_DATA.users;
  }
} catch (error) {
  console.error('Unable to load LOCAL_DATA from inject-data.js:', error.message);
  process.exit(1);
}

const appendDefaults = process.argv.includes('--append-defaults');

const users = appendDefaults
  ? [...localDataUsers, ...DEFAULT_USERS]
  : localDataUsers;

if (!Array.isArray(users) || users.length === 0) {
  console.log('No users found in inject-data.js. Nothing to import.');
  process.exit(0);
}

seedUsers(users).catch((error) => {
  console.error('Import failed:', error.message);
  process.exit(1);
});

