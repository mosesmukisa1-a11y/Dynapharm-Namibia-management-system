#!/usr/bin/env node

/**
 * Migrate existing users so that password_hash is populated.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." node scripts/migrate-user-passwords.js
 */

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migratePasswords() {
  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `SELECT id, username, password, password_hash
       FROM users
       WHERE password IS NOT NULL
         AND (password_hash IS NULL OR password_hash = '')`
    );

    if (rows.length === 0) {
      console.log('No users require password migration.');
      return;
    }

    console.log(`Found ${rows.length} user(s) needing migration.`);
    await client.query('BEGIN');

    for (const row of rows) {
      const hash = await bcrypt.hash(row.password, 10);
      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [hash, row.id]
      );
      console.log(`✓ Migrated ${row.username}`);
    }

    await client.query('COMMIT');
    console.log('\nMigration complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migratePasswords().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

