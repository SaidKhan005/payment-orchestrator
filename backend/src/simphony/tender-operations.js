const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class RetryableTenderError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'RetryableTenderError';
    this.originalError = originalError;
    this.retryable = true;
  }
}

class SimphonyTenderOperations {
  constructor(config, authClient) {
    this.config = config;
    this.authClient = authClient;
    this.baseUrl = config.stsBaseUrl.replace(/\/$/, '');
  }

  /**
   * Post payment tender to Simphony check
   *
   * @param {string} checkRef - Simphony check reference
   * @param {number} rvcRef - Revenue center reference
   * @param {number} amount - Tender amount
   * @param {string} authId - Gateway authorization ID
   * @param {string} tenderMediaRef - Tender media object number (e.g., credit card tender)
   * @param {Object} [options] - Additional options
   * @param {string} [options.employeeRef] - Employee reference
   * @param {string} [options.externalReference] - External reference (payment intent ID)
   * @param {string} [options.cardLastFour] - Last 4 digits of card
   * @returns {Promise<{success: boolean, tenderRef: string}>}
   */
  
async postTender(checkRef, rvcRef, amount, authId, tenderMediaRef, options = {}) {
  // ========================================
  // MOCK MODE (for testing without real Simphony endpoint)
  // ========================================
  if (process.env.SIMPHONY_USE_MOCK_TENDER === 'true') {
    logger.info('MOCK: Simulating tender posting', {
      checkRef,
      amount,
      authId,
      tenderMediaRef
    });
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const tenderRef = `TENDER_MOCK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('MOCK: Tender posted successfully', {
      checkRef,
      tenderRef,
      amount
    });
    
    return {
      success: true,
      tenderRef,
      tenderAmount: amount
    };
  }
  
  // ========================================
  // REAL SIMPHONY TENDER POSTING VIA /round ENDPOINT
  // ========================================
  try {
    const token = await this.authClient.getToken();

    // POST /checks/{checkRef}/round - Add tender as a "round"
    const url = `${this.baseUrl}/checks/${encodeURIComponent(checkRef)}/round`;

    const payload = {
      header: {
        orgShortName: this.config.orgShortName,
        locRef: this.config.locRef,
        rvcRef: rvcRef,
        checkRef: checkRef,
        idempotencyId: options.externalReference || uuidv4(), // Use payment intent ID
        checkEmployeeRef: options.employeeRef || this.config.defaultEmployeeRef || 1,
        orderTypeRef: options.orderTypeRef || this.config.defaultOrderTypeRef || 1
      },
      tenders: [
        {
          tenderId: parseInt(tenderMediaRef, 10) || 3, // Credit card tender type
          name: options.tenderName || 'Credit Card',
          total: parseFloat(amount),
          chargedTipTotal: options.tipAmount || 0,
          referenceText: authId, // Store auth code as reference
          extensions: options.externalReference ? [{
            displayName: 'Payment Intent',
            appName: 'PaymentProxy',
            dataName: 'intentId',
            dataType: 'string',
            data: options.externalReference,
            options: ['printOnReceipt']
          }] : []
        }
      ]
    };

    logger.info('Posting tender to Simphony via /round', {
      checkRef,
      rvcRef,
      amount,
      authId,
      tenderMediaRef
    });

    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Simphony-OrgShortName': this.config.orgShortName,
        'Simphony-LocRef': this.config.locRef,
        'Simphony-RvcRef': String(rvcRef)
      },
      timeout: 20000
    });

    // Extract tender reference from response
    const postedTenders = response.data.tenders || [];
    const ourTender = postedTenders.find(t => 
      t.referenceText === authId || 
      Math.abs(t.total - amount) < 0.01
    );

    const tenderRef = ourTender?.tenderRef || 
                      ourTender?.id || 
                      `TENDER_${Date.now()}`;

    logger.info('Tender posted successfully via /round', {
      checkRef,
      tenderRef,
      amount,
      tenderCount: postedTenders.length
    });

    return {
      success: true,
      tenderRef: String(tenderRef),
      tenderAmount: ourTender?.total || amount
    };
    
  } catch (error) {
    logger.error('Failed to post tender via /round', {
      checkRef,
      rvcRef,
      amount,
      error: error.message,
      status: error.response?.status,
      response: error.response?.data
    });

    // Determine if error is retryable
    const status = error.response?.status;
    if (status === 408 || status === 503 || status === 504 || !status) {
      throw new RetryableTenderError(
        `Tender posting timeout or service unavailable: ${error.message}`,
        error
      );
    }

    throw new Error(`Failed to post tender to check ${checkRef}: ${error.message}`);
  }
}

  /**
   * Query tender status on a check
   * Used to verify if tender was actually posted during split-brain scenarios
   *
   * @param {string} checkRef - Simphony check reference
   * @param {number} rvcRef - Revenue center reference
   * @returns {Promise<Array<{tenderRef: string, amount: number, authCode: string}>>}
   */
  async getTenderStatus(checkRef, rvcRef) {
    try {
      const token = await this.authClient.getToken();

      // Get check detail which includes tenders
      const url = `${this.baseUrl}/checks/${encodeURIComponent(checkRef)}`;

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Simphony-OrgShortName': this.config.orgShortName,
          'Simphony-LocRef': this.config.locRef,
          'Simphony-RvcRef': String(rvcRef)
        },
        timeout: 15000
      });

      const tenders = response.data.tenders || [];

      logger.info('Retrieved tender status', {
        checkRef,
        tenderCount: tenders.length
      });

      return tenders.map(tender => ({
        tenderRef: tender.tenderRef || tender.id,
        amount: tender.tenderAmount || tender.amount,
        authCode: tender.authorizationCode || tender.authCode,
        tenderMediaRef: tender.tenderMedia?.objectNum
      }));
    } catch (error) {
      logger.error('Failed to get tender status', {
        checkRef,
        rvcRef,
        error: error.message
      });

      // Return empty array on error - caller should handle uncertainty
      return [];
    }
  }

  /**
   * Check if a tender with specific auth code already exists on check
   * Used for idempotency verification
   *
   * @param {string} checkRef - Simphony check reference
   * @param {number} rvcRef - Revenue center reference
   * @param {string} authId - Authorization code to look for
   * @returns {Promise<{exists: boolean, tenderRef: string | null}>}
   */
  async findTenderByAuthCode(checkRef, rvcRef, authId) {
    const tenders = await this.getTenderStatus(checkRef, rvcRef);

    const existingTender = tenders.find(t => t.authCode === authId);

    if (existingTender) {
      logger.info('Found existing tender with auth code', {
        checkRef,
        authId,
        tenderRef: existingTender.tenderRef
      });

      return {
        exists: true,
        tenderRef: existingTender.tenderRef
      };
    }

    return {
      exists: false,
      tenderRef: null
    };
  }
}

module.exports = { SimphonyTenderOperations, RetryableTenderError };
