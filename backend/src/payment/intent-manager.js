const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class PaymentIntentManager {
  /**
   * Valid state transitions map
   * Maps current state -> array of allowed next states
   */
  static STATE_TRANSITIONS = {
    'INIT': ['CHECK_SPLITTING', 'FAILED_RETRYABLE'],
    'CHECK_SPLITTING': ['CHECK_SPLIT', 'FAILED_RETRYABLE'],
    'CHECK_SPLIT': ['AUTHORIZING', 'FAILED_RETRYABLE'],
    'AUTHORIZING': ['AUTHORIZED', 'FAILED_RETRYABLE', 'NEEDS_RECONCILIATION'],
    'AUTHORIZED': ['TENDERING', 'FAILED_RETRYABLE'],
    'TENDERING': ['TENDERED', 'NEEDS_RECONCILIATION'],
    'TENDERED': ['CLOSING', 'NEEDS_RECONCILIATION'],
    'CLOSING': ['CLOSED', 'NEEDS_RECONCILIATION'],
    'CLOSED': [],
    'FAILED_RETRYABLE': ['INIT', 'FAILED_FINAL'],
    'FAILED_FINAL': [],
    'NEEDS_RECONCILIATION': ['AUTHORIZED', 'TENDERED', 'CLOSED', 'FAILED_FINAL'],
    'VOIDED': []
  };

  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Check if state transition is valid
   * @param {string} fromState - Current state
   * @param {string} toState - Desired next state
   * @returns {boolean} - True if transition is allowed
   */
  isValidTransition(fromState, toState) {
    const allowedTransitions = PaymentIntentManager.STATE_TRANSITIONS[fromState];
    return allowedTransitions && allowedTransitions.includes(toState);
  }

  /**
   * Check if intent is in retryable state
   * @param {string} state - Current state
   * @returns {boolean} - True if state allows retry
   */
  isRetryable(state) {
    return state === 'FAILED_RETRYABLE' || state === 'NEEDS_RECONCILIATION';
  }

  /**
   * Get next retry state based on current state
   * @param {string} currentState - Current state
   * @returns {string|null} - Next state for retry, or null if not retryable
   */
  getNextRetryState(currentState) {
    const retryMap = {
      'FAILED_RETRYABLE': 'INIT',
      'NEEDS_RECONCILIATION': 'AUTHORIZED'
    };
    return retryMap[currentState] || null;
  }

  /**
   * Increment retry count and record error
   * @param {string} intentId - Payment intent ID
   * @param {string} errorMessage - Error message to record
   */
  async incrementRetryCount(intentId, errorMessage) {
    try {
      await this.pool.query(`
        UPDATE payment_intents
        SET retry_count = retry_count + 1,
            last_error = $2,
            updated_at = NOW()
        WHERE intent_id = $1
      `, [intentId, errorMessage]);

      logger.info('Retry count incremented', { intentId });
    } catch (error) {
      logger.error('Failed to increment retry count', { intentId, error: error.message });
    }
  }

  /**
   * Get intents that need reconciliation
   * @param {number} limit - Max number of results
   * @returns {Array} - Intents needing reconciliation
   */
  async getIntentsNeedingReconciliation(limit = 50) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM payment_intents
        WHERE state = 'NEEDS_RECONCILIATION'
        ORDER BY updated_at ASC
        LIMIT $1
      `, [limit]);

      return result.rows.map(intent => ({
        ...intent,
        seat_items: intent.seat_items ? JSON.parse(intent.seat_items) : null
      }));
    } catch (error) {
      logger.error('Failed to get intents needing reconciliation', { error: error.message });
      throw error;
    }
  }

  /**
   * Get retryable failed intents
   * @param {number} limit - Max number of results
   * @returns {Array} - Retryable failed intents
   */
  async getRetryableIntents(limit = 50) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM payment_intents
        WHERE state = 'FAILED_RETRYABLE'
          AND retry_count < 3
        ORDER BY updated_at ASC
        LIMIT $1
      `, [limit]);

      return result.rows.map(intent => ({
        ...intent,
        seat_items: intent.seat_items ? JSON.parse(intent.seat_items) : null
      }));
    } catch (error) {
      logger.error('Failed to get retryable intents', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a new payment intent
   */
  async createIntent(masterCheckRef, rvcRef, seatItems, amount, employeeRef) {
    const intentId = uuidv4();

    try {
      await this.pool.query(
        `INSERT INTO payment_intents
        (intent_id, master_check_ref, rvc_ref, seat_items, amount, employee_ref, state)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [intentId, masterCheckRef, rvcRef, JSON.stringify(seatItems), amount, employeeRef, 'INIT']
      );

      await this.logEvent(intentId, 'INTENT_CREATED', null, 'INIT', {
        masterCheckRef,
        rvcRef,
        amount,
        seatItems
      });

      logger.info('Payment intent created', {
        intentId,
        masterCheckRef,
        amount
      });

      return intentId;
    } catch (error) {
      logger.error('Failed to create intent', {
        masterCheckRef,
        error: error.message
      });
      throw new Error(`Failed to create payment intent: ${error.message}`);
    }
  }

  /**
   * Get payment intent by ID
   */
  async getIntent(intentId) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM payment_intents WHERE intent_id = $1',
        [intentId]
      );

      if (result.rows.length === 0) {
        throw new Error('Payment intent not found');
      }

      const intent = result.rows[0];

      // Parse JSON fields
      if (intent.seat_items) {
        intent.seat_items = JSON.parse(intent.seat_items);
      }

      return intent;
    } catch (error) {
      logger.error('Failed to get intent', {
        intentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update payment intent state and fields
   */
  async updateState(intentId, updates) {
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    // Build dynamic SET clause
    if (updates.state !== undefined) {
      setClauses.push(`state = $${paramIndex++}`);
      values.push(updates.state);
    }
    if (updates.childCheckRef !== undefined) {
      setClauses.push(`child_check_ref = $${paramIndex++}`);
      values.push(updates.childCheckRef);
    }
    if (updates.authId !== undefined) {
      setClauses.push(`auth_id = $${paramIndex++}`);
      values.push(updates.authId);
    }
    if (updates.gatewayReference !== undefined) {
      setClauses.push(`gateway_reference = $${paramIndex++}`);
      values.push(updates.gatewayReference);
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(intentId);

    try {
      const query = `
        UPDATE payment_intents
        SET ${setClauses.join(', ')}
        WHERE intent_id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.pool.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Payment intent not found');
      }

      logger.info('Payment intent updated', {
        intentId,
        updates
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update intent', {
        intentId,
        updates,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Log a payment event
   */
  async logEvent(intentId, eventType, fromState, toState, details) {
    try {
      await this.pool.query(
        `INSERT INTO payment_events
        (intent_id, event_type, from_state, to_state, details)
        VALUES ($1, $2, $3, $4, $5)`,
        [intentId, eventType, fromState, toState, JSON.stringify(details || {})]
      );

      logger.debug('Payment event logged', {
        intentId,
        eventType,
        fromState,
        toState
      });
    } catch (error) {
      logger.error('Failed to log event', {
        intentId,
        eventType,
        error: error.message
      });
      // Don't throw - event logging is not critical
    }
  }

  /**
   * Log a payment exception
   */
  async logException(intentId, exceptionType, severity, message, stackTrace) {
    try {
      await this.pool.query(
        `INSERT INTO payment_exceptions
        (intent_id, exception_type, severity, message, stack_trace)
        VALUES ($1, $2, $3, $4, $5)`,
        [intentId, exceptionType, severity, message, stackTrace]
      );

      logger.warn('Payment exception logged', {
        intentId,
        exceptionType,
        severity,
        message
      });
    } catch (error) {
      logger.error('Failed to log exception', {
        intentId,
        exceptionType,
        error: error.message
      });
      // Don't throw - exception logging is not critical
    }
  }

  /**
   * List payment intents with filters
   */
  async listIntents(limit = 50, state = null) {
    try {
      let query = 'SELECT * FROM payment_intents';
      const values = [];

      if (state) {
        query += ' WHERE state = $1';
        values.push(state);
        query += ' ORDER BY created_at DESC LIMIT $2';
        values.push(limit);
      } else {
        query += ' ORDER BY created_at DESC LIMIT $1';
        values.push(limit);
      }

      const result = await this.pool.query(query, values);

      // Parse JSON fields
      return result.rows.map(intent => ({
        ...intent,
        seat_items: intent.seat_items ? JSON.parse(intent.seat_items) : null
      }));
    } catch (error) {
      logger.error('Failed to list intents', {
        limit,
        state,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get payment exceptions
   */
  async getExceptions(resolved = false, limit = 50) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM payment_exceptions
        WHERE resolved = $1
        ORDER BY created_at DESC
        LIMIT $2`,
        [resolved, limit]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get exceptions', {
        resolved,
        limit,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = PaymentIntentManager;
