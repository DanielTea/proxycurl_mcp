#!/usr/bin/env node

/**
 * Script to test the exact same API calls that were failing in the MCP logs
 */

import axios from 'axios';

const apiKey = process.argv[2] || process.env.PROXYCURL_API_KEY;

if (!apiKey) {
  console.error('❌ No API key provided. Usage: node debug-mcp-call.js [API_KEY]');
  process.exit(1);
}

console.log(`🔑 Testing API key: ${apiKey.substring(0, 4)}... (${apiKey.length} characters)`);

const PROXYCURL_API_BASE = "https://nubela.co/proxycurl/api";

async function testFailingCalls() {
  try {
    // Test the exact first call that failed: {"first_name": "Daniel", "last_name": "Tremer"}
    console.log('\n🔍 Testing first failing call: first_name=Daniel, last_name=Tremer');
    
    const firstResponse = await axios.get(`${PROXYCURL_API_BASE}/v2/search/person`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      params: {
        first_name: 'Daniel',
        last_name: 'Tremer'
      }
    });
    
    console.log('✅ First call succeeded! Found:', firstResponse.data.results?.length || 0, 'results');
    
    // Test the exact second call that failed: {"headline": "Daniel Tremer"}
    console.log('\n🔍 Testing second failing call: headline=Daniel Tremer');
    
    const secondResponse = await axios.get(`${PROXYCURL_API_BASE}/v2/search/person`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      params: {
        headline: 'Daniel Tremer'
      }
    });
    
    console.log('✅ Second call succeeded! Found:', secondResponse.data.results?.length || 0, 'results');
    
  } catch (error) {
    console.error('❌ API test failed:');
    console.error('Status:', error.response?.status || 'No response');
    console.error('Error:', error.response?.data || error.message);
    console.error('Headers sent:', error.config?.headers);
    console.error('URL:', error.config?.url);
    console.error('Params:', error.config?.params);
    
    if (error.response?.status === 403) {
      console.error('\n🚨 403 Forbidden Error - Same as MCP logs');
    }
    
    process.exit(1);
  }
}

testFailingCalls(); 