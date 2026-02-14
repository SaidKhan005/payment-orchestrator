const { v4: uuidv4 } = require('uuid');
const logger = require('./utils/logger');
const { RetryableTenderError } = require('./simphony/tender-operations');
const { ElavonTimeoutError } = require('./payment/elavon-gateway');
const { MockTimeoutError } = require('./payment/mock-gateway');
const LockManager = require('./payment/lock-manager');

/**
 * Payment Orchestrator - Atomic Gateway + Tender Flow
 *
 * This orchestrator ensures atomic execution:
 * 1. Gateway authorization and Simphony tender posting succeed together or fail together
 * 2. Complete idempotency via merchantReference
 * 3. Split-brain recovery mechanisms
 *
 * Flow:
 * PENDING -> AUTHORIZING -> TENDERING -> AUTHORIZED (success)
 *                       -> FAILED_RETRYABLE (gateway declined, can retry)
 *                       -> FAILED_FINAL (hard failure)
 *                       -> NEEDS_RECONCILIATION (gateway approved but tender failed)
 */
class PaymentOrchestrator {
  constructor(db, gatewayClient, simphonyTender, lockManager, intentManager) {
    this.db = db;
    this.gatewayClient = gatewayClient;
    this.simphonyTender = simphonyTender;
    this.lockManager = lockManager || new LockManager(db);
    this.intentManager = intentManager;
  }

  /**
   * Process payment with atomic gateway + tender posting
   *
   * Flow:
   * 1. Check idempotency (prevent duplicate attempts via merchantReference)
   * 2. Create payment intent
   * 3. Acquire lock on check
   * 4. Authorize with gateway (Elavon or Mock)
   * 5. Post tender to Simphony (ONLY if gateway approved)
   * 6. Update intent state
   * 7. Release lock
   *
   * @param {Object} params
   * @param {string} params.checkRef - Simphony check reference
   * @param {number} params.rvcRef - Revenue center reference
   * @param {number} params.amount - Payment amount
   * @param {string} params.cardToken - Tokenized card
   * @param {string} params.merchantReference - Ethor's unique reference for this payment attempt
   * @param {string} params.tenderMediaRef - Simphony tender media object number
   * @param {string} [params.description] - Optional transaction description
   * @param {number} [params.employeeRef] - Optional Simphony employee reference
   * @param {number} [params.orderTypeRef] - Optional Simphony order type reference
   * @param {string} [params.cardLastFour] - Optional last 4 digits of card
   */
  async processPayment({
    checkRef,
    rvcRef,
    amount,
    cardToken,
    merchantReference,
    tenderMediaRef,
    description,
    employeeRef,
    orderTypeRef,
    cardLastFour
  }) {
    let intentId = null;
    let lockAcquired = false;

    try {
      // ============================================
      // 1. IDEMPOTENCY CHECK
      // ============================================
      const existing = await this.findByMerchantRef(merchantReference);
      if (existing) {
        logger.info('Idempotent request detected', {
          intentId: existing.intent_id,
          merchantReference,
          state: existing.state
        });
        return this.getIntentResult(existing);
      }

      // ============================================
      // 2. CREATE PAYMENT INTENT
      // ============================================
      intentId = uuidv4();
      await this.createIntent({
        intentId,
        checkRef,
        rvcRef,
        amount,
        merchantReference,
        tenderMediaRef
      });

      logger.info('Payment intent created', { intentId, checkRef, amount, merchantReference });

      // ============================================
      // 3. ACQUIRE LOCK
      // ============================================
      await this.lockManager.acquireLock(checkRef, intentId, 120);
      lockAcquired = true;

      // ============================================
      // 4. AUTHORIZE WITH GATEWAY
      // ============================================
      await this.updateIntentState(intentId, 'AUTHORIZING');
      logger.info('Authorizing with gateway', { intentId, amount });

      let gatewayResult;
      try {
        // Check if using mock gateway or real Elavon
        if (this.gatewayClient.authorize.length === 1) {
          // Mock gateway uses object parameter
          gatewayResult = await this.gatewayClient.authorize({
            amount,
            merchantReference: intentId,
            cardDetails: { cardNumber: cardToken }
          });
          // Normalize mock response
          gatewayResult = {
            approved: gatewayResult.status === 'APPROVED',
            transactionId: gatewayResult.transactionId,
            authId: gatewayResult.authId,
            resultMessage: gatewayResult.status
          };
        } else {
          // Elavon gateway
          gatewayResult = await this.gatewayClient.authorize(intentId, amount, cardToken, description);
        }
      } catch (error) {
        // Network timeout - query gateway to find truth
        if (error instanceof ElavonTimeoutError || error.name === 'MockTimeoutError') {
          logger.warn('Gateway authorization timeout', { intentId, error: error.message });
          return await this.recoverFromGatewayTimeout(intentId, checkRef, rvcRef, amount, tenderMediaRef, { employeeRef, orderTypeRef, cardLastFour });
        }
        throw error;
      }

      // ============================================
      // 5. CHECK GATEWAY RESULT
      // ============================================
      if (!gatewayResult.approved) {
        // Gateway declined - mark as failed
        await this.updateIntentState(intentId, 'FAILED_FINAL', {
          lastError: gatewayResult.resultMessage,
          gatewayReference: gatewayResult.transactionId
        });

        logger.warn('Gateway declined payment', {
          intentId,
          reason: gatewayResult.resultMessage
        });

        return {
          success: false,
          intentId,
          error: gatewayResult.resultMessage
        };
      }

      // ============================================
      // 6. GATEWAY APPROVED - POST TENDER TO SIMPHONY
      // ============================================
      await this.updateIntentState(intentId, 'TENDERING', {
        gatewayReference: gatewayResult.transactionId,
        authId: gatewayResult.authId
      });

      logger.info('Posting tender to Simphony', {
        intentId,
        checkRef,
        authId: gatewayResult.authId
      });

      let tenderResult;
      try {
        tenderResult = await this.simphonyTender.postTender(
          checkRef,
          rvcRef,
          amount,
          gatewayResult.authId,
          tenderMediaRef,
          {
            externalReference: intentId,
            employeeRef: employeeRef || null,
            orderTypeRef: orderTypeRef || null,
            cardLastFour: cardLastFour || null
          }
        );
      } catch (error) {
        // Tender posting failed - we have a split-brain scenario
        logger.error('Tender posting failed after gateway approval', {
          intentId,
          checkRef,
          authId: gatewayResult.authId,
          error: error.message
        });

        // Mark for reconciliation
        await this.updateIntentState(intentId, 'NEEDS_RECONCILIATION', {
          lastError: 'Gateway approved but tender posting failed: ' + error.message,
          gatewayReference: gatewayResult.transactionId,
          authId: gatewayResult.authId
        });

        // Log exception for ops dashboard
        await this.intentManager.logException(
          intentId,
          'TENDER_FAILED_AFTER_AUTH',
          'CRITICAL',
          `Gateway approved (auth: ${gatewayResult.authId}) but tender posting failed`,
          error.stack
        );

        // Return error but include gateway info for manual reconciliation
        return {
          success: false,
          intentId,
          needsReconciliation: true,
          gatewayApproved: true,
          authId: gatewayResult.authId,
          transactionId: gatewayResult.transactionId,
          error: 'Payment authorized but tender posting failed - needs manual reconciliation'
        };
      }

      // ============================================
      // 7. SUCCESS - BOTH GATEWAY AND TENDER SUCCEEDED
      // ============================================
      await this.updateIntentState(intentId, 'AUTHORIZED', {
        gatewayReference: gatewayResult.transactionId,
        authId: gatewayResult.authId,
        tenderRef: tenderResult.tenderRef
      });

      await this.intentManager.logEvent(
        intentId,
        'PAYMENT_COMPLETED',
        'TENDERING',
        'AUTHORIZED',
        {
          authId: gatewayResult.authId,
          transactionId: gatewayResult.transactionId,
          tenderRef: tenderResult.tenderRef,
          amount
        }
      );

      logger.info('Payment completed successfully', {
        intentId,
        authId: gatewayResult.authId,
        tenderRef: tenderResult.tenderRef
      });

      return {
        success: true,
        intentId,
        authId: gatewayResult.authId,
        transactionId: gatewayResult.transactionId,
        tenderRef: tenderResult.tenderRef
      };

    } catch (error) {
      logger.error('Payment processing failed', {
        intentId,
        checkRef,
        merchantReference,
        error: error.message,
        stack: error.stack
      });

      // Log exception if we have an intentId
      if (intentId) {
        await this.intentManager.logException(
          intentId,
          error.name || 'PAYMENT_ERROR',
          'ERROR',
          error.message,
          error.stack
        );

        // Mark as failed (retryable for transient errors)
        const isRetryable = error instanceof RetryableTenderError ||
                            error.code === 'ECONNABORTED' ||
                            error.code === 'ETIMEDOUT';

        await this.updateIntentState(intentId, isRetryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL', {
          lastError: error.message
        });
      }

      throw error;

    } finally {
      // ============================================
      // 8. ALWAYS RELEASE LOCK
      // ============================================
      if (lockAcquired && intentId) {
        await this.lockManager.releaseLock(checkRef, intentId).catch(err => {
          logger.error('Failed to release lock in finally', { checkRef, intentId, error: err.message });
        });
      }
    }
  }

  /**
   * Recover from gateway timeout by querying actual status
   */
  async recoverFromGatewayTimeout(intentId, checkRef, rvcRef, amount, tenderMediaRef, options = {}) {
    logger.warn('Attempting gateway timeout recovery', { intentId });

    try {
      // Query gateway for transaction status
      let status;
      if (this.gatewayClient.queryTransaction) {
        status = await this.gatewayClient.queryTransaction(intentId);
      }

      if (status && (status.approved || status.status === 'APPROVED')) {
        // Gateway DID approve - we need to post tender
        logger.info('Gateway timeout recovery: payment was approved', {
          intentId,
          authId: status.authId || status.authId
        });

        const authId = status.authId || status.authId;
        const transactionId = status.transactionId;

        // Update state and continue with tender posting
        await this.updateIntentState(intentId, 'TENDERING', {
          gatewayReference: transactionId,
          authId: authId,
          recoveredFromTimeout: true
        });

        // Post tender
        try {
          const tenderResult = await this.simphonyTender.postTender(
            checkRef,
            rvcRef,
            amount,
            authId,
            tenderMediaRef,
            {
              externalReference: intentId,
              employeeRef: options.employeeRef || null,
              orderTypeRef: options.orderTypeRef || null,
              cardLastFour: options.cardLastFour || null
            }
          );

          // Success!
          await this.updateIntentState(intentId, 'AUTHORIZED', {
            tenderRef: tenderResult.tenderRef
          });

          logger.info('Payment recovery completed successfully', {
            intentId,
            authId,
            tenderRef: tenderResult.tenderRef
          });

          return {
            success: true,
            intentId,
            authId,
            transactionId,
            tenderRef: tenderResult.tenderRef,
            recoveredFromTimeout: true
          };

        } catch (tenderError) {
          // Tender failed after recovery - split-brain
          logger.error('Tender failed during timeout recovery', {
            intentId,
            authId,
            error: tenderError.message
          });

          await this.updateIntentState(intentId, 'NEEDS_RECONCILIATION', {
            lastError: 'Gateway approved (recovered) but tender posting failed',
            authId
          });

          return {
            success: false,
            intentId,
            needsReconciliation: true,
            gatewayApproved: true,
            authId,
            transactionId,
            error: 'Payment authorized but tender posting failed - needs manual reconciliation'
          };
        }

      } else if (status && status.found === false) {
        // Gateway did NOT approve - safe to mark as failed and allow retry
        logger.info('Gateway timeout recovery: payment was not approved', { intentId });

        await this.updateIntentState(intentId, 'FAILED_RETRYABLE', {
          lastError: 'Gateway timeout - transaction not found',
          recoveredFromTimeout: true
        });

        return {
          success: false,
          intentId,
          canRetry: true,
          error: 'Gateway timeout - please retry'
        };
      } else {
        // Query also failed or status uncertain - mark for manual reconciliation
        logger.error('Gateway query failed during timeout recovery', { intentId });

        await this.updateIntentState(intentId, 'NEEDS_RECONCILIATION', {
          lastError: 'Unable to determine gateway status after timeout'
        });

        return {
          success: false,
          intentId,
          needsReconciliation: true,
          error: 'Transaction status unknown - needs manual reconciliation'
        };
      }

    } catch (queryError) {
      logger.error('Gateway query exception during timeout recovery', {
        intentId,
        error: queryError.message
      });

      await this.updateIntentState(intentId, 'NEEDS_RECONCILIATION', {
        lastError: `Query failed: ${queryError.message}`
      });

      return {
        success: false,
        intentId,
        needsReconciliation: true,
        error: 'Transaction status unknown - needs manual reconciliation'
      };
    }
  }

  /**
   * Get result from existing payment intent (for idempotency)
   */
  getIntentResult(intent) {
    const intentId = intent.intent_id;

    if (intent.state === 'AUTHORIZED') {
      return {
        success: true,
        intentId,
        authId: intent.auth_id,
        transactionId: intent.gateway_reference,
        tenderRef: intent.tender_ref,
        idempotent: true
      };
    } else if (intent.state === 'FAILED_FINAL') {
      return {
        success: false,
        intentId,
        error: intent.last_error || 'Payment failed',
        idempotent: true
      };
    } else if (intent.state === 'FAILED_RETRYABLE') {
      return {
        success: false,
        intentId,
        canRetry: true,
        error: intent.last_error || 'Payment failed - can retry',
        idempotent: true
      };
    } else if (intent.state === 'NEEDS_RECONCILIATION') {
      return {
        success: false,
        intentId,
        needsReconciliation: true,
        gatewayApproved: !!intent.auth_id,
        authId: intent.auth_id,
        transactionId: intent.gateway_reference,
        error: intent.last_error || 'Needs reconciliation',
        idempotent: true
      };
    } else {
      // Intent is still in progress (PENDING, AUTHORIZING, TENDERING)
      return {
        success: false,
        intentId,
        inProgress: true,
        state: intent.state,
        idempotent: true
      };
    }
  }

  /**
   * Find payment intent by merchant reference (for idempotency)
   */
  async findByMerchantRef(merchantReference) {
    try {
      const result = await this.db.query(
        'SELECT * FROM payment_intents WHERE merchant_reference = $1',
        [merchantReference]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find intent by merchant ref', {
        merchantReference,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Create a new payment intent
   */
  async createIntent({ intentId, checkRef, rvcRef, amount, merchantReference, tenderMediaRef }) {
    await this.db.query(
      `INSERT INTO payment_intents
       (intent_id, master_check_ref, rvc_ref, amount, merchant_reference, tender_media_ref, state)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')`,
      [intentId, checkRef, rvcRef, amount, merchantReference, tenderMediaRef]
    );

    await this.intentManager.logEvent(intentId, 'INTENT_CREATED', null, 'PENDING', {
      checkRef,
      rvcRef,
      amount,
      merchantReference
    });
  }

  /**
   * Update payment intent state
   */
  async updateIntentState(intentId, state, additionalFields = {}) {
    const setClauses = ['state = $1', 'updated_at = NOW()'];
    const values = [state];
    let paramIndex = 2;

    if (additionalFields.lastError !== undefined) {
      setClauses.push(`last_error = $${paramIndex++}`);
      values.push(additionalFields.lastError);
    }
    if (additionalFields.gatewayReference !== undefined) {
      setClauses.push(`gateway_reference = $${paramIndex++}`);
      values.push(additionalFields.gatewayReference);
    }
    if (additionalFields.authId !== undefined) {
      setClauses.push(`auth_id = $${paramIndex++}`);
      values.push(additionalFields.authId);
    }
    if (additionalFields.tenderRef !== undefined) {
      setClauses.push(`tender_ref = $${paramIndex++}`);
      values.push(additionalFields.tenderRef);
    }

    values.push(intentId);

    await this.db.query(
      `UPDATE payment_intents SET ${setClauses.join(', ')} WHERE intent_id = $${paramIndex}`,
      values
    );

    logger.debug('Intent state updated', { intentId, state, additionalFields });
  }

  /**
   * Get payment intent by ID
   */
  async getIntent(intentId) {
    const result = await this.db.query(
      'SELECT * FROM payment_intents WHERE intent_id = $1',
      [intentId]
    );
    return result.rows[0] || null;
  }

  /**
   * Recovery endpoint for intents that need reconciliation
   * Should be called by ops team after manual verification
   */
  async markReconciled(intentId, resolution) {
    const intent = await this.getIntent(intentId);

    if (!intent) {
      throw new Error('Intent not found');
    }

    if (intent.state !== 'NEEDS_RECONCILIATION') {
      throw new Error(`Intent is not in NEEDS_RECONCILIATION state (current: ${intent.state})`);
    }

    if (resolution === 'tender_posted') {
      // Tender was manually verified as posted
      await this.updateIntentState(intentId, 'AUTHORIZED', {
        lastError: null
      });
      logger.info('Intent marked as reconciled (tender posted)', { intentId });
    } else if (resolution === 'voided') {
      // Gateway transaction was voided
      await this.updateIntentState(intentId, 'FAILED_FINAL', {
        lastError: 'Voided during reconciliation'
      });
      logger.info('Intent marked as reconciled (voided)', { intentId });
    } else {
      throw new Error('Invalid resolution. Must be "tender_posted" or "voided"');
    }

    await this.intentManager.logEvent(intentId, 'RECONCILED', 'NEEDS_RECONCILIATION', intent.state, {
      resolution
    });

    return { success: true, intentId, resolution };
  }
}

module.exports = PaymentOrchestrator;
