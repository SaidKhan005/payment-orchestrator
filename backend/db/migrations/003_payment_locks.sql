-- Migration: DB-enforced payment locks
-- Purpose: Replace in-memory locks with database-backed locks for multi-server support

CREATE TABLE IF NOT EXISTS payment_locks (
  check_ref VARCHAR(100) PRIMARY KEY,
  locked_by VARCHAR(100) NOT NULL, -- intent_id or temp ID that holds the lock
  locked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  lock_type VARCHAR(50) NOT NULL DEFAULT 'PAYMENT_IN_PROGRESS'
);

-- Index for efficiently finding and cleaning expired locks
CREATE INDEX IF NOT EXISTS idx_locks_expires ON payment_locks(expires_at);

-- Index for looking up locks by holder
CREATE INDEX IF NOT EXISTS idx_locks_holder ON payment_locks(locked_by);

-- Function to auto-cleanup expired locks
-- Returns the number of deleted locks
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM payment_locks WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to attempt lock acquisition atomically
-- Returns TRUE if lock acquired, FALSE if already locked
CREATE OR REPLACE FUNCTION try_acquire_lock(
  p_check_ref VARCHAR(100),
  p_locked_by UUID,
  p_timeout_seconds INTEGER DEFAULT 60,
  p_lock_type VARCHAR(50) DEFAULT 'PAYMENT_IN_PROGRESS'
)
RETURNS BOOLEAN AS $$
DECLARE
  lock_acquired BOOLEAN := FALSE;
BEGIN
  -- First clean up expired locks
  PERFORM cleanup_expired_locks();

  -- Try to insert the lock (will fail silently if exists)
  INSERT INTO payment_locks (check_ref, locked_by, expires_at, lock_type)
  VALUES (p_check_ref, p_locked_by, NOW() + (p_timeout_seconds || ' seconds')::INTERVAL, p_lock_type)
  ON CONFLICT (check_ref) DO NOTHING;

  -- Check if we got the lock
  SELECT EXISTS (
    SELECT 1 FROM payment_locks
    WHERE check_ref = p_check_ref AND locked_by = p_locked_by
  ) INTO lock_acquired;

  RETURN lock_acquired;
END;
$$ LANGUAGE plpgsql;
