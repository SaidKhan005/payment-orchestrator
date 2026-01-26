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
   */
  async authorize({ amount, merchantReference, cardDetails }) {
    // Simulate network latency
    await this.sleep(this.config.mockLatencyMs);

    // Check if transaction already exists (idempotency check)
    const existing = this.transactions.get(merchantReference);
    if (existing) {
      logger.info('Returning existing authorization (idempotent)', {
        merchantReference,
        authId: existing.authId
      });
      return {
        ...existing,
        isRetry: true
      };
    }

    // Simulate random timeout
    if (Math.random() < this.config.mockTimeoutRate) {
      logger.warn('Simulating gateway timeout', { merchantReference });
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
