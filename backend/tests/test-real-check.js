const axios = require("axios");

async function testRealPayment() {
  const API_BASE = "http://localhost:3000";
  const API_KEY = "dev_api_key_change_in_prod";

  try {
    // REPLACE THIS with a check number from your test-sts.js output
    const REAL_CHECK_NUMBER = "565eba07dcfd43259784845a15b5961d00000646";
    const RVC_REF="301";

    console.log("1. Fetching real check from Simphony...");
    console.log("   Check:", REAL_CHECK_NUMBER, "RVC:", RVC_REF);

    const checkResp = await axios.get(
      `${API_BASE}/api/checks/${REAL_CHECK_NUMBER}?rvcRef=${RVC_REF}`,
      { headers: { "X-API-Key": API_KEY } }
    );

    console.log("\n✅ Check fetched:");
    console.log("   CheckRef:", checkResp.data.header.checkRef);
    console.log("   Total Items:", checkResp.data.menuItems.length);

    const seatItems = checkResp.data.menuItems.slice(0, 2).map(item => ({
      itemRef: item.itemRef || item.menuItemRef,
      name: item.name,
      total: item.total,
    }));

    console.log("\n2. Processing payment for", seatItems.length, "items");

    console.log("\n3. Creating payment...");
    const paymentResp = await axios.post(
      `${API_BASE}/api/payments/seat`,
      {
        masterCheckRef: checkResp.data.header.checkRef,
        rvcRef: RVC_REF,
        seatItems,
        employeeRef: checkResp.data.header.checkEmployeeRef || "TESTSERVER",
      },
      { 
        headers: { "X-API-Key": API_KEY },
        timeout: 30000
      }
    );

    console.log("\n✅ PAYMENT SUCCESSFUL!");
    console.log("   Intent ID:", paymentResp.data.intentId);
    console.log("   Amount:", paymentResp.data.amount);

    console.log("\n🎉 FULL PAYMENT FLOW COMPLETED!");

  } catch (err) {
    console.error("\n❌ Test failed:");
    console.error("Error:", err.response?.data?.message || err.message);
  }
}

testRealPayment();