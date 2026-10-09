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
import bcrypt from 'bcryptjs';

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
  const migrationsOnly = process.argv.includes('--migrations-only');

  console.log('🚀 Starting database migrations...\n');
  
  try {
    await ensureMigrationsTable();
    
    // List of migrations in order
    const migrations = [
      '001_add_agreement_data.sql',
      '002_create_shared_tables.sql',
      '003_create_file_uploads_table.sql',
      '004_create_users_table.sql',
      '005_create_reports_table.sql',
      '006_create_employees_table.sql',
      '007_create_branch_walkin_sales.sql',
      '008_create_branch_inventory_tables.sql',
      '009_create_branch_finance_tables.sql',
      '010_create_stock_management_tables.sql',
      '011_create_mis_tables.sql',
      '012_alter_distributors_add_branch_fields.sql',
      '013_stock_enhancements.sql',
      '014_centralized_stock_engine.sql',
      '015_hr_finance_tables.sql',
      '016_branch_inventory_unit_price.sql',
      '017_create_stock_adjustments_table.sql',
      '018_create_training_schedules_table.sql',
      '019_repair_branch_allocations.sql',
      '019_gm_dispatch_approval_enhancement.sql',
      '020_add_unit_cif_to_stock_movements.sql',
      '021_distributor_bonuses.sql',
      '022_campaign_workflow_fields.sql',
      '023_create_mis_csi_entries.sql',
      '024_sync_runtime_schema.sql',
      '025_nb_number_nullable.sql',
      '026_stock_cost_lifecycle.sql',
      '027_price_import_identity.sql',
  '028_stock_cost_reporting_indexes.sql',
    ];
    
    for (const migration of migrations) {
      await runMigration(migration);
    }

    if (!migrationsOnly) {
      await seedDefaultUsers();
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

async function seedDefaultUsers() {
  const defaultUsers = [
    {
      id: 'USR001',
      username: 'admin',
      password: 'walker33',
      fullName: 'Administrator',
      email: 'admin@dynapharm.com.na',
      phone: '061-300877',
      role: 'admin',
      branch: 'townshop',
      branches: ['townshop'],
      createdAt: '2025-01-20T10:00:00.000Z'
    },
    {
      id: 'USR1759829667953',
      username: 'moses',
      password: 'walker33',
      fullName: 'MOSES MUKISA',
      email: 'mosesmukisa1@gmail.com',
      phone: '0817317160',
      role: 'consultant',
      branch: 'townshop',
      branches: ['townshop','khomasdal','katima','outapi','ondangwa','okongo','okahao','nkurenkuru','swakopmund','hochland-park','rundu','gobabis','walvisbay','eenhana','otjiwarongo'],
      createdAt: '2025-10-07T09:34:27.953Z'
    },
    {
      id: 'USR1759829814781',
      username: 'Geneva',
      password: 'Pearl_11',
      fullName: 'Jennifer Joseph',
      email: 'shange1124@gmail.com',
      phone: '0852803618',
      role: 'consultant',
      branch: 'townshop',
      branches: ['townshop','khomasdal','katima','outapi','ondangwa','okongo','okahao','nkurenkuru','swakopmund','hochland-park','rundu','gobabis','walvisbay','eenhana','otjiwarongo'],
      createdAt: '2025-10-07T09:36:54.781Z'
    },
    {
      id: 'USR1759830625722',
      username: 'NAEM',
      password: 'PASSWORD',
      fullName: 'NAEM HANGULA',
      email: 'naemhangula4@gmail.com',
      phone: '0817499757',
      role: 'dispenser',
      branch: 'townshop',
      branches: ['townshop'],
      createdAt: '2025-10-07T09:50:25.722Z'
    },
    {
      id: 'USR1759928153488',
      username: 'GEINGOS',
      password: 'ALBERTO99',
      fullName: 'HILMA C',
      email: 'geingoshilma@gmail',
      phone: '0814137106',
      role: 'consultant',
      branch: 'townshop',
      branches: ['townshop','khomasdal','katima','outapi','ondangwa','okongo','okahao','nkurenkuru','swakopmund','hochland-park','rundu','gobabis','walvisbay','eenhana','otjiwarongo'],
      createdAt: '2025-10-08T12:55:53.488Z'
    },
    {
      id: 'USR2000000000001',
      username: 'stock',
      password: 'stock123',
      fullName: 'Stock Manager',
      email: 'stock@dynapharm.com.na',
      phone: '0812000000',
      role: 'stock',
      branch: 'townshop',
      branches: ['townshop'],
      createdAt: '2025-01-20T10:00:00.000Z'
    },
    {
      id: 'USR2000000000002',
      username: 'mis',
      password: 'mis123',
      fullName: 'MIS Manager',
      email: 'mis@dynapharm.com.na',
      phone: '0813000000',
      role: 'mis',
      branch: 'townshop',
      branches: ['townshop'],
      createdAt: '2025-01-20T10:00:00.000Z'
    }
  ];

  console.log('\n👥 Seeding default users...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const user of defaultUsers) {
      const existing = await client.query('SELECT id, password_hash FROM users WHERE username = $1', [user.username]);
      let passwordHash;

      if (existing.rowCount > 0) {
        const existingHash = existing.rows[0].password_hash;
        const matches = await bcrypt.compare(user.password, existingHash).catch(() => false);
        passwordHash = matches ? existingHash : await bcrypt.hash(user.password, 10);
      } else {
        passwordHash = await bcrypt.hash(user.password, 10);
      }

      await client.query(
        `INSERT INTO users (id, username, password_hash, role, full_name, email, phone, branch, branches, is_active, metadata, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12,NOW())
         ON CONFLICT (username) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           full_name = EXCLUDED.full_name,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           branch = EXCLUDED.branch,
           branches = EXCLUDED.branches,
           is_active = EXCLUDED.is_active,
           metadata = EXCLUDED.metadata,
           updated_at = NOW();`,
        [
          user.id,
          user.username,
          passwordHash,
          user.role,
          user.fullName,
          user.email,
          user.phone,
          user.branch,
          JSON.stringify(user.branches || []),
          true,
          JSON.stringify({ source: 'default_seed', createdAt: user.createdAt }),
          user.createdAt ? new Date(user.createdAt) : new Date()
        ]
      );
    }

    await client.query('COMMIT');
    console.log('   ✅ Default users seeded successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('   ❌ Failed to seed users:', error.message);
    throw error;
  } finally {
    client.release();
  }
}


