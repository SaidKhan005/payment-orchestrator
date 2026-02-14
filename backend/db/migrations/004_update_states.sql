-- Migration 004: Update state machine for atomic gateway + tender flow
--
-- This migration updates the payment_intents table to support the new simplified flow:
-- PENDING -> AUTHORIZING -> TENDERING -> AUTHORIZED (success)
--
-- Removed states (no longer used):
-- - INIT (replaced by PENDING)
-- - CHECK_SPLITTING (Oracle confirmed this API doesn't exist)
-- - CHECK_SPLIT (no check splitting)
-- - TENDERED (combined into AUTHORIZED)
-- - CLOSING (no check closing)
-- - CLOSED (no check closing)
-- - VOIDED (not used in new flow)
--
-- Active states:
-- - PENDING: Intent created, not yet started
-- - AUTHORIZING: Calling gateway for authorization
-- - TENDERING: Gateway approved, posting tender to Simphony
-- - AUTHORIZED: Both gateway and tender succeeded (TERMINAL SUCCESS)
-- - FAILED_RETRYABLE: Gateway declined or network failed before auth (can retry)
-- - FAILED_FINAL: Gateway declined (cannot retry)
-- - NEEDS_RECONCILIATION: Gateway approved but tender posting failed (MANUAL FIX NEEDED)

-- Add new columns for the simplified flow
ALTER TABLE payment_intents
ADD COLUMN IF NOT EXISTS merchant_reference VARCHAR(255),
ADD COLUMN IF NOT EXISTS tender_media_ref VARCHAR(50),
ADD COLUMN IF NOT EXISTS tender_ref VARCHAR(255);

-- Create index for idempotency lookups by merchant reference
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_merchant_reference
ON payment_intents(merchant_reference)
WHERE merchant_reference IS NOT NULL;

-- Update state constraint to include only active states
-- First drop the old constraint if it exists
ALTER TABLE payment_intents DROP CONSTRAINT IF EXISTS payment_intents_state_check;

-- Add new constraint with simplified states
-- Note: We keep old states valid for backward compatibility with existing data
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_state_check
CHECK (state IN (
  -- New simplified states
  'PENDING',
  'AUTHORIZING',
  'TENDERING',
  'AUTHORIZED',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
  'NEEDS_RECONCILIATION',
  -- Legacy states (for existing data)
  'INIT',
  'CHECK_SPLITTING',
  'CHECK_SPLIT',
  'TENDERED',
  'CLOSING',
  'CLOSED',
  'VOIDED'
));

-- Add index on NEEDS_RECONCILIATION for ops dashboard
CREATE INDEX IF NOT EXISTS idx_payment_intents_needs_reconciliation
ON payment_intents(state)
WHERE state = 'NEEDS_RECONCILIATION';

-- Add index on state for general queries
CREATE INDEX IF NOT EXISTS idx_payment_intents_state
ON payment_intents(state);

-- Migrate existing INIT states to PENDING
UPDATE payment_intents
SET state = 'PENDING'
WHERE state = 'INIT';

-- Migrate existing CLOSED states to AUTHORIZED (they completed successfully)
UPDATE payment_intents
SET state = 'AUTHORIZED'
WHERE state = 'CLOSED';

-- Migrate existing TENDERED states to AUTHORIZED (tender posted = success)
UPDATE payment_intents
SET state = 'AUTHORIZED'
WHERE state = 'TENDERED';

-- Add comment explaining the new flow
COMMENT ON TABLE payment_intents IS
'Payment intents with atomic gateway + tender flow.
States: PENDING -> AUTHORIZING -> TENDERING -> AUTHORIZED (success)
Failure states: FAILED_RETRYABLE, FAILED_FINAL, NEEDS_RECONCILIATION';

COMMENT ON COLUMN payment_intents.merchant_reference IS
'Client-provided idempotency key (e.g., from Ethor). Used to prevent duplicate payment attempts.';

COMMENT ON COLUMN payment_intents.tender_media_ref IS
'Simphony tender media object number (e.g., 3 for credit card)';

COMMENT ON COLUMN payment_intents.tender_ref IS
'Simphony tender reference returned after successful tender posting';
