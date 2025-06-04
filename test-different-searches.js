#!/usr/bin/env node

/**
 * Test different search parameters to isolate the issue
 */

import axios from 'axios';

const API_KEY = process.argv[2] || process.env.PROXYCURL_API_KEY;

if (!API_KEY) {
  console.error('❌ No API key provided. Usage: node test-different-searches.js [API_KEY]');
  process.exit(1);
}

const PROXYCURL_API_BASE = "https://nubela.co/proxycurl/api";

console.log(`🔍 Testing different search queries with API key: ${API_KEY.substring(0, 4)}...`);

async function testSearch(name, params) {
  console.log(`\n🎯 Testing: ${name}`);
  console.log(`   Params: ${JSON.stringify(params)}`);
  
  try {
    const response = await axios.get(`${PROXYCURL_API_BASE}/v2/search/person`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      },
      params: params
    });
    
    console.log(`   ✅ SUCCESS: ${response.status}`);
    console.log(`   📊 Results: ${response.data?.results?.length || 0}`);
    console.log(`   💰 Cost: ${response.headers['x-proxycurl-credit-cost'] || 'unknown'} credits`);
    
    if (response.data?.results?.length > 0) {
      console.log(`   👤 First result: ${response.data.results[0].full_name || 'Unknown'}`);
    }
    
    return { success: true, results: response.data?.results?.length || 0 };
    
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.response?.status || 'No response'}`);
    console.log(`   💥 Error: ${JSON.stringify(error.response?.data || error.message)}`);
    console.log(`   💰 Cost: ${error.response?.headers?.['x-proxycurl-credit-cost'] || 'unknown'} credits`);
    
    return { success: false, error: error.response?.data || error.message };
  }
}

async function runDifferentSearches() {
  const searches = [
    {
      name: "Search 1: Bill Gates (known to work)",
      params: { first_name: 'Bill', last_name: 'Gates', page_size: 1 }
    },
    {
      name: "Search 2: Daniel Tremer (first_name + last_name)",
      params: { first_name: 'Daniel', last_name: 'Tremer', page_size: 1 }
    },
    {
      name: "Search 3: Daniel Tremer (headline)",
      params: { headline: 'Daniel Tremer', page_size: 1 }
    },
    {
      name: "Search 4: Just Daniel (first_name only)",
      params: { first_name: 'Daniel', page_size: 1 }
    },
    {
      name: "Search 5: Just Tremer (last_name only)",
      params: { last_name: 'Tremer', page_size: 1 }
    },
    {
      name: "Search 6: Generic search (John Smith)",
      params: { first_name: 'John', last_name: 'Smith', page_size: 1 }
    },
    {
      name: "Search 7: Tech person (headline)",
      params: { headline: 'Software Engineer', page_size: 1 }
    }
  ];
  
  console.log(`\n🚀 Running ${searches.length} different search tests...\n`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const search of searches) {
    const result = await testSearch(search.name, search.params);
    
    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n📈 Summary:`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  
  if (failCount > 0 && successCount > 0) {
    console.log(`\n💡 Analysis: Some searches work while others fail - this suggests:`);
    console.log(`   - The issue might be query-specific (certain names/terms)`);
    console.log(`   - Credit calculation might vary by search complexity`);
    console.log(`   - Some search parameters might require higher account tiers`);
  } else if (failCount === 0) {
    console.log(`\n🎉 All searches worked! The issue might have been temporary.`);
  } else {
    console.log(`\n⚠️  All searches failed - this suggests an account-level issue.`);
  }
}

runDifferentSearches(); 