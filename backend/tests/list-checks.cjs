/**
 * list-checks.cjs - Show check numbers and references from Simphony
 *
 * Run: node tests/list-checks.cjs
 *
 * Uses .env config for authentication. RVC defaults to 301 if RVC_REFS not set.
 */

const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");

/* -------------------- helpers -------------------- */

function mustEnv(name) {
  const v = process.env[name];
  if (!v || v.trim() === "" || v.includes("PASTE_") || v.includes("YOUR_")) {
    throw new Error(`Missing/placeholder env var: ${name}`);
  }
  return v;
}

function base64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function makePkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest()
  );
  return { verifier, challenge };
}

function randomState() {
  return base64url(crypto.randomBytes(16));
}

function parseCodeFromRedirect(redirectUrl) {
  const url = new URL(redirectUrl);
  return {
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
  };
}

function parseCsvNumbers(s) {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
}

function sinceLocalMidnightToday(timeZone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const yyyy = parts.find((p) => p.type === "year")?.value;
  const mm = parts.find((p) => p.type === "month")?.value;
  const dd = parts.find((p) => p.type === "day")?.value;

  const approx = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  let localMidnight = null;

  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  for (let deltaMin = -12 * 60; deltaMin <= 12 * 60; deltaMin++) {
    const candidate = new Date(approx.getTime() + deltaMin * 60 * 1000);
    const s = fmt.format(candidate);
    if (s.startsWith(`${yyyy}-${mm}-${dd}`) && s.includes("00:00")) {
      localMidnight = candidate;
      break;
    }
  }

  return (localMidnight || approx).toISOString();
}

/* -------------------- AUTH -------------------- */

async function getIdTokenViaPkce(http) {
  const authorizeUrl = mustEnv("AUTHORIZE_URL");
  const signinUrl = mustEnv("SIGNIN_URL");
  const tokenUrl = mustEnv("TOKEN_URL");
  const clientId = mustEnv("CLIENT_ID");
  const orgShortName = mustEnv("ORG_SHORT_NAME");
  const username = mustEnv("API_USERNAME");
  const password = mustEnv("API_PASSWORD");
  const redirectUri = mustEnv("REDIRECT_URI");
  const scope = (process.env.SCOPE || "openid").trim();

  const { verifier, challenge } = makePkce();
  const state = randomState();

  const authParams = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  await http.get(`${authorizeUrl}?${authParams.toString()}`, {
    maxRedirects: 0,
    validateStatus: (s) => s >= 200 && s < 500,
    timeout: 20000,
  });

  const signinBody = new URLSearchParams({
    username,
    password,
    orgname: orgShortName,
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const signinResp = await http.post(signinUrl, signinBody, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    maxRedirects: 0,
    validateStatus: (s) => s >= 200 && s < 500,
    timeout: 20000,
  });

  const redirectUrl = signinResp.headers?.location || signinResp.data?.redirectUrl;
  if (!redirectUrl) throw new Error("No redirectUrl");

  const { code } = parseCodeFromRedirect(redirectUrl);
  if (!code) throw new Error("No authorization code");

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const tokenResp = await http.post(tokenUrl, tokenBody, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 20000,
  });

  return tokenResp.data?.id_token;
}

/* -------------------- STS CALLS -------------------- */

async function listOrganizations(http, bearerToken) {
  const baseUrl = mustEnv("STS_BASE_URL").replace(/\/$/, "");
  const resp = await http.get(`${baseUrl}/organizations`, {
    headers: { Authorization: `Bearer ${bearerToken}`, Accept: "application/json" },
    timeout: 20000,
  });
  return resp.data;
}

async function listChecks(http, bearerToken, { orgShortName, locRef, rvcRef, sinceIso }) {
  const baseUrl = mustEnv("STS_BASE_URL").replace(/\/$/, "");
  const url = new URL(`${baseUrl}/checks`);
  url.searchParams.set("includeClosed", "true");
  url.searchParams.set("sinceTime", sinceIso);

  const resp = await http.get(url.toString(), {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: "application/json",
      "Simphony-OrgShortName": orgShortName,
      "Simphony-LocRef": locRef,
      "Simphony-RvcRef": String(rvcRef),
    },
    timeout: 20000,
  });

  return resp.data?.items || [];
}

/* -------------------- MAIN -------------------- */

(async () => {
  const jar = new CookieJar();
  const http = wrapper(axios.create({ jar, withCredentials: true }));

  try {
    console.log("🔐 Authenticating...");
    const idToken = await getIdTokenViaPkce(http);
    
    const orgs = await listOrganizations(http, idToken);
    const orgShortName = orgs?.items?.[0]?.orgShortName;
    
    const locRef = mustEnv("LOC_REF");
    // RVC_REFS is optional - defaults to 301 if not set
    const rvcRefs = process.env.RVC_REFS
      ? parseCsvNumbers(process.env.RVC_REFS)
      : [301];
    const timeZone = "America/St_Johns";
    const sinceIso = sinceLocalMidnightToday(timeZone);

    console.log("✅ Authenticated\n");
    console.log("📋 AVAILABLE CHECKS (Today)");
    console.log("=" .repeat(80));
    console.log("CHECK NUMBER | CHECK REFERENCE (use this for API) | STATUS | GUEST COUNT");
    console.log("-".repeat(80));

    for (const rvcRef of rvcRefs) {
      const checks = await listChecks(http, idToken, { orgShortName, locRef, rvcRef, sinceIso });
      
      console.log(`\n🏪 RVC ${rvcRef} - Found ${checks.length} checks\n`);
      
      for (const c of checks.slice(0, 20)) {  // Show first 20
        const header = c?.header || c;
        const checkNumber = header?.checkNumber || "N/A";
        const checkRef = header?.checkRef || "N/A";
        const status = header?.status || "unknown";
        const guests = header?.guestCount || 0;
        
        console.log(`${String(checkNumber).padEnd(12)} | ${checkRef.padEnd(35)} | ${status.padEnd(6)} | ${guests}`);
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("\n💡 USAGE:");
    console.log("Copy a CHECK REFERENCE from above and use it in test-real-check.js or analyze-check.js");
    console.log("Example: node tests/analyze-check.js <checkRef>");
    
  } catch (err) {
    console.error("❌ Error:", err.message);
    if (err.response?.data) {
      console.error("Details:", err.response.data);
    }
    process.exit(1);
  }
})();