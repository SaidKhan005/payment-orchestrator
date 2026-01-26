require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },

  database: {
    connectionString: process.env.DATABASE_URL
  },

  simphony: {
    stsBaseUrl: process.env.STS_BASE_URL,
    authorizeUrl: process.env.AUTHORIZE_URL,
    signinUrl: process.env.SIGNIN_URL,
    tokenUrl: process.env.TOKEN_URL,
    clientId: process.env.CLIENT_ID,
    username: process.env.API_USERNAME,
    password: process.env.API_PASSWORD,
    redirectUri: process.env.REDIRECT_URI,
    scope: process.env.SCOPE,
    orgShortName: process.env.ORG_SHORT_NAME,
    locRef: process.env.LOC_REF
  },

  gateway: {
    useMock: process.env.USE_MOCK_GATEWAY === 'true',
    mockFailureRate: parseFloat(process.env.MOCK_FAILURE_RATE) || 0.1,
    mockTimeoutRate: parseFloat(process.env.MOCK_TIMEOUT_RATE) || 0.05,
    mockLatencyMs: parseInt(process.env.MOCK_LATENCY_MS) || 500
  },

  security: {
    apiKey: process.env.API_KEY
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};