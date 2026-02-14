const { Pool } = require('pg');
const config = require('../src/config');
const fs = require('fs');
const path = require('path');

async function setup() {
  const pool = new Pool(config.database);
  
  try {
    console.log('Setting up migration system...\n');
    
    // 1. Create schema_migrations table
    console.log('1. Creating schema_migrations table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('   ✓ Done\n');
    
    // 2. Check what tables exist
    console.log('2. Checking existing tables...');
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('   Tables found:');
    tables.rows.forEach(row => {
      console.log(`     - ${row.table_name}`);
    });
    console.log();
    
    // 3. Mark migrations as complete if tables exist
    const hasIntents = tables.rows.some(r => r.table_name === 'payment_intents');
    const hasLocks = tables.rows.some(r => r.table_name === 'payment_locks');
    
    if (hasIntents) {
      console.log('3. Marking existing migrations as complete...');
      await pool.query(`
        INSERT INTO schema_migrations (version, name) 
        VALUES 
          ('001', '001_initial_schema.sql'),
          ('002', '002_extend_state_machines.sql')
        ON CONFLICT (version) DO NOTHING
      `);
      console.log('   ✓ Marked 001, 002\n');
    }
    
    if (hasLocks) {
      await pool.query(`
        INSERT INTO schema_migrations (version, name) 
        VALUES ('003', '003_payment_locks.sql')
        ON CONFLICT (version) DO NOTHING
      `);
      console.log('   ✓ Marked 003\n');
    }
    
    // 4. Show status
    console.log('4. Current migration status:');
    const status = await pool.query(`
      SELECT version, name, executed_at 
      FROM schema_migrations 
      ORDER BY version
    `);
    
    status.rows.forEach(row => {
      console.log(`   ✓ ${row.version}: ${row.name}`);
    });
    
    console.log('\n✅ Migration system ready!');
    console.log('\nNext step: npm run db:migrate');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setup();