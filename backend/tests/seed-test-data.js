const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

async function seedTestData() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log("🌱 SEEDING TEST DATA...\n");

  try {
    // Create 5 sample payment intents
    const intents = [
      { checkRef: "CHECK_001", amount: 45.99, state: "CLOSED", authId: "AUTH_001" },
      { checkRef: "CHECK_002", amount: 32.50, state: "AUTHORIZED", authId: "AUTH_002" },
      { checkRef: "CHECK_003", amount: 67.25, state: "TENDERED", authId: "AUTH_003" },
      { checkRef: "CHECK_004", amount: 19.99, state: "INIT", authId: null },
      { checkRef: "CHECK_005", amount: 88.75, state: "CLOSED", authId: "AUTH_005" }
    ];

    for (const intent of intents) {
      const intentId = uuidv4();
      const childCheckRef = `CHILD_${intent.checkRef}`;

      await pool.query(`
        INSERT INTO payment_intents 
        (intent_id, master_check_ref, child_check_ref, rvc_ref, amount, state, auth_id, gateway_reference, employee_ref, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      `, [
        intentId, 
        intent.checkRef, 
        childCheckRef, 
        301, 
        intent.amount, 
        intent.state, 
        intent.authId,
        intent.authId ? `TXN_${intent.authId}` : null,
        "EMP_DEMO"
      ]);

      // Add some events
      await pool.query(`
        INSERT INTO payment_events (intent_id, event_type, from_state, to_state, details, created_at)
        VALUES 
          ($1, 'CREATED', NULL, 'INIT', '{"source": "demo"}', NOW()),
          ($1, 'STATE_CHANGE', 'INIT', $2, '{"amount": $3}', NOW())
      `, [intentId, intent.state, intent.amount]);

      console.log(`✅ Created: ${intent.checkRef} - $${intent.amount} - ${intent.state}`);
    }

    // Add a sample exception
    const exceptionIntentId = uuidv4();
    await pool.query(`
      INSERT INTO payment_intents 
      (intent_id, master_check_ref, rvc_ref, amount, state, employee_ref, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, [exceptionIntentId, "CHECK_ERROR", 301, 50.00, "FAILED", "EMP_DEMO"]);

    await pool.query(`
      INSERT INTO payment_exceptions (intent_id, exception_type, severity, message, resolved, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
      exceptionIntentId,
      "PAYMENT_TIMEOUT",
      "HIGH",
      "Gateway timeout after 30 seconds - possible split-brain scenario",
      false
    ]);

    console.log("✅ Created exception record");

    console.log("\n📊 DATABASE SUMMARY:");
    const summary = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM payment_intents) as total_intents,
        (SELECT COUNT(*) FROM payment_events) as total_events,
        (SELECT COUNT(*) FROM payment_exceptions) as total_exceptions,
        (SELECT SUM(amount) FROM payment_intents WHERE state = 'CLOSED') as closed_amount
    `);

    console.log("   Payment Intents:", summary.rows[0].total_intents);
    console.log("   Events:", summary.rows[0].total_events);
    console.log("   Exceptions:", summary.rows[0].total_exceptions);
    console.log("   Closed Amount: $" + (summary.rows[0].closed_amount || 0));

    console.log("\n🎉 Test data seeded successfully!");
    console.log("\n💡 Now refresh your database viewer to see the data!");
    console.log("   Or run: node view-database.js");

  } catch (err) {
    console.error("❌ Error seeding data:", err.message);
  }

  await pool.end();
}

seedTestData();
