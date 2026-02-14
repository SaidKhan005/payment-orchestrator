# Payment Proxy Test Suite

## Overview
This test suite validates the payment orchestration proxy that solves Ethor's duplicate charge problem ($120K-360K annual savings).

## Test Files

### 1. test-proxy-payment.js (Automated Suite)
**Purpose:** Comprehensive automated testing with mock gateway
**Run:** `node tests/test-proxy-payment.js`
**Tests:**
- Health check
- Basic payment flow
- Idempotency (duplicate prevention)
- Payment query
- Reconciliation queue
- Field validation
- PCI compliance (raw card rejection)
- Multiple sequential payments
- Mock gateway management

**Expected:** 9/9 tests passing

### 2. test-real-check.js (Real Simphony Integration)
**Purpose:** Validate tender posting to actual Simphony check
**Run:** `node tests/test-real-check.js`
**Requirements:**
- Server running (`npm start`)
- Valid Simphony credentials in `.env`
- Real check reference
- Tender media ref 3801 (eThor Cash)

**Expected:** Successfully posts tender to real check

### 3. test-idempotency-real.js (Duplicate Prevention Proof)
**Purpose:** Prove idempotency prevents duplicate charges
**Run:** `node tests/test-idempotency-real.js`
**What it does:**
- Sends same payment request twice
- Verifies same intentId returned
- Verifies same authId returned
- Confirms NO duplicate charge

**Expected:** Same payment intent for both requests

### 4. analyze-check.js (Debug Utility)
**Purpose:** Inspect check details from Simphony
**Run:** `node tests/analyze-check.js <checkRef>`
**Shows:**
- Check status and totals
- All tenders (payments)
- Menu items by seat
- Discounts and service charges
- Negative balance detection

**Use for:** Troubleshooting and verification

## Running All Tests
```bash
# 1. Start server
npm start

# 2. Run automated suite set # .env SIMPHONY_USE_MOCK_TENDER=true ELAVON_USE_SANDBOX=true  # or mock
node tests/test-proxy-payment.js

# 3. Run real Simphony test (update checkRef first) set mock tenders and sandbock to false.
node tests/test-real-check.js

# 4. Run idempotency test (update checkRef first)
node tests/test-idempotency-real.js

# 5. Analyze a check (replace with an open check) -> run list checks from simpony middleware test to get a reference to the check
node tests/analyze-check.js 2e041fb968d54e74adbab1eb9801aa5400000646
```

## Configuration

Tests require:
- `.env` file with Simphony credentials
- PostgreSQL database running
- Server running on port 3000

## What We're Proving

1. **Idempotency works** - No duplicate charges
2. **Real Simphony integration works** - Tenders post successfully
3. **Audit trail works** - All payments logged
4. **Reconciliation works** - Failed payments tracked
5. **PCI compliance** - Raw card data rejected

## Success Criteria

- All automated tests passing (9/9)
- Real tender posted to Simphony
- Idempotency validated (same result for duplicate requests)
- No duplicate charges in gateway logs
