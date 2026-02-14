const axios = require('axios');

async function analyzeCheck(checkRef) {
  console.log('\n========================================');
  console.log('COMPREHENSIVE CHECK ANALYSIS');
  console.log('========================================\n');
  console.log('Check Reference:', checkRef);
  console.log('Fetching from Simphony...\n');

  try {
    const response = await axios.get(`http://localhost:3000/api/debug/check/${checkRef}`, {
      headers: {
        'x-api-key': 'dev_api_key_change_in_prod'
      }
    });

    const check = response.data;

    // Header Info
    console.log('--- HEADER ---');
    console.log('Status:', check.header?.status || 'Unknown');
    console.log('Check Number:', check.header?.checkNumber || 'N/A');
    console.log('Table:', check.header?.tableName || 'N/A');
    console.log('Employee:', check.header?.checkEmployeeRef || 'N/A');
    console.log('Guest Count:', check.header?.guestCount || 0);
    console.log('Open Time:', check.header?.openTime || 'N/A');

    // Totals
    const totals = check.totals || {};
    console.log('\n--- FINANCIAL TOTALS ---');
    console.log('Subtotal:               $' + (totals.subtotal || 0).toFixed(2));
    console.log('Subtotal Discount:      $' + (totals.subtotalDiscountTotal || 0).toFixed(2));
    console.log('Service Charges:        $' + (totals.serviceChargeTotal || 0).toFixed(2));
    console.log('Tax:                    $' + (totals.taxTotal || 0).toFixed(2));
    console.log('Payment Total:          $' + (totals.paymentTotal || 0).toFixed(2));
    console.log('=====================================');
    console.log('TOTAL DUE:              $' + (totals.totalDue || 0).toFixed(2));
    console.log('=====================================');

    // Check for issues
    if (totals.totalDue < 0) {
      console.log('\n⚠️  ⚠️  NEGATIVE BALANCE! ⚠️  ⚠️');
      console.log('Overpaid Amount: $' + Math.abs(totals.totalDue).toFixed(2));
      console.log('This indicates an overpayment bug!');
    }

    if (totals.totalDue > 0 && totals.paymentTotal > 0) {
      console.log('\n💡 Partial Payment Detected');
      console.log('Paid: $' + totals.paymentTotal.toFixed(2));
      console.log('Remaining: $' + totals.totalDue.toFixed(2));
    }

    // Menu Items
    if (check.menuItems && check.menuItems.length > 0) {
      console.log('\n--- MENU ITEMS ---');
      const itemsBySeat = {};

      check.menuItems.forEach(item => {
        const seat = item.seat || 'No Seat';
        if (!itemsBySeat[seat]) itemsBySeat[seat] = [];
        itemsBySeat[seat].push(item);
      });

      Object.keys(itemsBySeat).sort().forEach(seat => {
        console.log(`\nSeat ${seat}:`);
        itemsBySeat[seat].forEach(item => {
          console.log(`  - ${item.name}: $${(item.total || 0).toFixed(2)}`);
          if (item.condiments && item.condiments.length > 0) {
            item.condiments.forEach(mod => {
              console.log(`    + ${mod.name}`);
            });
          }
        });
      });
    }

    // Tenders
    if (check.tenders && check.tenders.length > 0) {
      console.log('\n--- TENDERS (PAYMENTS) ---');
      let tenderTotal = 0;

      check.tenders.forEach((tender, i) => {
        const amount = tender.total || 0;
        tenderTotal += amount;

        console.log(`\n${i + 1}. ${tender.name || 'Unknown Tender'}`);
        console.log(`   Amount: $${amount.toFixed(2)}`);
        if (tender.referenceText) {
          console.log(`   Auth Code: ${tender.referenceText}`);
        }
        if (tender.chargedTipTotal) {
          console.log(`   Tip: $${tender.chargedTipTotal.toFixed(2)}`);
        }
      });

      console.log('\n   Total Tendered: $' + tenderTotal.toFixed(2));

      // Verify tender total matches
      if (Math.abs(tenderTotal - totals.paymentTotal) > 0.01) {
        console.log('   ⚠️  Tender total mismatch!');
      }
    } else {
      console.log('\n--- TENDERS (PAYMENTS) ---');
      console.log('No tenders posted');
    }

    // Discounts
    if (check.discounts && check.discounts.length > 0) {
      console.log('\n--- DISCOUNTS ---');
      check.discounts.forEach((discount, i) => {
        console.log(`${i + 1}. ${discount.name}: -$${Math.abs(discount.total || 0).toFixed(2)}`);
      });
    }

    // Service Charges
    if (check.serviceCharges && check.serviceCharges.length > 0) {
      console.log('\n--- SERVICE CHARGES ---');
      check.serviceCharges.forEach((charge, i) => {
        console.log(`${i + 1}. ${charge.name}: $${(charge.total || 0).toFixed(2)}`);
      });
    }

    // Summary
    console.log('\n========================================');
    console.log('SUMMARY');
    console.log('========================================');
    console.log('Items:', check.menuItems?.length || 0);
    console.log('Tenders:', check.tenders?.length || 0);
    console.log('Status:', check.header?.status || 'Unknown');
    console.log('Balance:', totals.totalDue >= 0 ? `$${totals.totalDue.toFixed(2)} due` : `$${Math.abs(totals.totalDue).toFixed(2)} overpaid`);
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ ERROR FETCHING CHECK');
    console.error('Status:', error.response?.status || 'Network Error');
    console.error('Message:', error.response?.data?.error || error.message);
    console.error('\nMake sure:');
    console.error('1. Server is running (npm start)');
    console.error('2. Check reference is valid');
    console.error('3. You have access to this check\n');
  }
}

const checkRef = process.argv[2];

if (!checkRef) {
  console.error('\nUsage: node tests/analyze-check.js <checkRef>');
  console.error('Example: node tests/analyze-check.js 9a557a26fc56468c9ebc3359849380c400000646\n');
  process.exit(1);
}

analyzeCheck(checkRef).catch(console.error);
