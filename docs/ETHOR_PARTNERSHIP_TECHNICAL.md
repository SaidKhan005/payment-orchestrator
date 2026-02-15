# Ethor Partnership: Technical Integration Requirements

**Date:** February 15, 2026
**Prepared by:** Said Khan
**Audience:** Ethor Engineering Team

---

## Technical Summary

This document outlines the technical requirements, architecture, and integration points for deploying a payment orchestration proxy between Ethor handhelds and payment gateways.

**Goal:** Eliminate duplicate charges through idempotency while maintaining full compatibility with existing Ethor infrastructure.

---

## Current Architecture (Problem State)

### Payment Flow Today

```
┌─────────────┐
│   ETHOR     │
│  HANDHELD   │
└──────┬──────┘
       │ Direct API call
       ▼
┌─────────────┐     ┌──────────────┐
│   ELAVON    │────→│   SIMPHONY   │
│   GATEWAY   │     │     POS      │
└─────────────┘     └──────────────┘
```

### Current Failure Mode

**Scenario:**
1. Ethor initiates payment for $50.00
2. Elavon approves, returns Auth ID: `ABC123`
3. **Network timeout** — response never reaches Ethor
4. Ethor **assumes failure**, generates **new** payment request
5. Elavon sees **new request**, approves again with Auth ID: `DEF456`
6. **Result:** Customer charged twice ($100 instead of $50)

**Root Cause:** No idempotency layer between Ethor and gateway

---

## Proposed Architecture (Solution State)

### Payment Flow with Proxy

```
┌─────────────┐
│   ETHOR     │
│  HANDHELD   │
└──────┬──────┘
       │ Same API format (URL change only)
       ▼
┌─────────────────────┐
│  PAYMENT PROXY      │ ← Idempotency Layer
│  (Our System)       │
└──────┬──────────────┘
       │
   ┌───┴───┐
   ▼       ▼
┌──────┐ ┌──────────┐
│ELAVON│ │SIMPHONY  │
└──────┘ └──────────┘
```

### New Behavior with Proxy

**Same Scenario (with proxy):**
1. Ethor initiates payment for $50.00 (`merchantReference: UUID-123`)
2. Proxy forwards to Elavon
3. Elavon approves, Auth ID: `ABC123`
4. Network timeout — response lost
5. Ethor retries with **SAME** `merchantReference` (`UUID-123`)
6. Proxy detects duplicate (`UUID-123` already processed)
7. Proxy returns cached response (Auth ID: `ABC123`)
8. **Result:** Customer charged once ($50 total) ✅

---

## Critical Integration Assumptions

### ASSUMPTION #1: Configuration-Based URL Change

**Question:** Can Ethor change payment gateway URL via configuration without code deployment?

**What we need:**
```json
// Current Ethor configuration (assumed)
{
  "payment_gateway": {
    "url": "https://api.convergepay.com/VirtualMerchant",
    "timeout_ms": 20000
  }
}

// Required change:
{
  "payment_gateway": {
    "url": "https://proxy.safari.com/api/proxy/payment",
    "timeout_ms": 35000
  }
}
```

**Impact:** **BLOCKING** — Cannot integrate without ability to change endpoint

---

### ASSUMPTION #2: Stable Idempotency Key

**Question:** Does Ethor generate a stable payment reference ID that persists across retries?

**What we need:**
```json
// First attempt
{
  "merchantReference": "ethor-pay-550e8400-e29b-41d4-a716-446655440000",
  "amount": 50.00,
  "cardToken": "tok_xxx"
}

// Retry attempt (after timeout) — SAME merchantReference
{
  "merchantReference": "ethor-pay-550e8400-e29b-41d4-a716-446655440000",
  "amount": 50.00,
  "cardToken": "tok_xxx"
}
```

**Critical Questions:**
1. Does Ethor generate a unique ID per payment attempt?
2. Is this ID **stable across retries**, or does it regenerate on retry?
3. What field name is used? (`merchantReference`, `transactionId`, `paymentId`?)
4. If Ethor doesn't have this, can it be added?

**Impact:** **BLOCKING** — Idempotency requires stable key

**Workaround if Ethor regenerates IDs:**
- Our proxy generates ID on first request, returns it to Ethor
- Ethor must store and use same ID on retry

---

### ASSUMPTION #3: Timeout Threshold

**Question:** What is Ethor's current payment timeout, and can it be increased?

**Why this matters:**
```
Our proxy processing time:
- Gateway call:    1–10 seconds
- Simphony call:   1–15 seconds
- Buffer:          5 seconds
- Total typical:   7–30 seconds
- Worst case:      35 seconds

If Ethor timeout = 20 seconds:
- Ethor times out before we finish
- Ethor retries while we're still processing
- Creates race condition
```

**What we need:**
- Current Ethor payment timeout value (seconds)
- Can timeout be increased to 35–40 seconds?
- Is this configurable per-integration?

**Impact:** **HIGH PRIORITY** — Affects reliability

---

### ASSUMPTION #4: Retry Behavior

**Question:** What is Ethor's current retry logic for payment requests?

**What we need to know:**
1. How many retries? (e.g., 3 attempts max)
2. Backoff strategy? (immediate, exponential, fixed delay?)
3. Timeout threshold before retry?
4. What triggers a retry? (network error, timeout, 500 status?)

**Impact:** MEDIUM — Affects operational metrics and alerting thresholds

---

### ASSUMPTION #5: Simphony Context Availability

**Question:** Does Ethor have access to Simphony `checkRef` and `rvcRef` when processing payments?

**What we need in the payment request:**
```json
{
  "merchantReference": "uuid-stable-per-attempt",
  "checkRef": "9a557a26fc56468c9ebc3359849380c400000646",
  "rvcRef": 301,
  "amount": 50.00,
  "cardToken": "tok_xxx",
  "tenderMediaRef": "3801"
}
```

**Critical Questions:**
1. Does Ethor know the Simphony `checkRef` when processing payment?
2. Does Ethor know the `rvcRef` (revenue center)?
3. How does Ethor currently interact with Simphony?

**Impact:** **BLOCKING** — Cannot post tender without `checkRef`

If Ethor does NOT have `checkRef`, the proxy cannot post to Simphony automatically. Two options:
- Ethor adds Simphony context to payment requests
- Proxy handles gateway-only (no Simphony tender posting)

---

### ASSUMPTION #6: Request/Response Format

**Question:** What is the exact API contract Ethor sends to Elavon today?

**What we need:**
- Sample request payload (JSON/XML/form-encoded?)
- Sample success response
- Sample error response
- Required headers
- Authentication mechanism

**Our proxy will:**
- Accept Ethor's exact request format
- Return Ethor's expected response format
- Add idempotency transparently

**Impact:** **HIGH PRIORITY** — Determines integration complexity

---

## Required Data in Payment Request

### Minimum Required Fields

**Payment Identification:**
```json
{
  "merchantReference": "uuid-stable-per-attempt",
  "checkRef": "simphony-check-reference",
  "rvcRef": 301
}
```

**Payment Details:**
```json
{
  "amount": 50.00,
  "cardToken": "tok_xxxxx",
  "tenderMediaRef": "3801"
}
```

**Optional but Valuable:**
```json
{
  "employeeRef": 51,
  "deviceId": "ethor-tablet-12",
  "locationId": "safari-downtown"
}
```

---

## Response Contract from Proxy

### Success Response
```json
HTTP 200 OK
{
  "success": true,
  "intentId": "f7d52276-2cec-42a5-89d0-3528dac6c95a",
  "authId": "AUTH_1_1770987616260",
  "transactionId": "TXN_1770987616260_abc123",
  "tenderRef": "TENDER_1770987617860",
  "state": "AUTHORIZED",
  "amount": 50.00,
  "idempotent": false,
  "timestamp": "2026-02-15T10:30:00.000Z"
}
```

### Idempotent Cache Hit (Retry)
```json
HTTP 200 OK
{
  "success": true,
  "intentId": "f7d52276-2cec-42a5-89d0-3528dac6c95a",
  "authId": "AUTH_1_1770987616260",
  "transactionId": "TXN_1770987616260_abc123",
  "tenderRef": "TENDER_1770987617860",
  "state": "AUTHORIZED",
  "amount": 50.00,
  "idempotent": true,
  "cachedAt": "2026-02-15T10:30:00.000Z"
}
```

### Retryable Error
```json
HTTP 503 Service Unavailable
{
  "success": false,
  "state": "FAILED_RETRYABLE",
  "error": "Gateway timeout — payment status unknown",
  "canRetry": true,
  "retryAfterMs": 5000,
  "intentId": "f7d52276-...",
  "merchantReference": "uuid-123"
}
```

### Fatal Error
```json
HTTP 400 Bad Request
{
  "success": false,
  "state": "FAILED_FINAL",
  "error": "Missing required field: checkRef",
  "canRetry": false,
  "validationErrors": ["checkRef is required"]
}
```

---

## Deployment Plan

### Phase 1: Test Environment (Week 1)
- Deploy proxy to staging
- Ethor points 1 test device to proxy
- Validate request/response format
- Test timeout scenarios

### Phase 2: Safari Pilot (Week 2–3)
- Deploy to 1 Safari location
- Monitor for 7 days
- Measure duplicate prevention
- Validate latency acceptable

### Phase 3: Safari Rollout (Week 4–8)
- Deploy to all 24 Safari locations
- 3 locations per week
- Monitor metrics
- Document results

### Phase 4: Broader Ethor Customer Rollout (Month 3+)
- Offer to other Ethor customers
- Use Safari as case study
- Progressive deployment

---

## Rollback Plan

**If issues detected:**
1. Change Ethor config to point back to Elavon direct
2. No code deployment needed
3. **5-minute rollback time**

**Rollback triggers:**
- Payment success rate < 95%
- Latency > 5 seconds P95
- Critical bug detected

---

## Technical Success Criteria

### Integration Complete When:
- ✅ Ethor can send payment requests to proxy
- ✅ Proxy processes and returns responses in expected format
- ✅ Idempotency prevents duplicates (verified by test)
- ✅ Split-brain detection working
- ✅ Latency < 3 seconds P95
- ✅ Success rate > 99%

### Production Ready When:
- ✅ Deployed to 1 Safari location for 7 days
- ✅ Zero duplicates detected
- ✅ Zero customer complaints
- ✅ Rollback tested and verified
- ✅ Monitoring operational

---

## Open Questions for Ethor

### CRITICAL (Must answer before integration)

| # | Question | Impact |
|---|----------|--------|
| 1 | Can payment gateway URL be changed via config? | BLOCKING |
| 2 | Does Ethor generate stable `merchantReference` across retries? | BLOCKING |
| 3 | Current timeout? Can it be increased to 35s? | HIGH |
| 4 | Exact API contract Ethor sends to Elavon? | HIGH |
| 5 | Does Ethor have `checkRef` and `rvcRef` available? | BLOCKING |

### IMPORTANT (Need for production)

| # | Question |
|---|----------|
| 6 | How many retries? What backoff? |
| 7 | Can Ethor handle JSON responses? |
| 8 | Does Ethor support custom headers? |
| 9 | Does Ethor send location identifier? |
| 10 | Does Ethor send device/terminal ID? |

### NICE-TO-HAVE

| # | Question |
|---|----------|
| 11 | What correlation IDs does Ethor use in logs? |
| 12 | Can Ethor share payment volume metrics? |
| 13 | Is a test/sandbox environment available? |

---

## Next Steps

### Immediate (This Week)
1. Ethor answers critical questions above
2. Schedule technical deep-dive call
3. Review and approve integration architecture

### Week 1–2
1. Deploy proxy to staging environment
2. Ethor provides test environment access
3. API integration testing
4. Validate request/response formats

### Week 3–4
1. Deploy to 1 Safari location
2. Monitor for 7 days
3. Measure results
4. Proceed to full rollout if successful

---

**Prepared by:** Said Khan
**Email:** said@junglejims.ca
**Date:** February 15, 2026
**Status:** Ready for Ethor Technical Review

**Related Documents:**
- [Executive Partnership Brief](ETHOR_PARTNERSHIP_EXECUTIVE.md)
- [Solution & Safari Validation](ETHOR_PARTNERSHIP_SOLUTION.md)
- [API Documentation](API.md)
