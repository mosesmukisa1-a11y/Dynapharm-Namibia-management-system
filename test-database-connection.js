#!/usr/bin/env node

/**
 * Test PostgreSQL Database Connection
 * Usage: node test-database-connection.js
 */

import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 
  `postgresql://${process.env.DB_USER || process.env.USER}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'dynapharm'}`;

console.log('🧪 Testing PostgreSQL Database Connection');
console.log('==========================================');
console.log('');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function testConnection() {
  try {
    console.log('📡 Connecting to database...');
    const client = await pool.connect();
    
    console.log('✅ Connected successfully!');
    console.log('');
    
    // Test query
    console.log('📊 Testing query...');
    const result = await client.query('SELECT version()');
    console.log('   PostgreSQL Version:', result.rows[0].version.split(',')[0]);
    console.log('');
    
    // Check if tables exist
    console.log('📋 Checking tables...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    if (tablesResult.rows.length > 0) {
      console.log(`   Found ${tablesResult.rows.length} tables:`);
      tablesResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    } else {
      console.log('   ⚠️  No tables found. Run setup-database.sh to initialize schema.');
    }
    console.log('');
    
    // Check for sync_log table (indicates enhancements are applied)
    const syncLogCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'sync_log'
      )
    `);
    
    if (syncLogCheck.rows[0].exists) {
      console.log('✅ Database enhancements are applied (sync_log table exists)');
    } else {
      console.log('⚠️  Database enhancements not applied. Run db_enhancements.sql');
    }
    console.log('');
    
    client.release();
    
    console.log('✅ All tests passed!');
    console.log('');
    console.log('📝 Connection string:');
    console.log(`   ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);
    console.log('');
    
    await pool.end();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Connection failed!');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Check if PostgreSQL is running: pg_isready');
    console.error('2. Verify DATABASE_URL is correct');
    console.error('3. Check database credentials');
    console.error('4. For cloud databases, verify network access');
    console.error('');
    
    await pool.end();
    process.exit(1);
  }
}

testConnection();


