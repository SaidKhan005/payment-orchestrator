# Phase 2 Technical Requirements: Multi-Tenant Simphony SaaS

**Status:** Planning — Post-Ethor Partnership
**Date:** February 15, 2026

---

> **Note:** These are planning requirements for Phase 2. The current codebase is single-tenant (Phase 1).
> Do not implement these changes until Phase 1 (Ethor partnership) is validated.

---

## Phase 1 vs Phase 2 Architecture

### Phase 1: Single-Tenant (Current)

```
[Customer A]
     ↓
[Payment Proxy Instance A]
     ↓
[PostgreSQL - Customer A data]
```

**Deployment:** One instance per restaurant group
**Configuration:** Environment variables per deployment
**Limitations:** Manual setup for each customer; not scalable beyond ~10 customers

---

### Phase 2: Multi-Tenant SaaS

```
[Customer A]  [Customer B]  [Customer C]
     ↓               ↓              ↓
          [Load Balancer]
                 ↓
     [Payment Proxy — Shared Service]
                 ↓
     [PostgreSQL — Row-Level Tenant Isolation]
                 ↓
     [Tenant Credential Store — Encrypted]
```

**Deployment:** Single shared service
**Configuration:** Self-service portal
**Scalability:** 10–10,000 customers on shared infrastructure

---

## Multi-Tenant Database Design

### Tenant Table

```sql
CREATE TABLE tenants (
  tenant_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(200) NOT NULL,
  slug           VARCHAR(50) UNIQUE NOT NULL,  -- URL-safe identifier
  status         VARCHAR(20) DEFAULT 'active', -- active, suspended, trial
  plan           VARCHAR(20) DEFAULT 'starter',
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);
```

### Tenant Isolation Pattern

Every data table gets a `tenant_id` foreign key:

```sql
CREATE TABLE payment_intents (
  intent_id      UUID PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id),
  -- ... existing columns
);

-- Row-level security (PostgreSQL RLS)
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON payment_intents
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

### Tenant Credential Store

```sql
CREATE TABLE tenant_credentials (
  credential_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id),
  location_ref   VARCHAR(50) NOT NULL,   -- Simphony location
  credential_type VARCHAR(50) NOT NULL,  -- 'simphony' | 'elavon'
  data_encrypted BYTEA NOT NULL,         -- AES-256 encrypted JSON
  created_at     TIMESTAMP DEFAULT NOW()
);
```

---

## Authentication & Authorization

### Current (Phase 1): Single API Key

```
X-API-Key: <static key from environment variable>
```

### Phase 2: Tenant-Scoped JWT

```
Authorization: Bearer <jwt-token>

JWT payload:
{
  "tenantId": "uuid",
  "locationId": "stjgd",
  "permissions": ["payments:write", "payments:read"],
  "exp": 1234567890
}
```

**Tenant onboarding flow:**
1. Customer signs up via portal
2. Portal creates tenant record
3. Portal issues API key scoped to tenant
4. Customer configures Simphony + gateway credentials
5. Customer points payment terminals at their tenant endpoint

---

## Credential Management Service

### Requirements

- **Encryption:** AES-256-GCM for credentials at rest
- **Key management:** AWS KMS or Azure Key Vault (no self-managed keys)
- **Rotation:** API for credential rotation without downtime
- **Validation:** Test credentials before saving
- **Isolation:** No cross-tenant credential access possible

### Credential Validation Flow

```
Customer enters Simphony credentials
        ↓
System tests auth against Simphony STS
        ↓
If success: encrypt and store
If failure: return error with diagnosis
        ↓
Customer enters Elavon credentials
        ↓
System tests authorization ($0.00 test auth)
        ↓
If success: encrypt and store
If failure: return error with diagnosis
```

---

## Self-Service Onboarding Portal

### Required Features

**Account Management:**
- Sign up / email verification
- Team member management (invite, roles)
- Billing management (credit card, invoices)
- API key management (create, rotate, revoke)

**Location Management:**
- Add/remove Simphony locations
- Configure credentials per location
- Test connection before going live
- Status dashboard per location

**Monitoring Dashboard:**
- Payment volume (real-time)
- Idempotency cache hit rate
- Error rate and breakdown
- Reconciliation queue (payments needing attention)
- Recent payment audit trail

---

## Infrastructure Changes

### Load Balancing

- **Phase 1:** Single Node.js process (or PM2 on one host)
- **Phase 2:** Multiple instances behind load balancer

**Requirement:** Session-less architecture (already satisfied — all state in PostgreSQL)

### Database Scaling

- **Phase 1:** Single PostgreSQL instance
- **Phase 2:** PostgreSQL with read replicas

**Connection pooling:** PgBouncer in front of PostgreSQL
**Read/write split:** Payment processing to primary; reporting to replica

### Distributed Locks (Replaces In-Memory Locks)

**Phase 1:** `Map`-based in-memory locks (works only on single instance)

**Phase 2:** Redis-based distributed locks

```javascript
// Current (Phase 1)
const locks = new Map();

// Phase 2
const redis = require('redis');
await redis.set(`lock:${intentId}`, '1', 'NX', 'EX', 30);
```

**Redis use cases in Phase 2:**
- Distributed payment intent locking
- Rate limiting per tenant
- Session cache for Simphony tokens
- Idempotency cache hot path

### Background Job Processing

**Phase 2 additions:**
- Reconciliation job runner (daily)
- Credential health checks (hourly)
- Usage metering for billing (real-time)
- Tenant health reports (weekly email)

**Technology:** Bull/BullMQ (Redis-backed) or AWS SQS

---

## Billing Integration

### Requirements

- **Platform:** Stripe (metered billing)
- **Model:** Per-location per-month subscription
- **Metering:** Transaction count (optional add-on)
- **Trials:** 14-day free trial
- **Invoicing:** Automatic monthly invoicing

### Billing Schema

```sql
CREATE TABLE tenant_subscriptions (
  subscription_id UUID PRIMARY KEY,
  tenant_id       UUID REFERENCES tenants(tenant_id),
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  plan            VARCHAR(20),
  location_count  INTEGER,
  status          VARCHAR(20),  -- active, past_due, canceled
  current_period_start TIMESTAMP,
  current_period_end   TIMESTAMP
);
```

---

## API Changes for Multi-Tenancy

### Tenant-Scoped Endpoints

All endpoints become tenant-scoped:

```
# Phase 1
POST /api/proxy/payment

# Phase 2
POST /api/v2/{tenantSlug}/proxy/payment
# or via JWT tenant context
POST /api/v2/proxy/payment  (tenant from JWT)
```

### Admin API (New in Phase 2)

```
# Tenant management
GET/POST   /admin/tenants
GET/PUT    /admin/tenants/:tenantId
POST       /admin/tenants/:tenantId/locations

# Billing
GET        /admin/tenants/:tenantId/subscription
POST       /admin/tenants/:tenantId/subscription/upgrade

# Operations
GET        /admin/tenants/:tenantId/health
GET        /admin/tenants/:tenantId/reconciliation-queue
```

---

## Security Additions for Phase 2

### API Rate Limiting (Per Tenant)

```
Per tenant limits:
- 100 payment requests/minute
- 1,000 payment requests/hour
- Configurable per plan tier
```

### Tenant Data Isolation Audit

**Requirement:** Quarterly security audit to verify no cross-tenant data leakage
**Tools:** Row-level security testing, penetration testing

### Compliance Documentation

- SOC 2 Type II (target: 18 months post-launch)
- PCI DSS SAQ-D (already compliant architecture)
- GDPR (if EU expansion)

---

## Migration Path from Phase 1 to Phase 2

### Safari Migration

1. Create Safari tenant record
2. Import existing payment data with `tenant_id` backfill
3. Generate tenant-scoped API key for Safari
4. Update Safari configuration to use new API key
5. Verify all data accessible under new tenant scope
6. Decommission Phase 1 single-tenant deployment

### For New Customers (Phase 2 onwards)

- Fully self-service via portal
- No manual setup required
- Credentials validated automatically before go-live

---

## Development Estimates

| Component | Effort |
|-----------|--------|
| Multi-tenant database schema | 1 week |
| Tenant isolation (RLS) | 1 week |
| Authentication (JWT, API keys) | 1 week |
| Credential management service | 2 weeks |
| Distributed locking (Redis) | 1 week |
| Self-service portal (MVP) | 4 weeks |
| Billing integration (Stripe) | 2 weeks |
| Admin API | 2 weeks |
| Monitoring dashboard | 3 weeks |
| Testing + QA | 2 weeks |
| **Total** | **~19 weeks (~5 months)** |

---

## Prerequisites Before Starting Phase 2

1. ✅ Phase 1 Ethor integration validated
2. ✅ Safari as paying reference customer
3. ✅ Elavon production credentials working
4. Product roadmap approved
5. Infrastructure budget approved (AWS/Azure)
6. Legal: Terms of Service, DPA, Privacy Policy drafted
7. Stripe account set up for billing

---

**Status:** Planning document — not yet in development
**Next Review:** After Phase 1 Ethor partnership is validated
**Owner:** Said Khan (said@junglejims.ca)
