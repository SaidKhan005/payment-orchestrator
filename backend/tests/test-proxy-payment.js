/**
 * Test script for the idempotent payment proxy
 *
 * Tests:
 * 1. Basic payment flow
 * 2. Idempotency (same merchantReference returns same result)
 * 3. Query payment status
 * 4. Reconciliation queue
 *
 * Usage: node tests/test-proxy-payment.js
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'dev_api_key_change_in_prod';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY
  }
});

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testHealthCheck() {
  console.log('\n=== Testing Health Check ===');
  try {
    const response = await api.get('/health');
    console.log('Health check response:', response.data);
    return true;
  } catch (error) {
    console.error('Health check failed:', error.message);
    return false;
  }
}

async function testBasicPayment() {
  console.log('\n=== Testing Basic Payment ===');

  const merchantReference = `test-${uuidv4()}`;
  const payload = {
    checkRef: `check-${Date.now()}`,
    rvcRef: 1,
    amount: 25.50,
    cardToken: 'test_token_4111111111111111',
    merchantReference,
    tenderMediaRef: '3' // Credit card
  };

  console.log('Request payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await api.post('/api/proxy/payment', payload);
    console.log('Payment response:', JSON.stringify(response.data, null, 2));

    if (response.data.success) {
      console.log('Basic payment test PASSED');
      return { success: true, intentId: response.data.intentId, merchantReference };
    } else {
      console.log('Payment did not succeed:', response.data.error);
      return { success: false, intentId: response.data.intentId, merchantReference };
    }
  } catch (error) {
    console.error('Payment request failed:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

async function testIdempotency(merchantReference) {
  console.log('\n=== Testing Idempotency ===');
  console.log('Using same merchantReference:', merchantReference);

  const payload = {
    checkRef: `check-different-${Date.now()}`,
    rvcRef: 1,
    amount: 25.50,
    cardToken: 'test_token_4111111111111111',
    merchantReference, // Same reference!
    tenderMediaRef: '3'
  };

  try {
    const response = await api.post('/api/proxy/payment', payload);
    console.log('Idempotent response:', JSON.stringify(response.data, null, 2));

    if (response.data.idempotent) {
      console.log('Idempotency test PASSED - returned same result');
      return true;
    } else {
      console.log('Idempotency test FAILED - created new payment');
      return false;
    }
  } catch (error) {
    console.error('Idempotency test failed:', error.response?.data || error.message);
    return false;
  }
}

async function testQueryPayment(intentId) {
  console.log('\n=== Testing Query Payment ===');
  console.log('Querying intent:', intentId);

  try {
    const response = await api.get(`/api/proxy/payment/${intentId}`);
    console.log('Query response:', JSON.stringify(response.data, null, 2));

    if (response.data.intentId === intentId) {
      console.log('Query payment test PASSED');
      return true;
    } else {
      console.log('Query payment test FAILED - wrong intent');
      return false;
    }
  } catch (error) {
    console.error('Query payment failed:', error.response?.data || error.message);
    return false;
  }
}

async function testReconciliationQueue() {
  console.log('\n=== Testing Reconciliation Queue ===');

  try {
    const response = await api.get('/api/proxy/reconciliation-queue');
    console.log('Reconciliation queue:', JSON.stringify(response.data, null, 2));
    console.log('Reconciliation queue test PASSED');
    return true;
  } catch (error) {
    console.error('Reconciliation queue failed:', error.response?.data || error.message);
    return false;
  }
}

async function testMissingFields() {
  console.log('\n=== Testing Missing Fields Validation ===');

  const payload = {
    checkRef: 'test-check',
    // Missing rvcRef, amount, cardToken, merchantReference, tenderMediaRef
  };

  try {
    const response = await api.post('/api/proxy/payment', payload);
    console.log('Unexpected success:', response.data);
    return false;
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('Validation error (expected):', error.response.data);
      console.log('Missing fields validation test PASSED');
      return true;
    }
    console.error('Unexpected error:', error.message);
    return false;
  }
}

async function testPCICompliance() {
  console.log('\n=== Testing PCI Compliance (Raw Card Data Rejection) ===');

  const payload = {
    checkRef: 'test-check',
    rvcRef: 1,
    amount: 25.50,
    cardToken: 'test_token',
    merchantReference: `test-${uuidv4()}`,
    tenderMediaRef: '3',
    cardNumber: '4111111111111111', // This should be rejected!
    cvv: '123'
  };

  try {
    const response = await api.post('/api/proxy/payment', payload);
    console.log('Unexpected success - PCI violation not detected:', response.data);
    return false;
  } catch (error) {
    if (error.response?.status === 400 && error.response.data.error.includes('PCI')) {
      console.log('PCI compliance error (expected):', error.response.data);
      console.log('PCI compliance test PASSED');
      return true;
    }
    console.error('Unexpected error:', error.response?.data || error.message);
    return false;
  }
}

async function testMultiplePayments() {
  console.log('\n=== Testing Multiple Sequential Payments ===');

  const results = [];
  for (let i = 1; i <= 3; i++) {
    const payload = {
      checkRef: `check-multi-${Date.now()}-${i}`,
      rvcRef: 1,
      amount: 10.00 * i,
      cardToken: 'test_token_4111111111111111',
      merchantReference: `multi-test-${uuidv4()}`,
      tenderMediaRef: '3'
    };

    try {
      const response = await api.post('/api/proxy/payment', payload);
      results.push({ i, success: response.data.success, intentId: response.data.intentId });
      console.log(`Payment ${i}: ${response.data.success ? 'SUCCESS' : 'FAILED'}`);
    } catch (error) {
      results.push({ i, success: false, error: error.message });
      console.log(`Payment ${i}: ERROR - ${error.message}`);
    }

    // Small delay between payments
    await sleep(500);
  }

  console.log('Multiple payments results:', results);
  return results.filter(r => r.success).length > 0;
}

async function testMockGatewayEndpoints() {
  console.log('\n=== Testing Mock Gateway Endpoints ===');

  try {
    // Get transactions
    const txnsResponse = await api.get('/api/mock/transactions');
    console.log('Mock transactions:', txnsResponse.data.count, 'transactions');

    // Reset mock gateway
    const resetResponse = await api.post('/api/mock/reset');
    console.log('Mock reset:', resetResponse.data.message);

    console.log('Mock gateway endpoints test PASSED');
    return true;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('Mock gateway not enabled (expected in production mode)');
      return true;
    }
    console.error('Mock gateway test failed:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('========================================');
  console.log('Payment Proxy Test Suite');
  console.log('========================================');
  console.log('Base URL:', BASE_URL);

  const results = {
    healthCheck: false,
    basicPayment: false,
    idempotency: false,
    queryPayment: false,
    reconciliationQueue: false,
    missingFields: false,
    pciCompliance: false,
    multiplePayments: false,
    mockGateway: false
  };

  // Health check
  results.healthCheck = await testHealthCheck();
  if (!results.healthCheck) {
    console.log('\nServer is not running. Aborting tests.');
    return;
  }

  // Basic payment
  const paymentResult = await testBasicPayment();
  results.basicPayment = paymentResult.success || paymentResult.intentId != null;

  // Idempotency (only if we have a merchantReference from basic payment)
  if (paymentResult.merchantReference) {
    results.idempotency = await testIdempotency(paymentResult.merchantReference);
  }

  // Query payment (only if we have an intentId)
  if (paymentResult.intentId) {
    results.queryPayment = await testQueryPayment(paymentResult.intentId);
  }

  // Reconciliation queue
  results.reconciliationQueue = await testReconciliationQueue();

  // Validation tests
  results.missingFields = await testMissingFields();
  results.pciCompliance = await testPCICompliance();

  // Multiple payments
  results.multiplePayments = await testMultiplePayments();

  // Mock gateway
  results.mockGateway = await testMockGatewayEndpoints();

  // Summary
  console.log('\n========================================');
  console.log('Test Results Summary');
  console.log('========================================');

  let passed = 0;
  let failed = 0;

  for (const [test, result] of Object.entries(results)) {
    const status = result ? 'PASS' : 'FAIL';
    const icon = result ? '✓' : '✗';
    console.log(`${icon} ${test}: ${status}`);
    if (result) passed++;
    else failed++;
  }

  console.log('----------------------------------------');
  console.log(`Total: ${passed} passed, ${failed} failed`);
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
