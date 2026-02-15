# Payment Orchestrator Architecture

## System Overview

The Payment Orchestrator is a ledger-safe payment processing system that integrates Oracle Simphony POS with payment gateways. It ensures payments are processed correctly by enforcing check splitting before authorization, implementing idempotency, and providing comprehensive recovery mechanisms.

```
┌─────────────────┐
│  Flutter App    │
│   (Monitor)     │
└────────┬────────┘
         │ HTTPS/REST
         ▼
┌─────────────────────────────────────────────────┐
│           Payment Orchestrator Backend          │
│                                                  │
│  ┌──────────────┐      ┌──────────────┐        │
│  │ API Routes   │◄────►│ Orchestrator │        │
│  └──────────────┘      └──────┬───────┘        │
│                               │                  │
│  ┌──────────────┐      ┌──────▼───────┐        │
│  │ Intent Mgr   │◄────►│ PostgreSQL   │        │
│  └──────────────┘      └──────────────┘        │
│                                                  │
└──────────┬─────────────────────┬────────────────┘
           │                     │
           ▼                     ▼
┌──────────────────┐   ┌──────────────────┐
│ Simphony POS     │   │ Payment Gateway  │
│ (STS API)        │   │ (Mock/Elavon)    │
└──────────────────┘   └──────────────────┘
```

---

## Core Components

### 1. API Layer

**Location:** `backend/src/api/`

Handles HTTP requests and responses.

**Components:**
- **Routes:**
  - `payments.js` - Payment operations (process, status, listing)
  - `proxy.js` - Drop-in payment proxy endpoint
  - `exceptions.js` - Exception monitoring

- **Middleware:**
  - `auth.js` - API key authentication

**Responsibilities:**
- Request validation
- Response formatting
- Error handling
- Authentication

---

### 2. Payment Orchestrator

**Location:** `backend/src/orchestrator.js`

The core orchestration engine that implements the golden path for ledger-safe payments.

**Key Methods:**

#### `processSeatPayment(masterCheckRef, rvcRef, seatItems, employeeRef)`

The main payment flow:

1. **Acquire Lock** - Prevent concurrent modifications to the same check
2. **Fetch Check** - Get current check state from Simphony
3. **Calculate Total** - Sum amounts for selected seat items
4. **Create Intent** - Record payment intent in database (state: INIT)
5. **Split Check** - Create child check in Simphony (state: CHECK_SPLIT)
6. **Authorize Payment** - Get authorization from gateway (state: AUTHORIZED)
7. **Post Tender** - Apply payment to child check (state: TENDERED)
8. **Close Check** - Finalize child check (state: CLOSED)
9. **Release Lock** - Allow other operations

#### `recoverPayment(intentId)`

Idempotent recovery flow:

1. **Fetch Intent** - Get current state from database
2. **Query Gateway** - Check if authorization already exists
3. **Resume from State** - Continue from last successful step
4. **Retry Failed Operations** - Safely retry timeouts/failures

**Locking:**
- Simple in-memory Map-based locks
- Prevents race conditions on check modifications
- Automatically released on completion or failure

---

### 3. Simphony Integration

**Location:** `backend/src/simphony/`

Handles all interactions with Oracle Simphony POS via the STS API.

#### Tender Operations (`tender-operations.js`)

- **postTender(checkRef, rvcRef, tenderData)** - Post payment to check
- **RetryableTenderError** - Marks errors that can be safely retried

#### Authentication (`auth/sts-auth.js`)

Implements OIDC PKCE flow for Simphony authentication:

1. **Generate PKCE** - Create code verifier and challenge
2. **Authorization** - Request authorization code
3. **Sign In** - Authenticate with credentials
4. **Token Exchange** - Exchange code for access token
5. **Token Caching** - Cache tokens for 50 minutes

---

### 4. Payment Gateway Integration

**Location:** `backend/src/payment/mock-gateway.js`

Simulates payment gateway behavior for development/testing.

**Features:**
- Configurable failure rates
- Timeout simulation
- Idempotency checking (by merchantReference)
- Transaction storage and querying

**Production:**
Replace with actual gateway client (Elavon, Stripe, etc.) implementing the same interface:
- `authorize({ amount, merchantReference, cardDetails })`
- `queryTransaction(merchantReference)`
- `voidTransaction(authId)`

---

### 5. Payment Intent Manager

**Location:** `backend/src/payment/intent-manager.js`

Manages payment intent lifecycle and database operations.

**Key Methods:**
- **createIntent()** - Create new payment intent
- **getIntent()** - Fetch intent by ID
- **updateState()** - Update intent state and fields
- **logEvent()** - Record state transition events
- **logException()** - Record errors and exceptions
- **listIntents()** - Query intents with filters
- **getExceptions()** - Query unresolved exceptions

**Database Schema:**

```sql
-- Payment intents
payment_intents (
  intent_id UUID PRIMARY KEY,
  master_check_ref VARCHAR(100),
  child_check_ref VARCHAR(100),
  rvc_ref INTEGER,
  amount DECIMAL(10,2),
  state VARCHAR(20),
  auth_id VARCHAR(100),
  gateway_reference VARCHAR(100),
  seat_items JSONB,
  employee_ref VARCHAR(50),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- State transition events
payment_events (
  event_id SERIAL PRIMARY KEY,
  intent_id UUID REFERENCES payment_intents,
  event_type VARCHAR(50),
  from_state VARCHAR(20),
  to_state VARCHAR(20),
  details JSONB,
  created_at TIMESTAMP
)

-- Exception tracking
payment_exceptions (
  exception_id SERIAL PRIMARY KEY,
  intent_id UUID REFERENCES payment_intents,
  exception_type VARCHAR(50),
  severity VARCHAR(20),
  message TEXT,
  stack_trace TEXT,
  resolved BOOLEAN,
  created_at TIMESTAMP
)
```

---

### 6. Flutter Monitoring App

**Location:** `flutter_app/`

Real-time monitoring dashboard for payment operations.

**Architecture:**

```
lib/
├── main.dart               # App entry point
├── models/                 # Data models
│   ├── payment_intent.dart
│   └── payment_exception.dart
├── services/               # API communication
│   ├── api_service.dart
│   └── payment_service.dart
├── screens/                # UI screens
│   ├── home/
│   ├── payments/
│   └── exceptions/
├── widgets/                # Reusable components
└── utils/                  # Utilities & constants
```

**State Management:**
- Provider pattern for dependency injection
- Stateful widgets for local state
- Pull-to-refresh for data updates

**Features:**
- Payment intent listing with state filters
- Detailed payment view with timeline
- Exception monitoring
- Payment recovery trigger
- Real-time status updates

---

## Payment Flow Diagram

```
┌──────────┐
│  START   │
└────┬─────┘
     │
     ▼
┌─────────────────┐
│ Acquire Lock    │
└────┬────────────┘
     │
     ▼
┌─────────────────┐
│ Get Check       │
│ Detail          │
└────┬────────────┘
     │
     ▼
┌─────────────────┐
│ Calculate       │
│ Seat Total      │
└────┬────────────┘
     │
     ▼
┌─────────────────┐
│ Create Intent   │
│ (INIT)          │
└────┬────────────┘
     │
     ▼
┌─────────────────┐
│ Split Check     │◄─── CRITICAL: Ledger safety
│ (CHECK_SPLIT)   │     Check split BEFORE auth
└────┬────────────┘
     │
     ▼
┌─────────────────┐
│ Authorize       │
│ Payment         │
│ (AUTHORIZED)    │
└────┬────────────┘
     │
     ▼
┌─────────────────┐
│ Post Tender     │
│ (TENDERED)      │
└────┬────────────┘
     │
     ▼
┌─────────────────┐
│ Close Check     │
│ (CLOSED)        │
└────┬────────────┘
     │
     ▼
┌─────────────────┐
│ Release Lock    │
└────┬────────────┘
     │
     ▼
┌──────────┐
│   END    │
└──────────┘
```

---

## State Transitions

```
INIT
  │
  ├──► CHECK_SPLIT
  │       │
  │       ├──► AUTHORIZED
  │       │       │
  │       │       ├──► TENDERED
  │       │       │       │
  │       │       │       └──► CLOSED ✓
  │       │       │
  │       │       └──► FAILED (retry from AUTHORIZED)
  │       │
  │       └──► FAILED (retry from CHECK_SPLIT)
  │
  └──► FAILED (retry from INIT)

CLOSED ──► VOIDED (refund scenario)
```

---

## Idempotency Strategy

### Gateway Level
- Use `intentId` as `merchantReference`
- Gateway client checks for existing transactions
- Returns existing authorization if found
- Prevents double charges

### Database Level
- Intent ID is UUID, globally unique
- State transitions are logged in events table
- Recovery queries current state before retrying

### API Level
- Recovery endpoint can be called multiple times
- Operations are state-aware and skip completed steps
- Tender posting checks if already posted

---

## Error Handling

### Retryable Errors
- Network timeouts
- Temporary gateway unavailability
- Simphony API timeouts
- Transaction in progress errors

**Strategy:** Log exception, mark intent as FAILED, allow recovery

### Non-Retryable Errors
- Card declined
- Invalid check reference
- Authorization failed
- Validation errors

**Strategy:** Log exception, mark intent as FAILED, require manual intervention

### Exception Severity Levels
- **ERROR** - Payment failed, immediate attention required
- **WARNING** - Recoverable issue, automatic retry possible
- **INFO** - Informational, no action needed

---

## Security Architecture

### Authentication
- API key authentication for all endpoints
- Simphony PKCE flow with cached tokens
- No credentials stored in database

### Data Protection
- Card numbers masked in storage
- PCI compliance through gateway
- Sensitive data not logged

### Network Security
- HTTPS in production
- API keys in environment variables
- Database credentials secured

---

## Deployment Model

This system is designed for **single-tenant deployment** — one instance per restaurant group.

Current architecture supports:
- Single PostgreSQL instance per deployment
- Single Node.js process (or PM2 cluster on one host)
- Per-location Simphony credentials via environment variables

*Multi-tenant, multi-POS scalability plans are documented separately — see [phase2/TECHNICAL_REQUIREMENTS.md](phase2/TECHNICAL_REQUIREMENTS.md)*

---

## Monitoring & Observability

### Metrics to Track
- Payment success rate by state
- Average processing time per state
- Exception rate by type
- Gateway response times
- Database query performance

### Logging
- Structured JSON logs with Winston
- Correlation IDs (intentId) in all logs
- Log levels: error, warn, info, debug
- Separate error log file

### Alerting
- Failed payments exceeding threshold
- High exception rate
- Gateway unavailability
- Database connection issues

---

## Disaster Recovery

### Backup Strategy
- Daily database backups
- Transaction log archival
- Configuration backup

### Recovery Procedures
1. **Database Failure** - Restore from latest backup
2. **Gateway Outage** - Payment queue for retry
3. **Simphony Outage** - Hold payments until restored
4. **Data Corruption** - Restore from backup, replay events

### Data Retention
- Payment intents: 7 years (compliance)
- Events: 1 year
- Exceptions: 90 days (resolved), 1 year (unresolved)
- Logs: 30 days

---

## Testing Strategy

### Unit Tests
- Orchestrator logic
- Gateway client
- Intent manager
- State transitions

### Integration Tests
- End-to-end payment flow
- Recovery scenarios
- Simphony API integration
- Database operations

### Load Tests
- Concurrent payment processing
- Lock contention scenarios
- Database performance
- Gateway timeout handling

### Mock Testing
- Mock gateway with configurable failures
- Simulated network issues
- State corruption scenarios
