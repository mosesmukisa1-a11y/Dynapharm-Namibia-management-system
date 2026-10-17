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
      '033_sale_evidence.sql',
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
  '029_historical_refund_evidence.sql',
  '030_publish_safe_stock_location_index.sql',
  '031_stock_request_audit_fields.sql',
  '032_client_history.sql',
   '034_stock_worker_journal.sql',
   '035_manual_price_control.sql',
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
  // Reference migrations must never provision or reset authentication credentials.
}
