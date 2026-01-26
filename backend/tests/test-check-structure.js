const axios = require("axios");

async function testFetchCheck() {
  const API_BASE = "http://localhost:3000";
  const API_KEY = "dev_api_key_change_in_prod";

  try {
    const CHECK_REF = "8f3ec5ff673f4204b391ba16678856da00000681";
    const RVC_REF = 301;

    console.log("Fetching check...\n");

    const checkResp = await axios.get(
      `${API_BASE}/api/checks/${CHECK_REF}?rvcRef=${RVC_REF}`,
      { headers: { "X-API-Key": API_KEY } }
    );

    console.log("✅ SUCCESS! Full response structure:");
    console.log(JSON.stringify(checkResp.data, null, 2));

  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

testFetchCheck();
