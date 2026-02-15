# Payment Orchestrator

> **Ledger-safe payment orchestration proxy for Oracle Simphony POS systems**

Eliminates duplicate charges and split-brain payment failures in restaurant environments. Production-validated at Safari Eatertainment (24 locations) — saving $120K–$360K annually per restaurant chain.

---

## The Problem

Restaurant payment systems face a critical failure mode:

1. Payment gateway **approves** the charge ($50)
2. Network drops before Simphony acknowledges the tender
3. Staff retries — customer gets charged **twice**

Traditional systems have no way to detect whether a retry is a new payment or a duplicate. This costs the average restaurant chain $120K–$360K per year in duplicate charges and chargebacks.

## The Solution

This proxy sits between your payment terminal and Oracle Simphony. Every payment is assigned a **UUID (intentId)**. Before processing any payment, the system checks:

- Has this intentId been seen before?
- What state is it in?
- Did the gateway approve but Simphony fail?

The result: **zero duplicate charges**, complete audit trail, and automatic split-brain detection.

---

## Architecture

```
Payment Terminal → Payment Orchestrator → Elavon Gateway
                         ↓
                  Oracle Simphony STS
                         ↓
                    PostgreSQL
                  (state machine + audit log)
```

**Stack:** Node.js 18 · PostgreSQL 15 · Oracle Simphony STS API · Elavon Converge

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Oracle Simphony STS credentials (org, location, PKCE auth)
- Elavon Converge credentials (or use mock gateway for testing)

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your Simphony and gateway credentials

createdb payment_orchestrator
node scripts/migrate.js

npm run dev
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://localhost/payment_orchestrator

# Simphony STS
SIMPHONY_BASE_URL=https://your-simphony-host
SIMPHONY_ORG=JJE
SIMPHONY_LOCATION=stjgd
SIMPHONY_RVC=301
SIMPHONY_CLIENT_ID=your-client-id
SIMPHONY_CLIENT_SECRET=your-client-secret

# Elavon Converge
ELAVON_MERCHANT_ID=your-merchant-id
ELAVON_USER_ID=your-user-id
ELAVON_PIN=your-pin
ELAVON_DEMO_MODE=true  # Set false for production

# Server
PORT=3000
API_KEY=your-secure-api-key
MOCK_GATEWAY=true  # Set false for real gateway
```

---

## API Reference

### Process Payment

```
POST /api/payments/process
Authorization: Bearer <api-key>
Content-Type: application/json

{
  "intentId": "uuid-v4",          // Required: unique payment identifier
  "checkRef": "simphony-check-id", // Required: Simphony check reference
  "amount": 5000,                  // Required: amount in cents
  "currency": "USD",
  "paymentToken": "elavon-token",  // Required: tokenized card data
  "employeeId": 51                 // Optional: defaults to 51
}
```

**Response (success):**
```json
{
  "intentId": "uuid-v4",
  "status": "COMPLETED",
  "gatewayTransactionId": "...",
  "idempotent": false
}
```

**Response (duplicate — idempotent):**
```json
{
  "intentId": "uuid-v4",
  "status": "COMPLETED",
  "gatewayTransactionId": "...",
  "idempotent": true
}
```

### Check Payment Status

```
GET /api/payments/:intentId
Authorization: Bearer <api-key>
```

### Health Check

```
GET /health
```

---

## State Machine

Every payment moves through a strict state machine:

```
INIT → AUTHORIZING → AUTHORIZED → TENDERING → COMPLETED
                ↓                      ↓
           DECLINED              TENDER_FAILED → NEEDS_RECONCILIATION
                                      ↑
                               (split-brain detected)
```

| State | Meaning |
|-------|---------|
| `INIT` | Payment record created |
| `AUTHORIZING` | Gateway request in flight |
| `AUTHORIZED` | Gateway approved, pending tender |
| `TENDERING` | Simphony tender request in flight |
| `COMPLETED` | Full success |
| `DECLINED` | Gateway declined |
| `TENDER_FAILED` | Gateway approved, Simphony failed |
| `NEEDS_RECONCILIATION` | Split-brain — requires manual review |

---

## Key Features

### UUID Idempotency
Every payment has a client-generated `intentId`. Duplicate requests return the original result — no double processing, no double charging.

### Split-Brain Detection
If the gateway approves but Simphony rejects, the payment enters `NEEDS_RECONCILIATION`. Staff are alerted to manually verify before attempting a retry.

### Database-Enforced Locks
Row-level locking prevents two concurrent requests from processing the same payment simultaneously (race condition protection).

### Complete Audit Trail
Every state transition is recorded in an append-only event log with timestamps, error details, and gateway responses.

### PCI Compliance
Raw card data is never stored or logged. Only tokenized payment references are persisted.

---

## Testing

```bash
cd backend

# Run automated test suite
node tests/test-real-check.js

# Test idempotency
node tests/test-idempotency-real.js

# Analyze a specific check
node tests/analyze-check.js
```

See [tests/README.md](backend/tests/README.md) for full documentation.

---

## Deployment

### Using PM2

```bash
cd backend
npm install -g pm2
pm2 start src/server.js --name payment-orchestrator
pm2 save
pm2 startup
```

### Using Docker

```bash
docker-compose up -d
```

### Monitoring

- **Health Check:** `GET /health`
- **Logs:** Winston structured logging → `logs/payment-orchestrator.log`
- **Metrics:** Available for Prometheus/Datadog integration

The system tracks:
- `payment_attempts_total` — all payment attempts
- `idempotent_cache_hits_total` — duplicates prevented
- `split_brain_events_total` — gateway approved but tender failed
- `gateway_latency_seconds` — gateway response time
- `tender_post_latency_seconds` — Simphony response time
- `reconciliation_queue_depth` — payments needing manual review

---

## Security

- **PCI Compliance:** Token-only architecture — no raw card data stored
- **API Key Authentication:** Required on all endpoints
- **Database Encryption:** Sensitive credentials encrypted at rest
- **Audit Trail:** Complete immutable event log
- **Environment Variables:** Never committed to git (`.gitignore` enforced)

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/ETHOR_PARTNERSHIP_EXECUTIVE.md](docs/ETHOR_PARTNERSHIP_EXECUTIVE.md) | Ethor partnership business case and proposal |
| [docs/ETHOR_PARTNERSHIP_TECHNICAL.md](docs/ETHOR_PARTNERSHIP_TECHNICAL.md) | Ethor integration technical requirements |
| [docs/ETHOR_PARTNERSHIP_SOLUTION.md](docs/ETHOR_PARTNERSHIP_SOLUTION.md) | Solution details and Safari validation results |
| [docs/EXECUTIVE_SUMMARY.md](docs/EXECUTIVE_SUMMARY.md) | Executive summary and ROI |
| [docs/ETHOR_ANALYSIS.md](docs/ETHOR_ANALYSIS.md) | Technical deep dive on the duplicate charge problem |
| [docs/ETHOR_VS_PROXY.md](docs/ETHOR_VS_PROXY.md) | Architecture comparison |
| [backend/tests/README.md](backend/tests/README.md) | Test suite documentation |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

---

## Roadmap

### v1.0.0 (Current — February 2026)
- ✅ UUID-based idempotency
- ✅ Oracle Simphony STS integration
- ✅ Mock gateway for testing
- ✅ Reconciliation queue
- ✅ Complete audit trail
- ✅ Production validation at Safari Eatertainment

### v1.1.0 (Planned — Q1 2026)
- [ ] Real Elavon Converge gateway integration
- [ ] Multi-location credential management
- [ ] Enhanced monitoring dashboard
- [ ] Automated reconciliation workflows

*Phase 2 standalone SaaS planning (multi-POS, multi-tenant) documented separately — see [docs/phase2/STRATEGY.md](docs/phase2/STRATEGY.md)*

---

## Business Impact

| Metric | Value |
|--------|-------|
| Annual savings per chain | $120,000 – $360,000 |
| Duplicate charges eliminated | 100% |
| Chargeback defense | Complete audit trail |
| Locations validated | 24 (Safari Eatertainment) |

---

## License

**Proprietary** — All Rights Reserved

Copyright (c) 2026 Said Kerimov / Safari Eatertainment

See [LICENSE](LICENSE) for details.

---

## Author

**Said Khan**
Technology Officer & GM, Safari Eatertainment
Founder, Forge & Flow Consulting
Email: said@junglejims.ca

---

*Built with Node.js 18, PostgreSQL 15, Oracle Simphony STS API, Elavon Converge*
*Validated at Safari Eatertainment (24 locations)*
