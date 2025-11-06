#!/usr/bin/env node
/**
 * Database Migration Runner
 * 
 * This script runs SQL migration files against the database.
 * 
 * Usage:
 *   node migrations/run-migrations.js
 * 
 * Environment Variables:
 *   DATABASE_URL - PostgreSQL connection string
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Migration tracking table
async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// Check if migration has been applied
async function isMigrationApplied(version) {
  const result = await pool.query(
    'SELECT version FROM schema_migrations WHERE version = $1',
    [version]
  );
  return result.rows.length > 0;
}

// Mark migration as applied
async function markMigrationApplied(version) {
  await pool.query(
    'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
    [version]
  );
}

// Run a migration file
async function runMigration(filename) {
  const filePath = join(__dirname, filename);
  const sql = readFileSync(filePath, 'utf8');
  const version = filename.replace('.sql', '');
  
  console.log(`\n📋 Running migration: ${version}`);
  
  if (await isMigrationApplied(version)) {
    console.log(`   ⏭️  Already applied, skipping...`);
    return;
  }
  
  try {
    await pool.query(sql);
    await markMigrationApplied(version);
    console.log(`   ✅ Successfully applied ${version}`);
  } catch (error) {
    console.error(`   ❌ Error applying ${version}:`, error.message);
    throw error;
  }
}

// Main function
async function main() {
  console.log('🚀 Starting database migrations...\n');
  
  try {
    await ensureMigrationsTable();
    
    // List of migrations in order
    const migrations = [
      '001_add_agreement_data.sql',
      '002_create_shared_tables.sql'
    ];
    
    for (const migration of migrations) {
      await runMigration(migration);
    }
    
    console.log('\n✅ All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}


