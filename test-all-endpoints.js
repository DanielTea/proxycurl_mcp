#!/usr/bin/env node

/**
 * Comprehensive test of different Proxycurl endpoints
 */

import axios from 'axios';

const apiKey = process.argv[2] || process.env.PROXYCURL_API_KEY;

if (!apiKey) {
  console.error('❌ No API key provided. Usage: node test-all-endpoints.js [API_KEY]');
  process.exit(1);
}

const PROXYCURL_API_BASE = "https://nubela.co/proxycurl/api";

console.log(`🔑 Testing different Proxycurl endpoints with API key: ${apiKey.substring(0, 4)}...`);

async function testEndpoint(name, url, params, expectedCost) {
  try {
    console.log(`\n🧪 Testing ${name}...`);
    console.log(`   URL: ${url}`);
    console.log(`   Params: ${JSON.stringify(params)}`);
    console.log(`   Expected cost: ${expectedCost} credits`);
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      params: params
    });
    
    const actualCost = response.headers['x-proxycurl-credit-cost'] || 'unknown';
    console.log(`   ✅ SUCCESS: Status ${response.status}, Cost: ${actualCost} credits`);
    
    if (response.data.results) {
      console.log(`   📊 Found ${response.data.results.length} results`);
    } else if (response.data.full_name) {
      console.log(`   👤 Profile: ${response.data.full_name}`);
    } else if (response.data.name) {
      console.log(`   🏢 Company: ${response.data.name}`);
    }
    
    return { success: true, cost: actualCost };
    
  } catch (error) {
    console.log(`   ❌ FAILED: Status ${error.response?.status || 'No response'}`);
    console.log(`   Error: ${JSON.stringify(error.response?.data || error.message)}`);
    
    return { success: false, error: error.response?.data || error.message };
  }
}

async function runAllTests() {
  const tests = [
    {
      name: "Person Profile Lookup",
      url: `${PROXYCURL_API_BASE}/v2/linkedin`,
      params: { url: 'https://www.linkedin.com/in/williamhgates' },
      expectedCost: 1
    },
    {
      name: "Company Profile Lookup", 
      url: `${PROXYCURL_API_BASE}/linkedin/company`,
      params: { url: 'https://www.linkedin.com/company/microsoft' },
      expectedCost: 1
    },
    {
      name: "Person Lookup by Name",
      url: `${PROXYCURL_API_BASE}/linkedin/profile/resolve`,
      params: { first_name: 'Bill', company_domain: 'microsoft.com' },
      expectedCost: 2
    },
    {
      name: "Search People (small query)",
      url: `${PROXYCURL_API_BASE}/v2/search/person`,
      params: { first_name: 'Bill', current_company_name: 'Microsoft', page_size: 1 },
      expectedCost: 3
    },
    {
      name: "Search People (name only)",
      url: `${PROXYCURL_API_BASE}/v2/search/person`,
      params: { first_name: 'Daniel', last_name: 'Tremer', page_size: 1 },
      expectedCost: 3
    },
    {
      name: "Search People (headline)",
      url: `${PROXYCURL_API_BASE}/v2/search/person`,
      params: { headline: 'Daniel Tremer', page_size: 1 },
      expectedCost: 3
    },
    {
      name: "Search Companies",
      url: `${PROXYCURL_API_BASE}/v2/search/company`,
      params: { name: 'Microsoft', page_size: 1 },
      expectedCost: 3
    }
  ];
  
  console.log(`\n🚀 Running ${tests.length} endpoint tests...\n`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const test of tests) {
    const result = await testEndpoint(test.name, test.url, test.params, test.expectedCost);
    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n📈 Test Summary:`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  
  if (failCount > 0) {
    console.log(`\n💡 Pattern Analysis:`);
    console.log(`   - If only search endpoints fail: Likely search-specific credit/permission issue`);
    console.log(`   - If all endpoints fail: API key or general account issue`);
    console.log(`   - If random failures: Rate limiting or temporary API issues`);
  }
}

runAllTests(); 