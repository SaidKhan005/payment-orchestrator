const axios = require("axios");

async function simpleTest() {
  const API_BASE = "http://localhost:3000";
  const API_KEY = "dev_api_key_change_in_prod";

  try {
    console.log("Testing mock gateway directly...\n");

    // Test 1: Check mock gateway
    const mock = await axios.get(`${API_BASE}/api/mock/transactions`);
    console.log("✅ Mock gateway:", mock.data.transactions.length, "transactions");

    // Test 2: Reset mock gateway
    await axios.post(`${API_BASE}/api/mock/reset`);
    console.log("✅ Mock gateway reset");

    // Test 3: List payments
    const payments = await axios.get(`${API_BASE}/api/payments`, {
      headers: { "X-API-Key": API_KEY }
    });
    console.log("✅ Payments endpoint:", payments.data.count, "payments");

    console.log("\n🎉 Basic API tests passed!");

  } catch (err) {
    console.error("❌", err.message);
  }
}

simpleTest();
