-- Payment Intents Table
CREATE TABLE IF NOT EXISTS payment_intents (
  intent_id UUID PRIMARY KEY,
  master_check_ref VARCHAR(100) NOT NULL,
  child_check_ref VARCHAR(100),
  rvc_ref INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  state VARCHAR(20) NOT NULL,
  auth_id VARCHAR(100),
  gateway_reference VARCHAR(100),
  seat_items JSONB,
  employee_ref VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_state CHECK (state IN ('INIT', 'CHECK_SPLIT', 'AUTHORIZED', 'TENDERED', 'CLOSED', 'FAILED', 'VOIDED'))
);

CREATE INDEX idx_master_check ON payment_intents(master_check_ref);
CREATE INDEX idx_state ON payment_intents(state);
CREATE INDEX idx_created_at ON payment_intents(created_at DESC);
CREATE INDEX idx_auth_id ON payment_intents(auth_id);

-- Payment Events Table
CREATE TABLE IF NOT EXISTS payment_events (
  event_id SERIAL PRIMARY KEY,
  intent_id UUID NOT NULL REFERENCES payment_intents(intent_id),
  event_type VARCHAR(50) NOT NULL,
  from_state VARCHAR(20),
  to_state VARCHAR(20),
  details JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_intent ON payment_events(intent_id);

-- Payment Exceptions Table
CREATE TABLE IF NOT EXISTS payment_exceptions (
  exception_id SERIAL PRIMARY KEY,
  intent_id UUID REFERENCES payment_intents(intent_id),
  exception_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT,
  stack_trace TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exceptions_unresolved ON payment_exceptions(resolved) WHERE resolved = FALSE;
