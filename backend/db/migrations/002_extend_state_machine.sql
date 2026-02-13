-- Migration: Extend state machine with irreversibility markers
-- Purpose: Add intermediate "in-progress" states and terminal failure states

-- Drop existing constraint
ALTER TABLE payment_intents
  DROP CONSTRAINT IF EXISTS valid_state;

-- Add new state constraint with extended states
ALTER TABLE payment_intents
  ADD CONSTRAINT valid_state CHECK (state IN (
    'INIT',
    'CHECK_SPLITTING',
    'CHECK_SPLIT',
    'AUTHORIZING',
    'AUTHORIZED',
    'TENDERING',
    'TENDERED',
    'CLOSING',
    'CLOSED',
    'FAILED_RETRYABLE',
    'FAILED_FINAL',
    'NEEDS_RECONCILIATION',
    'VOIDED'
  ));

-- Add retry_count and last_error fields for tracking failures
ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Index for finding intents that need reconciliation (common query)
CREATE INDEX IF NOT EXISTS idx_needs_reconciliation
  ON payment_intents(state)
  WHERE state = 'NEEDS_RECONCILIATION';

-- Index for finding retryable failures
CREATE INDEX IF NOT EXISTS idx_failed_retryable
  ON payment_intents(state)
  WHERE state = 'FAILED_RETRYABLE';

-- Migrate existing 'FAILED' states to 'FAILED_RETRYABLE' (safe default)
UPDATE payment_intents
SET state = 'FAILED_RETRYABLE'
WHERE state = 'FAILED';
