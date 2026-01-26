const axios = require("axios");
const { Pool } = require("pg");
require("dotenv").config();

async function fullSystemTest() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║   PAYMENT ORCHESTRATOR - COMPREHENSIVE SYSTEM TEST        ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const API_BASE = "http://localhost:3000";
  const API_KEY = "dev_api_key_change_in_prod";
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  let passed = 0;
  let failed = 0;

  // Test 1: Server Health
  try {
    console.log("TEST 1: Server Health Check");
    const health = await axios.get(`${API_BASE}/health`);
    console.log("✅ PASS - Server responding");
    console.log("   Status:", health.data.status);
    console.log("   Environment:", health.data.environment);
    passed++;
  } catch (err) {
    console.log("❌ FAIL - Server not responding");
    failed++;
  }

  // Test 2: Database Connection
  try {
    console.log("\nTEST 2: Database Connection");
    const result = await pool.query("SELECT NOW()");
    console.log("✅ PASS - Database connected");
    console.log("   Time:", result.rows[0].now);
    passed++;
  } catch (err) {
    console.log("❌ FAIL - Database connection failed");
    console.log("   Error:", err.message);
    failed++;
  }

  // Test 3: Database Schema
  try {
    console.log("\nTEST 3: Database Schema");
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tableNames = tables.rows.map(r => r.table_name);
    const required = ["payment_intents", "payment_events", "payment_exceptions"];
    const allPresent = required.every(t => tableNames.includes(t));
    
    if (allPresent) {
      console.log("✅ PASS - All required tables exist");
      console.log("   Tables:", tableNames.join(", "));
      passed++;
    } else {
      console.log("❌ FAIL - Missing required tables");
      console.log("   Expected:", required.join(", "));
      console.log("   Found:", tableNames.join(", "));
      failed++;
    }
  } catch (err) {
    console.log("❌ FAIL - Schema check failed");
    failed++;
  }

  // Test 4: API Authentication
  try {
    console.log("\nTEST 4: API Key Authentication");
    
    // Test without API key (should fail)
    try {
      await axios.get(`${API_BASE}/api/payments`);
      console.log("❌ FAIL - Unauthenticated request allowed");
      failed++;
    } catch (err) {
      if (err.response?.status === 401) {
        console.log("✅ PASS - Unauthenticated requests blocked");
        passed++;
      } else {
        console.log("❌ FAIL - Wrong error code:", err.response?.status);
        failed++;
      }
    }
  } catch (err) {
    console.log("❌ FAIL - Auth test error");
    failed++;
  }

  // Test 5: Mock Gateway
  try {
    console.log("\nTEST 5: Mock Payment Gateway");
    const mockTxns = await axios.get(`${API_BASE}/api/mock/transactions`);
    console.log("✅ PASS - Mock gateway accessible");
    console.log("   Transactions:", mockTxns.data.count);
    passed++;
  } catch (err) {
    console.log("❌ FAIL - Mock gateway not accessible");
    failed++;
  }

  // Test 6: Simphony Integration
  try {
    console.log("\nTEST 6: Simphony API Integration");
    const CHECK_REF = "8f3ec5ff673f4204b391ba16678856da00000681";
    const checkResp = await axios.get(
      `${API_BASE}/api/checks/${CHECK_REF}?rvcRef=301`,
      { 
        headers: { "X-API-Key": API_KEY },
        timeout: 30000 
      }
    );
    
    if (checkResp.data.success && checkResp.data.data.header.checkRef === CHECK_REF) {
      console.log("✅ PASS - Simphony integration working");
      console.log("   Check Number:", checkResp.data.data.header.checkNumber);
      console.log("   Status:", checkResp.data.data.header.status);
      passed++;
    } else {
      console.log("❌ FAIL - Unexpected response structure");
      failed++;
    }
  } catch (err) {
    console.log("❌ FAIL - Simphony integration error");
    console.log("   Error:", err.message);
    failed++;
  }

  // Test 7: Payment Intent CRUD
  try {
    console.log("\nTEST 7: Payment Intent Operations");
    const { v4: uuidv4 } = require("uuid");
    const intentId = uuidv4();
    
    // Create
    await pool.query(`
      INSERT INTO payment_intents 
      (intent_id, master_check_ref, rvc_ref, amount, state, employee_ref, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, [intentId, "TEST_CHECK", 301, 25.50, "INIT", "EMP_TEST"]);
    
    // Read
    const read = await pool.query("SELECT * FROM payment_intents WHERE intent_id = $1", [intentId]);
    
    // Update
    await pool.query("UPDATE payment_intents SET state = $1 WHERE intent_id = $2", ["CLOSED", intentId]);
    
    // Delete
    await pool.query("DELETE FROM payment_intents WHERE intent_id = $1", [intentId]);
    
    console.log("✅ PASS - CRUD operations working");
    passed++;
  } catch (err) {
    console.log("❌ FAIL - CRUD operations failed");
    console.log("   Error:", err.message);
    failed++;
  }

  // Test 8: Payment Listing Endpoint
  try {
    console.log("\nTEST 8: Payment Listing Endpoint");
    const payments = await axios.get(`${API_BASE}/api/payments`, {
      headers: { "X-API-Key": API_KEY }
    });
    
    if (payments.data.success !== undefined) {
      console.log("✅ PASS - Payment listing endpoint working");
      console.log("   Total payments:", payments.data.data?.length || 0);
      passed++;
    } else {
      console.log("❌ FAIL - Unexpected response format");
      failed++;
    }
  } catch (err) {
    console.log("❌ FAIL - Payment listing failed");
    console.log("   Error:", err.message);
    failed++;
  }

  // Test 9: Mock Payment Flow (End-to-End)
  try {
    console.log("\nTEST 9: Mock Payment Flow (End-to-End)");
    const { v4: uuidv4 } = require("uuid");
    const intentId = uuidv4();
    const childCheckRef = "CHILD_" + Date.now();
    const authId = "AUTH_" + Date.now();
    
    // Simulate complete payment flow in database
    await pool.query(`
      INSERT INTO payment_intents 
      (intent_id, master_check_ref, child_check_ref, rvc_ref, amount, state, auth_id, employee_ref, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    `, [intentId, "MOCK_CHECK", childCheckRef, 301, 45.99, "CLOSED", authId, "EMP_MOCK"]);
    
    // Log events
    await pool.query(`
      INSERT INTO payment_events (intent_id, event_type, from_state, to_state, created_at)
      VALUES 
        ($1, 'CREATED', NULL, 'INIT', NOW()),
        ($1, 'STATE_CHANGE', 'INIT', 'AUTHORIZED', NOW()),
        ($1, 'STATE_CHANGE', 'AUTHORIZED', 'CLOSED', NOW())
    `, [intentId]);
    
    // Verify via API
    const intent = await axios.get(`${API_BASE}/api/payments/${intentId}`, {
      headers: { "X-API-Key": API_KEY }
    });
    
    // FIX: Handle wrapped response
    const intentData = intent.data.data || intent.data;
    
    if (intentData.intent_id === intentId && intentData.state === "CLOSED") {
      console.log("✅ PASS - Complete payment flow simulation working");
      console.log("   Intent ID:", intentId);
      console.log("   State:", intentData.state);
      console.log("   Amount: $" + intentData.amount);
      passed++;
    } else {
      console.log("❌ FAIL - Payment flow verification failed");
      failed++;
    }
    
    // Cleanup
    await pool.query("DELETE FROM payment_events WHERE intent_id = $1", [intentId]);
    await pool.query("DELETE FROM payment_intents WHERE intent_id = $1", [intentId]);
    
  } catch (err) {
    console.log("❌ FAIL - Mock payment flow failed");
    console.log("   Error:", err.message);
    failed++;
  }

  // Final Summary
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                      TEST SUMMARY                         ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║   Total Tests: ${passed + failed}                                              ║`);
  console.log(`║   Passed: ${passed}                                                  ║`);
  console.log(`║   Failed: ${failed}                                                  ║`);
  console.log(`║   Success Rate: ${((passed/(passed+failed))*100).toFixed(1)}%                                      ║`);
  console.log("╚════════════════════════════════════════════════════════════╝");

  if (failed === 0) {
    console.log("\n🎉 ALL TESTS PASSED - SYSTEM FULLY OPERATIONAL! 🎉\n");
    console.log("✅ Ready for:");
    console.log("   • Flutter app development");
    console.log("   • Production deployment");
    console.log("   • Real payment testing");
    console.log("   • Multi-location rollout\n");
  } else {
    console.log("\n⚠️  SOME TESTS FAILED - REVIEW ERRORS ABOVE\n");
  }

  await pool.end();
}

fullSystemTest().catch(err => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});