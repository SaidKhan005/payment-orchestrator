const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const crypto = require('crypto');
const logger = require('../utils/logger');

class STSAuthClient {
  constructor(config) {
    this.config = config;
    this.jar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: this.jar,
      withCredentials: true,
      maxRedirects: 0,
      validateStatus: (status) => status < 400 || status === 302
    }));

    this.cachedToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Get a valid access token, using cache if available
   */
  async getToken() {
    // Check if we have a valid cached token (refresh 10 minutes before expiry)
    if (this.cachedToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 600000) {
      logger.debug('Using cached access token');
      return this.cachedToken;
    }

    logger.info('Fetching new access token via PKCE flow');
    const tokenData = await this.getIdTokenViaPkce();

    this.cachedToken = tokenData.id_token || tokenData.access_token;
    // Cache for 50 minutes (tokens typically valid for 1 hour)
    this.tokenExpiry = Date.now() + 50 * 60 * 1000;

    return this.cachedToken;
  }

  /**
   * Complete OIDC PKCE flow to obtain access token
   */
  async getIdTokenViaPkce() {
    try {
      // Step 1: Generate PKCE parameters
      const { codeVerifier, codeChallenge } = this.makePkce();
      const state = this.randomState();

      // Step 2: Initiate authorization
      const authorizeParams = new URLSearchParams({
        response_type: 'code',
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        scope: this.config.scope,
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
      });

      const authorizeUrl = `${this.config.authorizeUrl}?${authorizeParams}`;
      logger.debug('Requesting authorization', { url: authorizeUrl });

      await this.client.get(authorizeUrl);

      // Step 3: Sign in with credentials (FIXED - using working test-sts.js format)
      const signinParams = new URLSearchParams({
        username: this.config.username,
        password: this.config.password,
        orgname: this.config.orgShortName,
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        response_type: 'code',
        scope: this.config.scope,
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
      });

      logger.debug('Signing in with credentials');
      const signinResponse = await this.client.post(
        this.config.signinUrl,
        signinParams.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );

      // Step 4: Extract authorization code from redirect
      const redirectLocation = signinResponse.headers?.location || signinResponse.data?.redirectUrl;
      if (!redirectLocation) {
        throw new Error('No redirect location in sign-in response');
      }

      const authCode = this.parseCodeFromRedirect(redirectLocation);
      if (!authCode) {
        throw new Error('Failed to extract authorization code from redirect');
      }

      logger.debug('Authorization code obtained');

      // Step 5: Exchange code for token
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: this.config.redirectUri,
        client_id: this.config.clientId,
        code_verifier: codeVerifier
      });

      logger.debug('Exchanging code for token');
      const tokenResponse = await this.client.post(
        this.config.tokenUrl,
        tokenParams.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );

      const tokenData = tokenResponse.data;
      
      if (!tokenData.id_token && !tokenData.access_token) {
        throw new Error('No token in response');
      }

      logger.info('Successfully obtained access token');

      return tokenData;
    } catch (error) {
      logger.error('PKCE authentication failed', {
        message: error.message,
        response: error.response?.data
      });
      throw new Error(`STS authentication failed: ${error.message}`);
    }
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  makePkce() {
    const codeVerifier = this.base64url(crypto.randomBytes(32));
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = this.base64url(hash);

    return { codeVerifier, codeChallenge };
  }

  /**
   * Base64 URL-safe encoding
   */
  base64url(buffer) {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Generate random state parameter
   */
  randomState() {
    return this.base64url(crypto.randomBytes(16));
  }

  /**
   * Extract authorization code from redirect URL
   */
  parseCodeFromRedirect(redirectUrl) {
    const url = new URL(redirectUrl);
    return url.searchParams.get('code');
  }
}

module.exports = STSAuthClient;