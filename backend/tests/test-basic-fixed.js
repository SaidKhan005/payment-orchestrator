const axios = require("axios");

async function simpleTest() {
  const API_BASE = "http://localhost:3000";
  const API_KEY = "dev_api_key_change_in_prod";

  try {
    console.log("Testing basic endpoints...\n");

    // Test 1: Health check
    const health = await axios.get(`${API_BASE}/health`);
    console.log("✅ Health:", health.data.status);

    // Test 2: Mock gateway
    const mock = await axios.get(`${API_BASE}/api/mock/transactions`);
    console.log("✅ Mock gateway transactions:", mock.data.transactions.length);

    // Test 3: List payments
    const payments = await axios.get(`${API_BASE}/api/payments`, {
      headers: { "X-API-Key": API_KEY }
    });
    console.log("✅ Payments:", payments.data.data.length);

    console.log("\n🎉 Basic tests passed!");

  } catch (err) {
    console.error("❌", err.message);
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", err.response.data);
    }
  }
}

simpleTest();
