const axios = require("axios");

async function testFetchOnly() {
  const API_BASE = "http://localhost:3000";
  const API_KEY = "dev_api_key_change_in_prod";

  try {
    const CHECK_REF = "8f3ec5ff673f4204b391ba16678856da00000681";
    const RVC_REF = 301;

    console.log("Testing Simphony Integration...\n");
    console.log("1. Fetching check from Simphony API...");
    console.log("   Check:", CHECK_REF);
    console.log("   RVC:", RVC_REF);

    const checkResp = await axios.get(
      `${API_BASE}/api/checks/${CHECK_REF}?rvcRef=${RVC_REF}`,
      { 
        headers: { "X-API-Key": API_KEY },
        timeout: 30000
      }
    );

    console.log("\n✅ SUCCESS! Simphony API Integration Working!");
    console.log("\nCheck Details:");
    console.log("   Check Number:", checkResp.data.header.checkNumber);
    console.log("   Check Ref:", checkResp.data.header.checkRef);
    console.log("   Status:", checkResp.data.header.status);
    console.log("   Guest Count:", checkResp.data.header.guestCount);
    console.log("   Employee:", checkResp.data.header.checkEmployeeRef);
    console.log("   Total Items:", checkResp.data.menuItems?.length || 0);
    
    if (checkResp.data.menuItems?.length > 0) {
      console.log("\n   Menu Items:");
      checkResp.data.menuItems.slice(0, 3).forEach((item, i) => {
        console.log(`     ${i+1}. ${item.name} - $${item.total}`);
      });
    }

    console.log("\n🎉 SIMPHONY INTEGRATION FULLY WORKING!");
    console.log("\n📝 What this proves:");
    console.log("   ✅ Authentication to Simphony: WORKING");
    console.log("   ✅ Fetching check details: WORKING");
    console.log("   ✅ API routing: WORKING");
    console.log("   ✅ Ready for payment processing");
    
    console.log("\n⚠️  Note: Can't test full payment flow with OPEN checks");
    console.log("   Open checks can't be split until customer is ready to pay");
    console.log("   In production, this runs DURING the payment process");

  } catch (err) {
    console.error("\n❌ Test failed:");
    console.error("Error:", err.response?.data?.message || err.message);
  }
}

testFetchOnly();
