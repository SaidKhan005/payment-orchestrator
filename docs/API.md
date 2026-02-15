# Payment Orchestrator API Documentation

## Base URL
```
http://localhost:3000
```

## Authentication
All API endpoints (except `/health`) require API key authentication via the `X-API-Key` header.

```http
X-API-Key: your_api_key_here
```

---

## Endpoints

### Health Check

**GET** `/health`

Check if the server is running and healthy.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-15T10:30:00.000Z",
  "environment": "development",
  "database": "connected"
}
```

---

### Proxy Payment (Primary Endpoint)

#### Process Payment via Proxy

**POST** `/api/proxy/payment`

Drop-in payment proxy with idempotency. This is the main endpoint for payment terminals and Ethor handhelds.

**Request Body:**
```json
{
  "intentId": "550e8400-e29b-41d4-a716-446655440000",
  "checkRef": "9a557a26fc56468c9ebc3359849380c400000646",
  "amount": 5000,
  "currency": "USD",
  "paymentToken": "tok_xxxx",
  "employeeId": 51
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `intentId` | UUID | Yes | Stable idempotency key — same value on retry |
| `checkRef` | string | Yes | Simphony check reference |
| `amount` | integer | Yes | Amount in cents |
| `currency` | string | No | Default: USD |
| `paymentToken` | string | Yes | Tokenized card data (raw card numbers rejected) |
| `employeeId` | integer | No | Default: 51 |

**Response (success):**
```json
{
  "success": true,
  "intentId": "550e8400-e29b-41d4-a716-446655440000",
  "authId": "AUTH_1_1770987616260",
  "transactionId": "TXN_1770987616260_abc123",
  "state": "AUTHORIZED",
  "amount": 5000,
  "idempotent": false,
  "timestamp": "2026-02-15T10:30:00.000Z"
}
```

**Response (duplicate — idempotent cache hit):**
```json
{
  "success": true,
  "intentId": "550e8400-e29b-41d4-a716-446655440000",
  "authId": "AUTH_1_1770987616260",
  "transactionId": "TXN_1770987616260_abc123",
  "state": "AUTHORIZED",
  "amount": 5000,
  "idempotent": true,
  "cachedAt": "2026-02-15T10:30:00.000Z"
}
```

**Response (declined):**
```json
{
  "success": false,
  "state": "DECLINED",
  "error": "Card declined",
  "canRetry": false
}
```

**Response (split-brain — needs reconciliation):**
```json
{
  "success": false,
  "state": "NEEDS_RECONCILIATION",
  "intentId": "550e8400-e29b-41d4-a716-446655440000",
  "authId": "AUTH_1_1770987616260",
  "error": "Gateway approved but tender posting failed",
  "canRetry": false,
  "actionRequired": "Manual reconciliation — check reconciliation queue"
}
```

---

#### Get Reconciliation Queue

**GET** `/api/proxy/reconciliation-queue`

Get all payments in `NEEDS_RECONCILIATION` state requiring manual review.

**Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "intentId": "550e8400-e29b-41d4-a716-446655440000",
      "checkRef": "9a557a26...",
      "amount": 5000,
      "authId": "AUTH_1_xxx",
      "error": "Simphony tender timeout",
      "createdAt": "2026-02-15T10:30:00.000Z"
    }
  ]
}
```

---

### Payments

#### Get Payment Status

**GET** `/api/payments/:intentId`

Retrieve details of a specific payment intent.

**Response:**
```json
{
  "success": true,
  "data": {
    "intent_id": "550e8400-e29b-41d4-a716-446655440000",
    "check_ref": "9a557a26...",
    "amount": "50.00",
    "state": "AUTHORIZED",
    "auth_id": "AUTH_1_1770987616260",
    "gateway_reference": "TXN_1770987616260_abc123",
    "employee_id": 51,
    "created_at": "2026-02-15T10:30:00.000Z",
    "updated_at": "2026-02-15T10:30:15.000Z"
  }
}
```

---

#### List Payment Intents

**GET** `/api/payments`

List payment intents with optional filters.

**Query Parameters:**
- `limit` (optional): Number of intents to return (default: 50)
- `state` (optional): Filter by state

**Example:**
```
GET /api/payments?limit=20&state=NEEDS_RECONCILIATION
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "intent_id": "550e8400-e29b-41d4-a716-446655440000",
      "check_ref": "9a557a26...",
      "state": "AUTHORIZED",
      "amount": "50.00",
      "created_at": "2026-02-15T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

---

### Exceptions

#### List Payment Exceptions

**GET** `/api/exceptions`

Get payment exceptions for monitoring and troubleshooting.

**Query Parameters:**
- `resolved` (optional): Filter by resolution status (default: false)
- `limit` (optional): Number of exceptions to return (default: 50)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "exception_id": 1,
      "intent_id": "550e8400-e29b-41d4-a716-446655440000",
      "exception_type": "TENDER_TIMEOUT",
      "severity": "WARNING",
      "message": "Timeout posting tender to Simphony",
      "resolved": false,
      "created_at": "2026-02-15T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

---

### Mock Gateway (Development Only)

> **Note:** Only available when `MOCK_GATEWAY=true` in environment.

#### Get All Transactions

**GET** `/api/mock/transactions`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "authId": "AUTH_1_1234567890",
      "transactionId": "TXN_1234567890_abc123",
      "merchantReference": "550e8400-e29b-41d4-a716-446655440000",
      "amount": 5000,
      "status": "APPROVED",
      "timestamp": "2026-02-15T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

#### Reset Mock Gateway

**POST** `/api/mock/reset`

Clear all transactions from the mock gateway.

**Response:**
```json
{
  "success": true,
  "message": "Mock gateway reset successfully"
}
```

---

## Payment States

| State | Meaning |
|-------|---------|
| `INIT` | Payment record created |
| `AUTHORIZING` | Gateway request in flight |
| `AUTHORIZED` | Gateway approved, tender posted |
| `TENDERING` | Simphony tender request in flight |
| `COMPLETED` | Full success |
| `DECLINED` | Gateway declined |
| `TENDER_FAILED` | Gateway approved, Simphony failed |
| `NEEDS_RECONCILIATION` | Split-brain — requires manual review |
| `FAILED_RETRYABLE` | Network error — safe to retry |
| `FAILED_FINAL` | Validation error — manual intervention needed |

---

## Error Responses

| Code | Meaning |
|------|---------|
| 400 | Bad request — missing or invalid parameters |
| 401 | Unauthorized — invalid or missing API key |
| 404 | Not found — intentId does not exist |
| 409 | Conflict — payment already in terminal state |
| 503 | Service unavailable — gateway or Simphony timeout |

---

## Idempotency

The payment system is idempotent by design:

- Use the same `intentId` for retries — the proxy returns the cached result
- Gateway is NOT called again on retry
- The `idempotent: true` flag in the response indicates a cache hit
- Safe to retry on network timeout — no duplicate charges

---

## PCI Compliance

Raw card numbers are rejected at the API level:

```
POST /api/proxy/payment
{ "cardNumber": "4111111111111111" }

→ 400 Bad Request
  { "error": "Raw card data not allowed. Use paymentToken only." }
```

Only tokenized payment references (`paymentToken`) are accepted and stored.
