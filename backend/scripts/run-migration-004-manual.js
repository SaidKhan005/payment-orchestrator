const { Pool } = require('pg');
const config = require('../src/config');

async function runMigration004() {
  const pool = new Pool(config.database);
  
  try {
    console.log('Running migration 004 manually...\n');
    
    // 1. Add new columns
    console.log('1. Adding new columns...');
    await pool.query(`
      ALTER TABLE payment_intents
      ADD COLUMN IF NOT EXISTS merchant_reference VARCHAR(255),
      ADD COLUMN IF NOT EXISTS tender_media_ref VARCHAR(50),
      ADD COLUMN IF NOT EXISTS tender_ref VARCHAR(255)
    `);
    console.log('   ✓ Columns added\n');
    
    // 2. Create unique index on merchant_reference
    console.log('2. Creating merchant_reference index...');
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_merchant_reference
      ON payment_intents(merchant_reference)
      WHERE merchant_reference IS NOT NULL
    `);
    console.log('   ✓ Index created\n');
    
    // 3. Update state constraint (FIXED - drop both old constraints)
    console.log('3. Updating state constraint...');
    
    // Drop old constraints
    await pool.query(`
      ALTER TABLE payment_intents 
      DROP CONSTRAINT IF EXISTS payment_intents_state_check
    `);
    
    await pool.query(`
      ALTER TABLE payment_intents 
      DROP CONSTRAINT IF EXISTS valid_state
    `);
    
    // Add new constraint
    await pool.query(`
      ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_state_check
      CHECK (state IN (
        'PENDING',
        'AUTHORIZING',
        'TENDERING',
        'AUTHORIZED',
        'FAILED_RETRYABLE',
        'FAILED_FINAL',
        'NEEDS_RECONCILIATION',
        'INIT',
        'CHECK_SPLITTING',
        'CHECK_SPLIT',
        'TENDERED',
        'CLOSING',
        'CLOSED',
        'VOIDED'
      ))
    `);
    console.log('   ✓ Constraint updated\n');
    
    // 4. Add reconciliation index
    console.log('4. Creating NEEDS_RECONCILIATION index...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_intents_needs_reconciliation
      ON payment_intents(state)
      WHERE state = 'NEEDS_RECONCILIATION'
    `);
    console.log('   ✓ Index created\n');
    
    // 5. Add state index
    console.log('5. Creating state index...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_intents_state
      ON payment_intents(state)
    `);
    console.log('   ✓ Index created\n');
    
    // 6. Migrate old states
    console.log('6. Migrating old states...');
    const updates = await pool.query(`
      UPDATE payment_intents
      SET state = CASE
        WHEN state = 'INIT' THEN 'PENDING'
        WHEN state = 'CLOSED' THEN 'AUTHORIZED'
        WHEN state = 'TENDERED' THEN 'AUTHORIZED'
        ELSE state
      END
      WHERE state IN ('INIT', 'CLOSED', 'TENDERED')
    `);
    console.log(`   ✓ Migrated ${updates.rowCount} records\n`);
    
    // 7. Mark migration as complete
    console.log('7. Marking migration 004 as complete...');
    await pool.query(`
      INSERT INTO schema_migrations (version, name, executed_at) 
      VALUES ('004', '004_update_states.sql', NOW())
      ON CONFLICT (version) DO NOTHING
    `);
    console.log('   ✓ Migration recorded\n');
    
    // 8. Verify
    console.log('8. Verification:');
    
    const columns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'payment_intents'
      AND column_name IN ('merchant_reference', 'tender_media_ref', 'tender_ref')
      ORDER BY column_name
    `);
    
    console.log('   New columns:');
    columns.rows.forEach(row => {
      console.log(`     ✓ ${row.column_name}`);
    });
    
    const migrations = await pool.query(`
      SELECT version, name 
      FROM schema_migrations 
      ORDER BY version
    `);
    
    console.log('\n   Completed migrations:');
    migrations.rows.forEach(row => {
      console.log(`     ✓ ${row.version}: ${row.name}`);
    });
    
    // Show current constraints
    const constraints = await pool.query(`
      SELECT conname 
      FROM pg_constraint 
      WHERE conrelid = 'payment_intents'::regclass 
      AND contype = 'c'
    `);
    
    console.log('\n   Active constraints:');
    constraints.rows.forEach(row => {
      console.log(`     ✓ ${row.conname}`);
    });
    
    console.log('\n✅ Migration 004 complete!\n');
    console.log('Next steps:');
    console.log('  1. npm start');
    console.log('  2. node tests/test-proxy-payment.js\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration004();