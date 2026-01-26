const axios = require('axios');
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
    this.baseUrl = config.stsBaseUrl;
  }

  /**
   * Post a tender (payment) to a check
   */
  async postTender(checkRef, rvcRef, tenderData) {
    try {
      const headers = await this.buildHeaders();
      const url = `${this.baseUrl}/organizations/${this.config.orgShortName}/locations/${this.config.locRef}/checks/${checkRef}/tenders`;

      const payload = {
        rvcRef,
        tenderTypeRef: tenderData.tenderTypeRef || 3, // 3 = Credit Card
        tenderAmount: tenderData.amount,
        employeeRef: tenderData.employeeRef,
        authorizationId: tenderData.authorizationId,
        accountNumber: tenderData.cardNumber ? `****${tenderData.cardNumber.slice(-4)}` : '****0000',
        externalReference: tenderData.externalReference
      };

      logger.info('Posting tender to check', {
        checkRef,
        rvcRef,
        amount: tenderData.amount,
        authId: tenderData.authorizationId
      });

      const response = await axios.post(url, payload, { headers });

      logger.info('Tender posted successfully', {
        checkRef,
        tenderRef: response.data.tenderRef,
        amount: tenderData.amount
      });

      return {
        tenderRef: response.data.tenderRef,
        tenderAmount: response.data.tenderAmount,
        tenderTypeRef: response.data.tenderTypeRef
      };
    } catch (error) {
      logger.error('Failed to post tender', {
        checkRef,
        rvcRef,
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
   * Build authorization headers for STS API
   */
  async buildHeaders() {
    const token = await this.authClient.getToken();

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }
}

module.exports = { SimphonyTenderOperations, RetryableTenderError };
