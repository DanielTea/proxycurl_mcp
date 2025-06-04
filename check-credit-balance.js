#!/usr/bin/env node

/**
 * Check Proxycurl credit balance
 */

import axios from 'axios';

const apiKey = process.argv[2] || process.env.PROXYCURL_API_KEY;

if (!apiKey) {
  console.error('❌ No API key provided. Usage: node check-credit-balance.js [API_KEY]');
  process.exit(1);
}

console.log(`🔑 Checking credit balance for API key: ${apiKey.substring(0, 4)}...`);

async function checkCredits() {
  try {
    const response = await axios.get('https://nubela.co/proxycurl/api/credit-balance', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    console.log('✅ Credit balance retrieved successfully!');
    console.log(`💰 Current balance: ${response.data.credit_balance} credits`);
    
    // Provide context about credit costs
    console.log('\n📊 Credit costs per operation:');
    console.log('- Profile lookup: 1 credit');
    console.log('- Search person: 3 credits per result');
    console.log('- Search company: 3 credits per result');
    console.log('- Employee search: 3+ credits per employee');
    
    if (response.data.credit_balance < 3) {
      console.log('\n⚠️  WARNING: You have fewer than 3 credits remaining.');
      console.log('   Search operations require at least 3 credits per result.');
      console.log('   Add credits at: https://nubela.co/proxycurl/');
    } else if (response.data.credit_balance < 10) {
      console.log('\n⚠️  WARNING: You have limited credits remaining.');
      console.log('   Consider adding more credits for continued search operations.');
    } else {
      console.log('\n✅ You have sufficient credits for search operations.');
    }
    
  } catch (error) {
    console.error('❌ Failed to check credit balance:');
    console.error('Status:', error.response?.status || 'No response');
    console.error('Error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.error('\n🚨 Invalid API key');
    } else if (error.response?.status === 403) {
      console.error('\n🚨 Access forbidden - check your API key permissions');
    }
    
    process.exit(1);
  }
}

checkCredits(); 