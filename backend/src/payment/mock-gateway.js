const logger = require('../utils/logger');

class MockTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MockTimeoutError';
    this.code = 'ETIMEDOUT';
  }
}

class MockDeclineError extends Error {
  constructor(message, declineReason) {
    super(message);
    this.name = 'MockDeclineError';
    this.declineReason = declineReason;
  }
}

class MockGatewayClient {
  constructor(config) {
    this.config = config;
    this.transactions = new Map(); // Store transactions by merchantReference
    this.authIdCounter = 1;
  }

  /**
   * Simulate payment authorization with configurable failures
   *
   * This enhanced version simulates real-world failure scenarios:
   * - Network timeouts (with or without actual approval)
   * - Card declines
   * - Delayed duplicate responses
   * - Split-brain scenarios (approved but timeout before response)
   */
  async authorize({ amount, merchantReference, cardDetails }) {
    // Simulate network latency (variable)
    const latency = this.config.mockLatencyMs + (Math.random() * 500);
    await this.sleep(latency);

    // Check if transaction already exists (idempotency check)
    const existing = this.transactions.get(merchantReference);
    if (existing) {
      logger.info('Returning existing authorization (idempotent)', {
        merchantReference,
        authId: existing.authId
      });

      // Simulate delayed duplicate response (gateway retry scenario)
      if (Math.random() < 0.1) {
        await this.sleep(2000);
        logger.warn('Simulating delayed duplicate response', { merchantReference });
      }

      return {
        ...existing,
        isRetry: true
      };
    }

    // CRITICAL SCENARIO: Simulate approved-but-timeout (split-brain)
    // The transaction IS approved on the gateway, but the client times out
    // before receiving the response. This is the most dangerous scenario.
    if (Math.random() < this.config.mockTimeoutRate * 0.5) {
      // Store the transaction (it IS approved)
      const authId = `AUTH_${this.authIdCounter++}_${Date.now()}`;
      const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const transaction = {
        authId,
        transactionId,
        merchantReference,
        amount,
        cardDetails: {
          ...cardDetails,
          cardNumber: cardDetails.cardNumber ? `****${cardDetails.cardNumber.slice(-4)}` : '****0000'
        },
        status: 'APPROVED',
        timestamp: new Date().toISOString(),
        isRetry: false
      };

      this.transactions.set(merchantReference, transaction);

      // But throw timeout before returning - client never sees the approval
      logger.warn('Simulating approved-but-timeout (split-brain scenario)', {
        merchantReference,
        authId
      });
      throw new MockTimeoutError('Gateway timeout (but transaction approved)');
    }

    // Simulate timeout without approval
    if (Math.random() < this.config.mockTimeoutRate) {
      logger.warn('Simulating gateway timeout (no approval)', { merchantReference });
      throw new MockTimeoutError('Gateway timeout');
    }

    // Simulate random decline
    if (Math.random() < this.config.mockFailureRate) {
      const declineReasons = [
        'INSUFFICIENT_FUNDS',
        'CARD_DECLINED',
        'EXPIRED_CARD',
        'INVALID_CVV'
      ];
      const reason = declineReasons[Math.floor(Math.random() * declineReasons.length)];

      logger.warn('Simulating card decline', {
        merchantReference,
        reason
      });

      throw new MockDeclineError('Card declined', reason);
    }

    // Success - create authorization
    const authId = `AUTH_${this.authIdCounter++}_${Date.now()}`;
    const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const transaction = {
      authId,
      transactionId,
      merchantReference,
      amount,
      cardDetails: {
        ...cardDetails,
        cardNumber: cardDetails.cardNumber ? `****${cardDetails.cardNumber.slice(-4)}` : '****0000'
      },
      status: 'APPROVED',
      timestamp: new Date().toISOString(),
      isRetry: false
    };

    this.transactions.set(merchantReference, transaction);

    logger.info('Mock authorization approved', {
      authId,
      merchantReference,
      amount
    });

    return transaction;
  }

  /**
   * Query transaction status by merchant reference (for idempotency)
   */
  async queryTransaction(merchantReference) {
    await this.sleep(100); // Simulate latency

    const transaction = this.transactions.get(merchantReference);

    if (transaction) {
      logger.debug('Transaction found in gateway', {
        merchantReference,
        authId: transaction.authId,
        status: transaction.status
      });
      return transaction;
    }

    logger.debug('Transaction not found in gateway', { merchantReference });
    return null;
  }

  /**
   * Void a previously authorized transaction
   */
  async voidTransaction(authId) {
    await this.sleep(this.config.mockLatencyMs / 2);

    // Find transaction by authId
    for (const [ref, txn] of this.transactions.entries()) {
      if (txn.authId === authId) {
        txn.status = 'VOIDED';
        txn.voidedAt = new Date().toISOString();

        logger.info('Transaction voided', {
          authId,
          merchantReference: ref
        });

        return {
          success: true,
          authId,
          status: 'VOIDED'
        };
      }
    }

    throw new Error(`Transaction with authId ${authId} not found`);
  }

  /**
   * Get all transactions (for debugging/monitoring)
   */
  getAllTransactions() {
    return Array.from(this.transactions.values());
  }

  /**
   * Reset all transactions (for testing)
   */
  reset() {
    this.transactions.clear();
    this.authIdCounter = 1;
    logger.info('Mock gateway reset');
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { MockGatewayClient, MockTimeoutError, MockDeclineError };
