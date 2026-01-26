const axios = require("axios");

async function testPayment() {
  const API_BASE = "http://localhost:3000";
  const API_KEY = "dev_api_key_change_in_prod";

  try {
    // 1. Get a real check from Simphony
    console.log("1. Fetching real check from Simphony...");
    const checkResp = await axios.get(
      `${API_BASE}/api/checks/YOUR_CHECK_REF?rvcRef=301`,
      { headers: { "X-API-Key": API_KEY } }
    );

    console.log("✅ Check fetched:", checkResp.data.header.checkRef);

    // 2. Select first 2 items as "Seat 1"
    const seatItems = checkResp.data.menuItems.slice(0, 2).map(item => ({
      itemRef: item.itemRef || item.menuItemRef,
      name: item.name,
      total: item.total,
    }));

    console.log("2. Processing payment for:", seatItems);

    // 3. Make payment
    const paymentResp = await axios.post(
      `${API_BASE}/api/payments/seat`,
      {
        masterCheckRef: checkResp.data.header.checkRef,
        rvcRef: 301,
        seatItems,
        employeeRef: checkResp.data.header.checkEmployeeRef || "TEST",
      },
      { headers: { "X-API-Key": API_KEY } }
    );

    console.log("✅ Payment successful:", paymentResp.data);

  } catch (err) {
    console.error("❌ Test failed:", err.response?.data || err.message);
  }
}

testPayment();