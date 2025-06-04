#!/usr/bin/env node

/**
 * Simple script to test Proxycurl API key
 * Usage: node test-api-key.js [API_KEY]
 */

import axios from 'axios';

const apiKey = process.argv[2] || process.env.PROXYCURL_API_KEY;

if (!apiKey) {
  console.error('❌ No API key provided. Usage: node test-api-key.js [API_KEY] or set PROXYCURL_API_KEY environment variable');
  process.exit(1);
}

console.log(`🔑 Testing API key: ${apiKey.substring(0, 4)}... (${apiKey.length} characters)`);

const PROXYCURL_API_BASE = "https://nubela.co/proxycurl/api";

async function testApiKey() {
  try {
    console.log('📡 Making test request to validate API key...');
    
    const response = await axios.get(`${PROXYCURL_API_BASE}/v2/linkedin`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      params: {
        url: 'https://www.linkedin.com/in/williamhgates/'
      }
    });
    
    console.log('✅ API key is valid! Status:', response.status);
    console.log('📊 Response contains profile data for:', response.data.full_name || 'Unknown');
    
    // Test search people endpoint specifically
    console.log('\n🔍 Testing search_people endpoint...');
    
    const searchResponse = await axios.get(`${PROXYCURL_API_BASE}/v2/search/person`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      params: {
        first_name: 'Bill',
        current_company_name: 'Microsoft',
        page_size: 1
      }
    });
    
    console.log('✅ Search people endpoint works! Found:', searchResponse.data.results?.length || 0, 'results');
    
  } catch (error) {
    console.error('❌ API test failed:');
    console.error('Status:', error.response?.status || 'No response');
    console.error('Error:', error.response?.data || error.message);
    
    if (error.response?.status === 403) {
      console.error('\n🚨 403 Forbidden Error - Common causes:');
      console.error('1. Invalid or expired API key');
      console.error('2. API key lacks permissions for this endpoint');
      console.error('3. Account has insufficient credits');
      console.error('4. Account is suspended or has payment issues');
      console.error('\n💡 Solutions:');
      console.error('- Verify your API key in your Proxycurl dashboard');
      console.error('- Check your account credits and billing status');
      console.error('- Ensure your plan includes access to search endpoints');
    } else if (error.response?.status === 401) {
      console.error('\n🚨 401 Unauthorized - API key is invalid');
    } else if (error.response?.status === 429) {
      console.error('\n🚨 429 Rate Limited - Too many requests or insufficient credits');
    }
    
    process.exit(1);
  }
}

testApiKey(); 