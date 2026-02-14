const axios = require('axios');

async function testIdempotency() {
  console.log('Testing idempotency with real Simphony...\n');

  const payload = {
    checkRef: "9a557a26fc56468c9ebc3359849380c400000646",
    rvcRef: 301,
    amount: 5.00,
    cardToken: "test_token_4111111111111111",
    merchantReference: `idempotency-test-${Date.now()}`,  // Same reference!
    tenderMediaRef: "3801",
    employeeRef: 51
  };

  try {
    console.log('First request (should post tender)...');
    const response1 = await axios.post('http://localhost:3000/api/proxy/payment', payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'dev_api_key_change_in_prod'
      }
    });

    console.log('✅ First request success:', response1.data.intentId);
    console.log('Auth ID:', response1.data.authId);
    console.log('Tender Ref:', response1.data.tenderRef);

    console.log('\nSecond request (same merchantReference - should return cached)...');
    const response2 = await axios.post('http://localhost:3000/api/proxy/payment', payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'dev_api_key_change_in_prod'
      }
    });

    console.log('✅ Second request success:', response2.data.intentId);
    console.log('Auth ID:', response2.data.authId);
    console.log('Tender Ref:', response2.data.tenderRef);

    if (response1.data.intentId === response2.data.intentId &&
        response1.data.authId === response2.data.authId) {
      console.log('\n🎉 IDEMPOTENCY WORKS! Same payment intent returned!');
      console.log('✅ NO DUPLICATE CHARGE!');
    } else {
      console.log('\n❌ Different responses - idempotency failed');
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testIdempotency().catch(console.error);