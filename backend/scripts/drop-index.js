const { Pool } = require('pg');
const config = require('../src/config');

async function dropIndex() {
  const pool = new Pool(config.database);
  
  try {
    console.log('Dropping idx_master_check...');
    
    await pool.query('DROP INDEX IF EXISTS idx_master_check CASCADE');
    
    console.log('✓ Index dropped');
    console.log('\nNow run: npm run db:migrate');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

dropIndex();