const logger = require('./utils/logger');
const { RetryableTenderError } = require('./simphony/tender-operations');
const { MockTimeoutError } = require('./payment/mock-gateway');

class PaymentOrchestrator {
  constructor(checkOps, tenderOps, intentManager, gatewayClient) {
    this.checkOps = checkOps;
    this.tenderOps = tenderOps;
    this.intentManager = intentManager;
    this.gatewayClient = gatewayClient;
    this.locks = new Map(); // Simple in-memory locks
  }

  /**
   * THE GOLDEN PATH: Process seat payment with full ledger safety
   *
   * This is the main orchestration flow that ensures:
   * 1. Check is split BEFORE payment authorization
   * 2. Payment is idempotent (safe to retry)
   * 3. State transitions are tracked in database
   * 4. Failures are logged for recovery
   */
  async processSeatPayment(masterCheckRef, rvcRef, seatItems, employeeRef) {
    let intentId = null;
    let lockAcquired = false;

    try {
      // Step 1: Acquire lock on master check to prevent concurrent modifications
      await this.acquireLock(masterCheckRef);
      lockAcquired = true;

      logger.info('Starting seat payment process', {
        masterCheckRef,
        rvcRef,
        seatItemCount: seatItems.length,
        employeeRef
      });

      // Step 2: Get current check state from Simphony
      const checkDetail = await this.checkOps.getCheckDetail(masterCheckRef, rvcRef);

      // Step 3: Calculate total amount for selected seats
      const amount = this.calculateSeatTotal(checkDetail, seatItems);

      // Step 4: Create payment intent in database (state: INIT)
      intentId = await this.intentManager.createIntent(
        masterCheckRef,
        rvcRef,
        seatItems,
        amount,
        employeeRef
      );

      // Step 5: CRITICAL - Split check BEFORE authorization
      // This creates a child check in Simphony, ensuring ledger safety
      const splitResult = await this.checkOps.splitCheck(
        masterCheckRef,
        rvcRef,
        seatItems,
        employeeRef
      );

      const childCheckRef = splitResult.childCheckRef;

      // Step 6: Update intent with child check reference (state: CHECK_SPLIT)
      await this.intentManager.updateState(intentId, {
        state: 'CHECK_SPLIT',
        childCheckRef
      });

      await this.intentManager.logEvent(
        intentId,
        'CHECK_SPLIT',
        'INIT',
        'CHECK_SPLIT',
        { childCheckRef, parentCheck: masterCheckRef }
      );

      logger.info('Check split successful', {
        intentId,
        childCheckRef,
        amount
      });

      // Step 7: Authorize payment with gateway
      // Use intentId as merchantReference for idempotency
      const authResult = await this.gatewayClient.authorize({
        amount,
        merchantReference: intentId,
        cardDetails: {
          cardNumber: '4111111111111111', // Mock card number
          expiryMonth: '12',
          expiryYear: '2025',
          cvv: '123'
        }
      });

      // Step 8: Update intent with authorization (state: AUTHORIZED)
      await this.intentManager.updateState(intentId, {
        state: 'AUTHORIZED',
        authId: authResult.authId,
        gatewayReference: authResult.transactionId
      });

      await this.intentManager.logEvent(
        intentId,
        'PAYMENT_AUTHORIZED',
        'CHECK_SPLIT',
        'AUTHORIZED',
        {
          authId: authResult.authId,
          transactionId: authResult.transactionId,
          isRetry: authResult.isRetry
        }
      );

      logger.info('Payment authorized', {
        intentId,
        authId: authResult.authId
      });

      // Step 9: Post tender to child check in Simphony
      const tenderResult = await this.tenderOps.postTender(
        childCheckRef,
        rvcRef,
        {
          amount,
          authorizationId: authResult.authId,
          employeeRef,
          externalReference: intentId,
          cardNumber: '4111111111111111'
        }
      );

      // Step 10: Update intent (state: TENDERED)
      await this.intentManager.updateState(intentId, {
        state: 'TENDERED'
      });

      await this.intentManager.logEvent(
        intentId,
        'TENDER_POSTED',
        'AUTHORIZED',
        'TENDERED',
        { tenderRef: tenderResult.tenderRef }
      );

      logger.info('Tender posted successfully', {
        intentId,
        tenderRef: tenderResult.tenderRef
      });

      // Step 11: Close the child check
      await this.checkOps.closeCheck(childCheckRef, rvcRef);

      // Step 12: Update intent to final state (state: CLOSED)
      await this.intentManager.updateState(intentId, {
        state: 'CLOSED'
      });

      await this.intentManager.logEvent(
        intentId,
        'CHECK_CLOSED',
        'TENDERED',
        'CLOSED',
        { childCheckRef }
      );

      logger.info('Payment process completed successfully', {
        intentId,
        childCheckRef,
        amount
      });

      return {
        intentId,
        childCheckRef,
        authId: authResult.authId,
        amount,
        state: 'CLOSED'
      };
    } catch (error) {
      logger.error('Payment process failed', {
        intentId,
        masterCheckRef,
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

        await this.intentManager.updateState(intentId, {
          state: 'FAILED'
        });
      }

      throw error;
    } finally {
      // Always release lock
      if (lockAcquired) {
        this.releaseLock(masterCheckRef);
      }
    }
  }

  /**
   * Recover a stuck or failed payment
   *
   * This implements idempotent recovery:
   * - Query gateway to check if authorization already exists
   * - Resume from the last successful state
   * - Safely retry failed operations
   */
  async recoverPayment(intentId) {
    try {
      logger.info('Starting payment recovery', { intentId });

      // Get current intent state
      const intent = await this.intentManager.getIntent(intentId);

      logger.info('Recovery state analysis', {
        intentId,
        currentState: intent.state,
        hasAuthId: !!intent.auth_id,
        hasChildCheck: !!intent.child_check_ref
      });

      // If we don't have an auth_id, check if authorization exists in gateway
      if (!intent.auth_id) {
        logger.info('Checking gateway for existing authorization', { intentId });

        const existingAuth = await this.gatewayClient.queryTransaction(intentId);

        if (existingAuth && existingAuth.status === 'APPROVED') {
          // Found existing authorization - update intent
          logger.info('Found existing authorization in gateway', {
            intentId,
            authId: existingAuth.authId
          });

          await this.intentManager.updateState(intentId, {
            state: 'AUTHORIZED',
            authId: existingAuth.authId,
            gatewayReference: existingAuth.transactionId
          });

          intent.auth_id = existingAuth.authId;
          intent.state = 'AUTHORIZED';
        } else {
          // No existing auth - need to authorize
          logger.info('No existing authorization found, re-authorizing', { intentId });

          const authResult = await this.gatewayClient.authorize({
            amount: intent.amount,
            merchantReference: intentId,
            cardDetails: {
              cardNumber: '4111111111111111',
              expiryMonth: '12',
              expiryYear: '2025',
              cvv: '123'
            }
          });

          await this.intentManager.updateState(intentId, {
            state: 'AUTHORIZED',
            authId: authResult.authId,
            gatewayReference: authResult.transactionId
          });

          intent.auth_id = authResult.authId;
          intent.state = 'AUTHORIZED';
        }
      }

      // If state is AUTHORIZED, retry tender posting
      if (intent.state === 'AUTHORIZED') {
        logger.info('Retrying tender posting', {
          intentId,
          childCheckRef: intent.child_check_ref
        });

        const tenderResult = await this.tenderOps.postTender(
          intent.child_check_ref,
          intent.rvc_ref,
          {
            amount: intent.amount,
            authorizationId: intent.auth_id,
            employeeRef: intent.employee_ref,
            externalReference: intentId,
            cardNumber: '4111111111111111'
          }
        );

        await this.intentManager.updateState(intentId, {
          state: 'TENDERED'
        });

        intent.state = 'TENDERED';
      }

      // If state is TENDERED, retry check close
      if (intent.state === 'TENDERED') {
        logger.info('Retrying check close', {
          intentId,
          childCheckRef: intent.child_check_ref
        });

        await this.checkOps.closeCheck(intent.child_check_ref, intent.rvc_ref);

        await this.intentManager.updateState(intentId, {
          state: 'CLOSED'
        });

        intent.state = 'CLOSED';
      }

      logger.info('Payment recovery completed', {
        intentId,
        finalState: intent.state
      });

      return {
        intentId,
        state: intent.state,
        recovered: true
      };
    } catch (error) {
      logger.error('Payment recovery failed', {
        intentId,
        error: error.message,
        stack: error.stack
      });

      await this.intentManager.logException(
        intentId,
        'RECOVERY_ERROR',
        'ERROR',
        error.message,
        error.stack
      );

      throw error;
    }
  }

  /**
   * Calculate total amount for selected seat items
   */
  calculateSeatTotal(checkDetail, seatItems) {
    let total = 0;

    if (!checkDetail.detailLines) {
      throw new Error('Check has no detail lines');
    }

    for (const itemRef of seatItems) {
      const detailLine = checkDetail.detailLines.find(
        line => line.detailLineRef === itemRef
      );

      if (!detailLine) {
        throw new Error(`Detail line ${itemRef} not found in check`);
      }

      total += parseFloat(detailLine.totalAmount || 0);
    }

    return parseFloat(total.toFixed(2));
  }

  /**
   * Acquire lock on check (simple in-memory implementation)
   */
  async acquireLock(checkRef) {
    const maxWaitMs = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.locks.has(checkRef)) {
      if (Date.now() - startTime > maxWaitMs) {
        throw new Error(`Failed to acquire lock on check ${checkRef} after ${maxWaitMs}ms`);
      }

      await this.sleep(100);
    }

    this.locks.set(checkRef, Date.now());
    logger.debug('Lock acquired', { checkRef });
  }

  /**
   * Release lock on check
   */
  releaseLock(checkRef) {
    this.locks.delete(checkRef);
    logger.debug('Lock released', { checkRef });
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = PaymentOrchestrator;
