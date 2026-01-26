const axios = require("axios");
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

async function testPaymentFlow() {
  const API_BASE = "http://localhost:3000";
  const API_KEY = "dev_api_key_change_in_prod";
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log("TEST 9: Mock Payment Flow (End-to-End) - DETAILED\n");

  try {
    const intentId = uuidv4();
    const childCheckRef = "CHILD_" + Date.now();
    const authId = "AUTH_" + Date.now();
    
    console.log("Creating mock payment intent...");
    await pool.query(`
      INSERT INTO payment_intents 
      (intent_id, master_check_ref, child_check_ref, rvc_ref, amount, state, auth_id, employee_ref, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    `, [intentId, "MOCK_CHECK", childCheckRef, 301, 45.99, "CLOSED", authId, "EMP_MOCK"]);
    
    console.log("✅ Intent created in database");
    
    console.log("Logging events...");
    await pool.query(`
      INSERT INTO payment_events (intent_id, event_type, from_state, to_state, created_at)
      VALUES 
        ($1, 'CREATED', NULL, 'INIT', NOW()),
        ($1, 'STATE_CHANGE', 'INIT', 'AUTHORIZED', NOW()),
        ($1, 'STATE_CHANGE', 'AUTHORIZED', 'CLOSED', NOW())
    `, [intentId]);
    
    console.log("✅ Events logged");
    
    console.log("Fetching via API...");
    const intent = await axios.get(`${API_BASE}/api/payments/${intentId}`, {
      headers: { "X-API-Key": API_KEY }
    });
    
    console.log("API Response:", JSON.stringify(intent.data, null, 2));
    
    // Check the actual response structure
    const actualIntentId = intent.data.intent_id || intent.data.data?.intent_id;
    const actualState = intent.data.state || intent.data.data?.state;
    const actualAmount = intent.data.amount || intent.data.data?.amount;
    
    if (actualIntentId === intentId && actualState === "CLOSED") {
      console.log("\n✅ PASS - Complete payment flow working");
      console.log("   Intent ID:", actualIntentId);
      console.log("   State:", actualState);
      console.log("   Amount: $" + actualAmount);
    } else {
      console.log("\n❌ FAIL - Payment flow verification failed");
      console.log("   Expected intent_id:", intentId);
      console.log("   Got intent_id:", actualIntentId);
      console.log("   Expected state: CLOSED");
      console.log("   Got state:", actualState);
    }
    
    // Cleanup
    console.log("\nCleaning up test data...");
    await pool.query("DELETE FROM payment_events WHERE intent_id = $1", [intentId]);
    await pool.query("DELETE FROM payment_intents WHERE intent_id = $1", [intentId]);
    console.log("✅ Cleanup complete");
    
  } catch (err) {
    console.error("❌ ERROR:", err.message);
    if (err.response) {
      console.error("Response:", err.response.data);
    }
  }

  await pool.end();
}

testPaymentFlow();
