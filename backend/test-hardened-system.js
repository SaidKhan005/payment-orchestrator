/**
 * Test script for hardened payment orchestrator
 *
 * This script demonstrates and validates:
 * 1. Extended state machine with new states
 * 2. DB-backed locks preventing concurrent modifications
 * 3. Mock gateway failures and recovery
 * 4. Idempotency working correctly
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://orchestrator:dev_password@localhost:5432/payment_orchestrator'
});

const LockManager = require('./src/payment/lock-manager');
const PaymentIntentManager = require('./src/payment/intent-manager');

async function testStateMachine() {
  console.log('\n=== TEST 1: State Machine Transitions ===\n');

  const intentManager = new PaymentIntentManager(pool);

  // Test valid transitions
  const validTransitions = [
    ['INIT', 'CHECK_SPLITTING'],
    ['CHECK_SPLITTING', 'CHECK_SPLIT'],
    ['CHECK_SPLIT', 'AUTHORIZING'],
    ['AUTHORIZING', 'AUTHORIZED'],
    ['AUTHORIZING', 'NEEDS_RECONCILIATION'],
    ['AUTHORIZED', 'TENDERING'],
    ['TENDERING', 'TENDERED'],
    ['TENDERED', 'CLOSING'],
    ['CLOSING', 'CLOSED'],
    ['FAILED_RETRYABLE', 'INIT']
  ];

  console.log('Testing valid transitions:');
  for (const [from, to] of validTransitions) {
    const isValid = intentManager.isValidTransition(from, to);
    console.log(`  ${from} -> ${to}: ${isValid ? 'PASS' : 'FAIL'}`);
  }

  // Test invalid transitions
  const invalidTransitions = [
    ['CLOSED', 'INIT'],
    ['FAILED_FINAL', 'INIT'],
    ['INIT', 'AUTHORIZED'],
    ['TENDERED', 'INIT']
  ];

  console.log('\nTesting invalid transitions (should all be false):');
  for (const [from, to] of invalidTransitions) {
    const isValid = intentManager.isValidTransition(from, to);
    console.log(`  ${from} -> ${to}: ${!isValid ? 'PASS' : 'FAIL'}`);
  }

  // Test retryable states
  console.log('\nTesting retryable states:');
  console.log(`  FAILED_RETRYABLE is retryable: ${intentManager.isRetryable('FAILED_RETRYABLE') ? 'PASS' : 'FAIL'}`);
  console.log(`  NEEDS_RECONCILIATION is retryable: ${intentManager.isRetryable('NEEDS_RECONCILIATION') ? 'PASS' : 'FAIL'}`);
  console.log(`  CLOSED is not retryable: ${!intentManager.isRetryable('CLOSED') ? 'PASS' : 'FAIL'}`);

  console.log('\nState machine tests completed.');
}

async function testDBLocks() {
  console.log('\n=== TEST 2: DB-Backed Locks ===\n');

  const lockManager = new LockManager(pool);
  const testCheckRef = `TEST_CHECK_${Date.now()}`;
  const testIntentId1 = `test-intent-1-${Date.now()}`;
  const testIntentId2 = `test-intent-2-${Date.now()}`;

  try {
    // Test 1: Acquire lock
    console.log('Test 2.1: Acquiring lock...');
    const acquired = await lockManager.acquireLock(testCheckRef, testIntentId1, 30);
    console.log(`  Lock acquired: ${acquired ? 'PASS' : 'FAIL'}`);

    // Test 2: Check if locked
    console.log('\nTest 2.2: Checking lock status...');
    const lockInfo = await lockManager.isLocked(testCheckRef);
    console.log(`  Is locked: ${lockInfo ? 'PASS' : 'FAIL'}`);
    console.log(`  Locked by correct intent: ${lockInfo?.locked_by === testIntentId1 ? 'PASS' : 'FAIL'}`);

    // Test 3: Try to acquire same lock with different intent (should fail)
    console.log('\nTest 2.3: Attempting concurrent lock (should fail)...');
    try {
      await lockManager.acquireLock(testCheckRef, testIntentId2, 30);
      console.log('  Concurrent lock prevention: FAIL (should have thrown)');
    } catch (error) {
      console.log(`  Concurrent lock prevention: PASS`);
      console.log(`  Error message: ${error.message.substring(0, 60)}...`);
    }

    // Test 4: Extend lock
    console.log('\nTest 2.4: Extending lock...');
    const extended = await lockManager.extendLock(testCheckRef, testIntentId1, 60);
    console.log(`  Lock extended: ${extended ? 'PASS' : 'FAIL'}`);

    // Test 5: Release lock
    console.log('\nTest 2.5: Releasing lock...');
    const released = await lockManager.releaseLock(testCheckRef, testIntentId1);
    console.log(`  Lock released: ${released ? 'PASS' : 'FAIL'}`);

    // Test 6: Verify lock is gone
    console.log('\nTest 2.6: Verifying lock is released...');
    const stillLocked = await lockManager.isLocked(testCheckRef);
    console.log(`  Lock is gone: ${!stillLocked ? 'PASS' : 'FAIL'}`);

    // Test 7: Re-acquire lock after release
    console.log('\nTest 2.7: Re-acquiring lock after release...');
    const reacquired = await lockManager.acquireLock(testCheckRef, testIntentId2, 30);
    console.log(`  Lock re-acquired by different intent: ${reacquired ? 'PASS' : 'FAIL'}`);

    // Cleanup
    await lockManager.releaseLock(testCheckRef, testIntentId2);
    console.log('\nDB lock tests completed.');

  } catch (error) {
    console.error('Lock test error:', error.message);
    // Cleanup on error
    await lockManager.forceReleaseLock(testCheckRef).catch(() => {});
  }
}

async function testMockGatewayFailures() {
  console.log('\n=== TEST 3: Mock Gateway Failure Scenarios ===\n');

  const { MockGatewayClient, MockTimeoutError, MockDeclineError } = require('./src/payment/mock-gateway');

  // High failure rates for testing
  const gateway = new MockGatewayClient({
    mockLatencyMs: 50,
    mockTimeoutRate: 0.3,  // 30% timeout rate
    mockFailureRate: 0.2   // 20% decline rate
  });

  const results = {
    successes: 0,
    timeouts: 0,
    declines: 0,
    splitBrains: 0,
    idempotentRetries: 0
  };

  console.log('Running 20 authorization attempts...\n');

  for (let i = 0; i < 20; i++) {
    const merchantRef = `TEST_${Date.now()}_${i}`;

    try {
      const result = await gateway.authorize({
        amount: 25.00 + i,
        merchantReference: merchantRef,
        cardDetails: {
          cardNumber: '4111111111111111',
          expiryMonth: '12',
          expiryYear: '2025',
          cvv: '123'
        }
      });

      if (result.isRetry) {
        results.idempotentRetries++;
        console.log(`  [${i + 1}] Idempotent retry (already approved)`);
      } else {
        results.successes++;
        console.log(`  [${i + 1}] Success: ${result.authId}`);
      }

      // Test idempotency: try same merchantRef again
      const retryResult = await gateway.authorize({
        amount: 25.00 + i,
        merchantReference: merchantRef,
        cardDetails: {
          cardNumber: '4111111111111111',
          expiryMonth: '12',
          expiryYear: '2025',
          cvv: '123'
        }
      });

      if (retryResult.isRetry) {
        results.idempotentRetries++;
      }

    } catch (error) {
      if (error instanceof MockTimeoutError) {
        // Check if this is a split-brain (approved but timeout)
        const existingTxn = await gateway.queryTransaction(merchantRef);
        if (existingTxn && existingTxn.status === 'APPROVED') {
          results.splitBrains++;
          console.log(`  [${i + 1}] SPLIT-BRAIN: Timeout but approved! Auth: ${existingTxn.authId}`);
        } else {
          results.timeouts++;
          console.log(`  [${i + 1}] Timeout (no approval)`);
        }
      } else if (error instanceof MockDeclineError) {
        results.declines++;
        console.log(`  [${i + 1}] Declined: ${error.declineReason}`);
      } else {
        console.log(`  [${i + 1}] Unknown error: ${error.message}`);
      }
    }
  }

  console.log('\n--- Results Summary ---');
  console.log(`  Successes: ${results.successes}`);
  console.log(`  Timeouts (no approval): ${results.timeouts}`);
  console.log(`  Split-brain scenarios: ${results.splitBrains}`);
  console.log(`  Declines: ${results.declines}`);
  console.log(`  Idempotent retries: ${results.idempotentRetries}`);

  console.log('\nMock gateway tests completed.');
}

async function testIntentCreationWithNewStates() {
  console.log('\n=== TEST 4: Intent Creation with Extended States ===\n');

  const intentManager = new PaymentIntentManager(pool);

  try {
    // Create a test intent
    const intentId = await intentManager.createIntent(
      'TEST_MASTER_CHECK',
      1,
      ['item1', 'item2'],
      50.00,
      'EMP001'
    );

    console.log(`Created intent: ${intentId}`);

    // Get and verify initial state
    let intent = await intentManager.getIntent(intentId);
    console.log(`Initial state: ${intent.state} (expected: INIT) - ${intent.state === 'INIT' ? 'PASS' : 'FAIL'}`);

    // Test state transition to CHECK_SPLITTING
    await intentManager.updateState(intentId, { state: 'CHECK_SPLITTING' });
    intent = await intentManager.getIntent(intentId);
    console.log(`After CHECK_SPLITTING: ${intent.state} - ${intent.state === 'CHECK_SPLITTING' ? 'PASS' : 'FAIL'}`);

    // Test retry count increment
    await intentManager.incrementRetryCount(intentId, 'Test error message');
    intent = await intentManager.getIntent(intentId);
    console.log(`Retry count after increment: ${intent.retry_count} - ${intent.retry_count === 1 ? 'PASS' : 'FAIL'}`);
    console.log(`Last error recorded: ${intent.last_error ? 'PASS' : 'FAIL'}`);

    // Transition to FAILED_RETRYABLE
    await intentManager.updateState(intentId, { state: 'FAILED_RETRYABLE' });
    intent = await intentManager.getIntent(intentId);
    console.log(`After FAILED_RETRYABLE: ${intent.state} - ${intent.state === 'FAILED_RETRYABLE' ? 'PASS' : 'FAIL'}`);

    // Check next retry state
    const nextState = intentManager.getNextRetryState(intent.state);
    console.log(`Next retry state: ${nextState} (expected: INIT) - ${nextState === 'INIT' ? 'PASS' : 'FAIL'}`);

    // Cleanup - transition to FAILED_FINAL
    await intentManager.updateState(intentId, { state: 'FAILED_FINAL' });

    console.log('\nIntent creation tests completed.');

  } catch (error) {
    console.error('Intent test error:', error.message);
  }
}

async function runAllTests() {
  console.log('=============================================');
  console.log('  HARDENED PAYMENT ORCHESTRATOR TEST SUITE');
  console.log('=============================================');

  try {
    // Verify database connection
    console.log('\nVerifying database connection...');
    await pool.query('SELECT 1');
    console.log('Database connection: OK\n');

    await testStateMachine();
    await testDBLocks();
    await testMockGatewayFailures();
    await testIntentCreationWithNewStates();

    console.log('\n=============================================');
    console.log('  ALL TESTS COMPLETED');
    console.log('=============================================\n');

  } catch (error) {
    console.error('\nTest suite failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

runAllTests();
