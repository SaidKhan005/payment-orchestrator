const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

async function seed() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('Seeding database...');

    // Create test payment intents
    const testIntents = [
      {
        intent_id: uuidv4(),
        master_check_ref: '12345',
        child_check_ref: '12345-1',
        rvc_ref: 1,
        amount: 45.50,
        state: 'CLOSED',
        auth_id: 'AUTH_' + Date.now(),
        gateway_reference: 'GW_' + Date.now(),
        seat_items: JSON.stringify([1, 2, 3]),
        employee_ref: 'EMP001'
      },
      {
        intent_id: uuidv4(),
        master_check_ref: '12346',
        child_check_ref: '12346-1',
        rvc_ref: 1,
        amount: 78.25,
        state: 'AUTHORIZED',
        auth_id: 'AUTH_' + (Date.now() + 1),
        gateway_reference: 'GW_' + (Date.now() + 1),
        seat_items: JSON.stringify([1, 2]),
        employee_ref: 'EMP002'
      },
      {
        intent_id: uuidv4(),
        master_check_ref: '12347',
        rvc_ref: 1,
        amount: 32.00,
        state: 'INIT',
        seat_items: JSON.stringify([1]),
        employee_ref: 'EMP001'
      }
    ];

    for (const intent of testIntents) {
      await pool.query(
        `INSERT INTO payment_intents
        (intent_id, master_check_ref, child_check_ref, rvc_ref, amount, state, auth_id, gateway_reference, seat_items, employee_ref)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          intent.intent_id,
          intent.master_check_ref,
          intent.child_check_ref,
          intent.rvc_ref,
          intent.amount,
          intent.state,
          intent.auth_id,
          intent.gateway_reference,
          intent.seat_items,
          intent.employee_ref
        ]
      );

      // Create event for each intent
      await pool.query(
        `INSERT INTO payment_events (intent_id, event_type, to_state, details)
        VALUES ($1, $2, $3, $4)`,
        [intent.intent_id, 'STATE_CHANGE', intent.state, JSON.stringify({ note: 'Seeded data' })]
      );
    }

    // Create a test exception
    await pool.query(
      `INSERT INTO payment_exceptions (intent_id, exception_type, severity, message, resolved)
      VALUES ($1, $2, $3, $4, $5)`,
      [testIntents[1].intent_id, 'TENDER_TIMEOUT', 'WARNING', 'Simulated timeout during tender posting', false]
    );

    console.log('Database seeded successfully!');
    console.log(`Created ${testIntents.length} test payment intents`);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
