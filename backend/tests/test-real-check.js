const axios = require('axios');

async function testRealSimphonyCheck() {
  console.log('========================================');
  console.log('Testing Real Simphony Check');
  console.log('========================================\n');

  const payload = {
    checkRef: "2e041fb968d54e74adbab1eb9801aa5400000646",  // Your real check
    rvcRef: 301,                  // ← RVC 301 (CRITICAL!)
    amount: 1.00,                 // Small test amount
    cardToken: "test_token_4111111111111111",
    merchantReference: `real-check-test-${Date.now()}`,
    tenderMediaRef: "3801",       // eThor Cash tender media
    employeeRef: 51               // Your employee ID
  };

  console.log('Request payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log();

  try {
    const response = await axios.post('http://localhost:3000/api/proxy/payment', payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'dev_api_key_change_in_prod'
      }
    });

    console.log('✅ SUCCESS!');
    console.log(JSON.stringify(response.data, null, 2));
    console.log();
    console.log('Payment Intent ID:', response.data.intentId);
    console.log('Auth ID:', response.data.authId);
    console.log('Tender Ref:', response.data.tenderRef);

    console.log('\n🎉 PAYMENT POSTED TO SIMPHONY!');
    console.log('Check the check in Simphony POS - you should see the $1.00 tender.');

  } catch (error) {
    console.log('❌ FAILED');
    console.log('Status:', error.response?.status);
    console.log('Error:', JSON.stringify(error.response?.data || error.message, null, 2));
    
    if (error.response?.status === 500) {
      console.log('\n📋 Server logs:');
      console.log('Check the terminal where npm start is running for detailed error info');
    }

    if (error.response?.status === 503) {
      console.log('\n⚠️  Simphony says: "User is not available"');
      console.log('This means employee 51 might not have access to:');
      console.log('  - Org: JJE');
      console.log('  - Location: stjgd');
      console.log('  - Revenue Center: 301');
    }
  }

  console.log('\n========================================');
}

testRealSimphonyCheck();