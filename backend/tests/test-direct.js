const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");

function base64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function testDirectFetch() {
  const jar = new CookieJar();
  const http = wrapper(axios.create({ jar, withCredentials: true }));

  try {
    // Auth
    const verifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
    const state = base64url(crypto.randomBytes(16));
    
    const authParams = new URLSearchParams({
      response_type: "code",
      client_id: process.env.CLIENT_ID,
      redirect_uri: process.env.REDIRECT_URI,
      scope: "openid",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    await http.get(`${process.env.AUTHORIZE_URL}?${authParams}`);

    const signinBody = new URLSearchParams({
      username: process.env.API_USERNAME,
      password: process.env.API_PASSWORD,
      orgname: process.env.ORG_SHORT_NAME,
      client_id: process.env.CLIENT_ID,
      redirect_uri: process.env.REDIRECT_URI,
      response_type: "code",
      scope: "openid",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    const signinResp = await http.post(process.env.SIGNIN_URL, signinBody, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    const redirectUrl = signinResp.headers?.location || signinResp.data?.redirectUrl;
    const code = new URL(redirectUrl).searchParams.get("code");

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.CLIENT_ID,
      code,
      redirect_uri: process.env.REDIRECT_URI,
      code_verifier: verifier,
    });

    const tokenResp = await http.post(process.env.TOKEN_URL, tokenBody, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    const idToken = tokenResp.data.id_token;
    
    // Fetch check
    const checkRef = "8f3ec5ff673f4204b391ba16678856da00000681";
    const baseUrl = process.env.STS_BASE_URL.replace(/\/$/, "");
    
    console.log("Fetching check with working auth...");
    console.log("URL:", `${baseUrl}/checks/${checkRef}`);
    
    const checkResp = await http.get(`${baseUrl}/checks/${encodeURIComponent(checkRef)}`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
        Accept: "application/json",
        "Simphony-OrgShortName": process.env.ORG_SHORT_NAME,
        "Simphony-LocRef": process.env.LOC_REF,
        "Simphony-RvcRef": "301",
      },
      timeout: 20000
    });
    
    console.log("✅ SUCCESS with direct auth!");
    console.log("Check Number:", checkResp.data.header.checkNumber);
    console.log("Status:", checkResp.data.header.status);
    
  } catch (err) {
    console.error("❌ ALSO FAILED with direct auth:");
    console.error("Status:", err.response?.status);
    console.error("Data:", err.response?.data);
    console.log("\nThis means the checkRef doesn't exist in Simphony API");
  }
}

testDirectFetch();
