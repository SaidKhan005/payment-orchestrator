const logger = require('../utils/logger');

/**
 * Database-backed lock manager for payment orchestration
 *
 * Provides distributed locking that survives server restarts
 * and works across multiple terminals/instances.
 */
class LockManager {
  constructor(pool) {
    this.pool = pool;
    this.defaultTimeoutSeconds = 60;
  }

  /**
   * Acquire lock on check (DB-enforced, atomic)
   *
   * @param {string} checkRef - The check reference to lock
   * @param {string} intentId - The intent ID acquiring the lock
   * @param {number} timeoutSeconds - Lock expiration timeout
   * @returns {boolean} - True if lock acquired
   * @throws {Error} - If lock is held by another intent
   */
  async acquireLock(checkRef, intentId, timeoutSeconds = null) {
    const timeout = timeoutSeconds || this.defaultTimeoutSeconds;

    try {
      // Clean up expired locks first
      await this.pool.query('SELECT cleanup_expired_locks()');

      // Try to insert lock using database time (avoids timezone issues)
      const result = await this.pool.query(`
        INSERT INTO payment_locks (check_ref, locked_by, expires_at)
        VALUES ($1, $2, NOW() + ($3 || ' seconds')::INTERVAL)
        RETURNING expires_at
      `, [checkRef, intentId, timeout.toString()]);

      const expiresAt = result.rows[0].expires_at;
      logger.info('Lock acquired', { checkRef, intentId, expiresAt });
      return true;

    } catch (error) {
      if (error.code === '23505') { // unique_violation
        logger.warn('Lock already held', { checkRef });

        // Check who holds it and when it expires
        const existing = await this.pool.query(`
          SELECT locked_by, expires_at
          FROM payment_locks
          WHERE check_ref = $1
        `, [checkRef]);

        if (existing.rows.length > 0) {
          const lock = existing.rows[0];
          throw new Error(
            `Check ${checkRef} is locked by ${lock.locked_by} ` +
            `until ${lock.expires_at}`
          );
        }
      }
      throw error;
    }
  }

  /**
   * Release lock on check
   *
   * @param {string} checkRef - The check reference to unlock
   * @param {string} intentId - The intent ID releasing the lock (must match holder)
   * @returns {boolean} - True if lock was released
   */
  async releaseLock(checkRef, intentId) {
    try {
      const result = await this.pool.query(`
        DELETE FROM payment_locks
        WHERE check_ref = $1 AND locked_by = $2
      `, [checkRef, intentId]);

      if (result.rowCount > 0) {
        logger.info('Lock released', { checkRef, intentId });
        return true;
      } else {
        logger.warn('Lock not found or not owned', { checkRef, intentId });
        return false;
      }
    } catch (error) {
      logger.error('Failed to release lock', { checkRef, intentId, error: error.message });
      throw error;
    }
  }

  /**
   * Check if check is currently locked
   *
   * @param {string} checkRef - The check reference to check
   * @returns {Object|null} - Lock info if locked, null otherwise
   */
  async isLocked(checkRef) {
    await this.pool.query('SELECT cleanup_expired_locks()');

    const result = await this.pool.query(`
      SELECT locked_by, expires_at, lock_type
      FROM payment_locks
      WHERE check_ref = $1
    `, [checkRef]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }
    return null;
  }

  /**
   * Extend lock expiration
   *
   * @param {string} checkRef - The check reference
   * @param {string} intentId - The intent ID (must match holder)
   * @param {number} additionalSeconds - Seconds to extend
   * @returns {boolean} - True if extended
   */
  async extendLock(checkRef, intentId, additionalSeconds = 30) {
    const result = await this.pool.query(`
      UPDATE payment_locks
      SET expires_at = expires_at + ($3 || ' seconds')::INTERVAL
      WHERE check_ref = $1 AND locked_by = $2
      RETURNING expires_at
    `, [checkRef, intentId, additionalSeconds.toString()]);

    if (result.rows.length > 0) {
      logger.info('Lock extended', { checkRef, intentId, newExpiry: result.rows[0].expires_at });
      return true;
    }
    return false;
  }

  /**
   * Force release a lock (admin operation)
   * Use with caution - only for stuck locks
   *
   * @param {string} checkRef - The check reference to unlock
   * @returns {boolean} - True if lock was released
   */
  async forceReleaseLock(checkRef) {
    const result = await this.pool.query(`
      DELETE FROM payment_locks WHERE check_ref = $1
      RETURNING locked_by
    `, [checkRef]);

    if (result.rows.length > 0) {
      logger.warn('Lock force released', {
        checkRef,
        wasHeldBy: result.rows[0].locked_by
      });
      return true;
    }
    return false;
  }

  /**
   * Get all active locks (for monitoring)
   *
   * @returns {Array} - List of active locks
   */
  async getAllLocks() {
    await this.pool.query('SELECT cleanup_expired_locks()');

    const result = await this.pool.query(`
      SELECT check_ref, locked_by, locked_at, expires_at, lock_type
      FROM payment_locks
      ORDER BY locked_at DESC
    `);

    return result.rows;
  }
}

module.exports = LockManager;
