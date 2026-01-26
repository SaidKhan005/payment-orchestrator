const axios = require("axios");

async function test() {
  try {
    const health = await axios.get("http://localhost:3000/health");
    console.log("Health:", health.data);
    
    const payments = await axios.get("http://localhost:3000/api/payments", {
      headers: { "X-API-Key": "dev_api_key_change_in_prod" }
    });
    console.log("Payments:", payments.data);
    
    console.log("✅ All tests passed!");
  } catch (err) {
    console.error("❌", err.message);
  }
}

test();
