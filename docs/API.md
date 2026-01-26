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
  "timestamp": "2024-01-15T10:30:00.000Z",
  "environment": "development",
  "database": "connected"
}
```

---

### Payments

#### Process Seat Payment

**POST** `/api/payments/seat`

Process a payment for specific seat items on a check. This is the main payment flow that:
1. Splits the check in Simphony
2. Authorizes payment with the gateway
3. Posts tender to Simphony
4. Closes the child check

**Request Body:**
```json
{
  "masterCheckRef": "12345",
  "rvcRef": 1,
  "seatItems": [1, 2, 3],
  "employeeRef": "EMP001"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "intentId": "550e8400-e29b-41d4-a716-446655440000",
    "childCheckRef": "12345-1",
    "authId": "AUTH_1234567890",
    "amount": 45.50,
    "state": "CLOSED"
  }
}
```

**Error Response:**
```json
{
  "error": "Internal Server Error",
  "message": "Failed to split check 12345: Check not found"
}
```

---

#### Recover Payment

**POST** `/api/payments/recover`

Recover a stuck or failed payment by idempotently retrying from the last successful state.

**Request Body:**
```json
{
  "intentId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "intentId": "550e8400-e29b-41d4-a716-446655440000",
    "state": "CLOSED",
    "recovered": true
  }
}
```

---

#### Get Payment Intent

**GET** `/api/payments/:intentId`

Retrieve details of a specific payment intent.

**Response:**
```json
{
  "success": true,
  "data": {
    "intent_id": "550e8400-e29b-41d4-a716-446655440000",
    "master_check_ref": "12345",
    "child_check_ref": "12345-1",
    "rvc_ref": 1,
    "amount": "45.50",
    "state": "CLOSED",
    "auth_id": "AUTH_1234567890",
    "gateway_reference": "TXN_1234567890",
    "seat_items": [1, 2, 3],
    "employee_ref": "EMP001",
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:15.000Z"
  }
}
```

---

#### List Payment Intents

**GET** `/api/payments`

List payment intents with optional filters.

**Query Parameters:**
- `limit` (optional): Number of intents to return (default: 50)
- `state` (optional): Filter by state (INIT, CHECK_SPLIT, AUTHORIZED, TENDERED, CLOSED, FAILED, VOIDED)

**Example:**
```
GET /api/payments?limit=20&state=FAILED
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "intent_id": "550e8400-e29b-41d4-a716-446655440000",
      "master_check_ref": "12345",
      "state": "CLOSED",
      "amount": "45.50",
      "created_at": "2024-01-15T10:30:00.000Z",
      ...
    }
  ],
  "count": 1
}
```

---

### Checks

#### Get Check Detail

**GET** `/api/checks/:checkRef`

Retrieve check details from Simphony.

**Query Parameters:**
- `rvcRef` (required): Revenue center reference

**Example:**
```
GET /api/checks/12345?rvcRef=1
```

**Response:**
```json
{
  "success": true,
  "data": {
    "checkRef": "12345",
    "checkNumber": 12345,
    "totalAmount": 123.45,
    "detailLines": [
      {
        "detailLineRef": 1,
        "menuItemName": "Burger",
        "totalAmount": 12.99
      }
    ]
  }
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

**Example:**
```
GET /api/exceptions?resolved=false&limit=20
```

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
      "stack_trace": "Error: Timeout...",
      "resolved": false,
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

---

### Mock Gateway (Development Only)

#### Get All Transactions

**GET** `/api/mock/transactions`

Get all transactions stored in the mock gateway. Only available when `USE_MOCK_GATEWAY=true`.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "authId": "AUTH_1_1234567890",
      "transactionId": "TXN_1234567890_abc123",
      "merchantReference": "550e8400-e29b-41d4-a716-446655440000",
      "amount": 45.50,
      "status": "APPROVED",
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

---

#### Reset Mock Gateway

**POST** `/api/mock/reset`

Clear all transactions from the mock gateway. Only available when `USE_MOCK_GATEWAY=true`.

**Response:**
```json
{
  "success": true,
  "message": "Mock gateway reset successfully"
}
```

---

## Payment States

Payment intents progress through the following states:

1. **INIT** - Intent created, ready to process
2. **CHECK_SPLIT** - Child check created in Simphony
3. **AUTHORIZED** - Payment authorized by gateway
4. **TENDERED** - Tender posted to Simphony
5. **CLOSED** - Child check closed, payment complete
6. **FAILED** - Payment failed (can be recovered)
7. **VOIDED** - Payment voided

---

## Error Codes

- **400 Bad Request** - Missing or invalid parameters
- **401 Unauthorized** - Invalid or missing API key
- **404 Not Found** - Resource not found
- **500 Internal Server Error** - Server error, check logs

---

## Rate Limiting

No rate limiting is currently implemented. In production, consider implementing rate limiting based on API key.

---

## Idempotency

The payment system is idempotent:
- Using the same `intentId` as `merchantReference` ensures duplicate authorizations are detected
- Recovery endpoint can be called multiple times safely
- Gateway queries prevent double-charging

---

## Webhooks

Webhooks are not currently implemented. Consider adding webhook support for:
- Payment state changes
- Exception creation
- Check closure events
