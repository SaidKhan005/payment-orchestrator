const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

async function testPayment() {
  const API_BASE = "http://localhost:3000";
  const API_KEY = "dev_api_key_change_in_prod";

  try {
    console.log("1. Testing mock payment...");
    
    // Create a test payment with mock data
    const testPayment = {
      masterCheckRef: "TEST_CHECK_" + Date.now(),
      rvcRef: 301,
      seatItems: [
        { itemRef: "ITEM_1", name: "Test Burger", total: 15.99 },
        { itemRef: "ITEM_2", name: "Test Fries", total: 5.99 }
      ],
      employeeRef: "EMP_TEST"
    };

    console.log("Creating payment:", testPayment);

    const result = await axios.post(
      `${API_BASE}/api/payments/seat`,
      testPayment,
      { headers: { "X-API-Key": API_KEY } }
    );

    console.log("\n✅ Payment created successfully!");
    console.log("Intent ID:", result.data.intentId);
    console.log("Amount:", result.data.amount);
    console.log("Child Check:", result.data.childCheckRef);

    // Query the payment status
    console.log("\n2. Querying payment status...");
    const status = await axios.get(
      `${API_BASE}/api/payments/${result.data.intentId}`,
      { headers: { "X-API-Key": API_KEY } }
    );

    console.log("State:", status.data.state);
    console.log("Auth ID:", status.data.auth_id);

    // List all payments
    console.log("\n3. Listing all payments...");
    const allPayments = await axios.get(
      `${API_BASE}/api/payments`,
      { headers: { "X-API-Key": API_KEY } }
    );

    console.log("Total payments:", allPayments.data.count);

    console.log("\n🎉 Full payment flow test passed!");

  } catch (err) {
    console.error("\n❌ Test failed:");
    console.error("Error:", err.response?.data || err.message);
    if (err.response?.data) {
      console.error("Details:", JSON.stringify(err.response.data, null, 2));
    }
  }
}

testPayment();
