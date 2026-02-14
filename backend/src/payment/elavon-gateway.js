const axios = require('axios');
const logger = require('../utils/logger');

// We'll use a simple XML builder/parser instead of xml2js for lighter footprint
// If xml2js is needed later, it can be added

class ElavonGatewayError extends Error {
  constructor(message, code, transactionId) {
    super(message);
    this.name = 'ElavonGatewayError';
    this.code = code;
    this.transactionId = transactionId;
  }
}

class ElavonTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ElavonTimeoutError';
    this.code = 'ETIMEDOUT';
  }
}

class ElavonGateway {
  constructor(config) {
    this.merchantId = config.merchantId;
    this.userId = config.userId;
    this.pin = config.pin;
    this.baseUrl = config.convergeUrl;
    this.authTimeout = 30000; // 30 seconds for authorization
    this.queryTimeout = 10000; // 10 seconds for queries
  }

  /**
   * Build XML request body
   * @private
   */
  buildXml(fields) {
    let xml = '<txn>\n';
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) {
        xml += `  <${key}>${this.escapeXml(String(value))}</${key}>\n`;
      }
    }
    xml += '</txn>';
    return xml;
  }

  /**
   * Escape XML special characters
   * @private
   */
  escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Parse XML response
   * @private
   */
  parseXml(xml) {
    const result = {};
    const regex = /<([^>]+)>([^<]*)<\/\1>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      result[match[1]] = match[2];
    }
    return result;
  }

  /**
   * Make HTTP request to Converge API
   * @private
   */
  async makeRequest(xml, timeout) {
    try {
      const response = await axios.post(this.baseUrl, xml, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/xml'
        },
        timeout,
        // Converge expects form data with xmldata parameter
        transformRequest: [(data) => `xmldata=${encodeURIComponent(data)}`]
      });

      return this.parseXml(response.data);
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new ElavonTimeoutError(`Gateway timeout: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Authorize payment (don't capture yet)
   * Uses ssl_invoice_number for idempotency - Elavon will return existing auth
   * if same invoice number is used
   *
   * @param {string} intentId - Payment intent UUID (used as ssl_invoice_number)
   * @param {number} amount - Amount in dollars (e.g., 27.50)
   * @param {string} cardToken - Tokenized card (NOT raw card data)
   * @param {string} [description] - Optional transaction description
   * @returns {Promise<{approved: boolean, transactionId: string, authId: string, resultMessage: string}>}
   */
  async authorize(intentId, amount, cardToken, description = null) {
    logger.info('Elavon authorize request', {
      intentId,
      amount,
      hasToken: !!cardToken
    });

    const fields = {
      ssl_merchant_id: this.merchantId,
      ssl_user_id: this.userId,
      ssl_pin: this.pin,
      ssl_transaction_type: 'CCAUTHONLY',
      ssl_amount: amount.toFixed(2),
      ssl_token: cardToken,
      ssl_invoice_number: intentId,
      ssl_description: description || `Payment intent ${intentId}`
    };

    const xml = this.buildXml(fields);

    try {
      const result = await this.makeRequest(xml, this.authTimeout);

      logger.info('Elavon authorize response', {
        intentId,
        result: result.ssl_result,
        message: result.ssl_result_message,
        transactionId: result.ssl_txn_id
      });

      // ssl_result: "0" = approved, anything else = declined/error
      const approved = result.ssl_result === '0';

      return {
        approved,
        transactionId: result.ssl_txn_id || null,
        authId: result.ssl_approval_code || null,
        resultMessage: result.ssl_result_message || 'Unknown result',
        invoiceNumber: result.ssl_invoice_number || intentId
      };
    } catch (error) {
      if (error instanceof ElavonTimeoutError) {
        logger.warn('Elavon authorization timeout', { intentId, error: error.message });
        throw error;
      }

      logger.error('Elavon authorization failed', {
        intentId,
        error: error.message,
        response: error.response?.data
      });

      throw new ElavonGatewayError(
        `Authorization failed: ${error.message}`,
        error.response?.status,
        null
      );
    }
  }

  /**
   * Query transaction status (for split-brain recovery)
   * Uses ssl_invoice_number to find transaction by our intent ID
   *
   * @param {string} intentId - Payment intent UUID
   * @returns {Promise<{found: boolean, approved: boolean, transactionId: string, authId: string} | null>}
   */
  async queryTransaction(intentId) {
    logger.info('Elavon query transaction', { intentId });

    const fields = {
      ssl_merchant_id: this.merchantId,
      ssl_user_id: this.userId,
      ssl_pin: this.pin,
      ssl_transaction_type: 'TXNQUERY',
      ssl_invoice_number: intentId
    };

    const xml = this.buildXml(fields);

    try {
      const result = await this.makeRequest(xml, this.queryTimeout);

      logger.info('Elavon query response', {
        intentId,
        result: result.ssl_result,
        found: result.ssl_txn_id ? true : false
      });

      // If no transaction found, ssl_txn_id will be empty
      if (!result.ssl_txn_id) {
        return {
          found: false,
          approved: false,
          transactionId: null,
          authId: null
        };
      }

      // Transaction found - check if it was approved
      const approved = result.ssl_result === '0' ||
                       result.ssl_result_message?.toUpperCase().includes('APPROVAL');

      return {
        found: true,
        approved,
        transactionId: result.ssl_txn_id,
        authId: result.ssl_approval_code || null,
        status: result.ssl_result_message
      };
    } catch (error) {
      logger.error('Elavon query failed', {
        intentId,
        error: error.message
      });

      // Query failures should not throw - return null to indicate uncertainty
      return null;
    }
  }

  /**
   * Void transaction (if duplicate detected)
   *
   * @param {string} transactionId - Elavon transaction ID (ssl_txn_id)
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async voidTransaction(transactionId) {
    logger.info('Elavon void transaction', { transactionId });

    const fields = {
      ssl_merchant_id: this.merchantId,
      ssl_user_id: this.userId,
      ssl_pin: this.pin,
      ssl_transaction_type: 'CCVOID',
      ssl_txn_id: transactionId
    };

    const xml = this.buildXml(fields);

    try {
      const result = await this.makeRequest(xml, this.queryTimeout);

      logger.info('Elavon void response', {
        transactionId,
        result: result.ssl_result,
        message: result.ssl_result_message
      });

      const success = result.ssl_result === '0';

      return {
        success,
        message: result.ssl_result_message || (success ? 'Voided' : 'Void failed')
      };
    } catch (error) {
      logger.error('Elavon void failed', {
        transactionId,
        error: error.message
      });

      throw new ElavonGatewayError(
        `Void failed: ${error.message}`,
        error.response?.status,
        transactionId
      );
    }
  }

  /**
   * Capture a previously authorized transaction
   *
   * @param {string} transactionId - Elavon transaction ID from authorization
   * @param {number} [amount] - Optional amount to capture (for partial capture)
   * @returns {Promise<{success: boolean, transactionId: string, message: string}>}
   */
  async capture(transactionId, amount = null) {
    logger.info('Elavon capture transaction', { transactionId, amount });

    const fields = {
      ssl_merchant_id: this.merchantId,
      ssl_user_id: this.userId,
      ssl_pin: this.pin,
      ssl_transaction_type: 'CCCOMPLETE',
      ssl_txn_id: transactionId
    };

    if (amount !== null) {
      fields.ssl_amount = amount.toFixed(2);
    }

    const xml = this.buildXml(fields);

    try {
      const result = await this.makeRequest(xml, this.queryTimeout);

      logger.info('Elavon capture response', {
        transactionId,
        result: result.ssl_result,
        message: result.ssl_result_message
      });

      const success = result.ssl_result === '0';

      return {
        success,
        transactionId: result.ssl_txn_id || transactionId,
        message: result.ssl_result_message || (success ? 'Captured' : 'Capture failed')
      };
    } catch (error) {
      logger.error('Elavon capture failed', {
        transactionId,
        error: error.message
      });

      throw new ElavonGatewayError(
        `Capture failed: ${error.message}`,
        error.response?.status,
        transactionId
      );
    }
  }
}

module.exports = { ElavonGateway, ElavonGatewayError, ElavonTimeoutError };
