#!/usr/bin/env node

/**
 * Test script to verify retry logic for rate limiting and temporary errors
 */

import axios from 'axios';

const apiKey = process.argv[2] || process.env.PROXYCURL_API_KEY;

if (!apiKey) {
  console.error('❌ No API key provided. Usage: node test-retry-logic.js [API_KEY]');
  process.exit(1);
}

console.log(`🧪 Testing retry logic with API key: ${apiKey.substring(0, 4)}...`);

// Simulate the retry logic from the server
class TestRetryLogic {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.axiosInstance = axios.create({
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });
  }

  // Copy of the retry logic from server.js
  async makeRequestWithRetry(url, params, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const response = await this.axiosInstance.get(url, { params });
        console.log(`✅ Request succeeded on attempt ${attempt}`);
        return response;
      } catch (error) {
        const isRetryableError = this.isRetryableError(error);
        const isLastAttempt = attempt > maxRetries;
        
        if (isRetryableError && !isLastAttempt) {
          const delay = this.calculateRetryDelay(attempt, error.response?.status);
          console.log(`⚠️  Attempt ${attempt}/${maxRetries + 1} failed with ${error.response?.status || 'network'} error, retrying in ${delay}ms...`);
          console.log(`   Error: ${error.response?.data?.description || error.message}`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Re-throw the error if not retryable or max retries exceeded
        if (isLastAttempt && isRetryableError) {
          console.log(`❌ Max retries (${maxRetries}) exceeded for ${error.response?.status || 'network'} error`);
        }
        throw error;
      }
    }
  }

  isRetryableError(error) {
    if (!error.response) {
      return true; // Network errors
    }
    
    const status = error.response.status;
    
    // Retry on these HTTP status codes
    if ([429, 500, 502, 503, 504].includes(status)) {
      return true;
    }
    
    // Retry on 403 "not enough credits" which might be temporary
    if (status === 403 && error.response.data?.description?.includes('Not enough credits')) {
      return true;
    }
    
    return false;
  }

  calculateRetryDelay(attempt, statusCode) {
    let baseDelay = Math.pow(2, attempt - 1) * 1000;
    
    if (statusCode === 429) {
      baseDelay = Math.pow(2, attempt - 1) * 5000;
    }
    
    const jitter = baseDelay * 0.25 * (Math.random() - 0.5);
    return Math.min(baseDelay + jitter, 30000);
  }
}

async function testRetryScenarios() {
  const client = new TestRetryLogic(apiKey);
  
  console.log('\n🎯 Test 1: Rapid successive requests to potentially trigger rate limiting');
  const promises = [];
  
  // Make 5 rapid requests to potentially trigger rate limiting
  for (let i = 0; i < 5; i++) {
    promises.push(
      client.makeRequestWithRetry('https://nubela.co/proxycurl/api/v2/search/person', {
        first_name: 'John',
        current_company_name: 'Google',
        page_size: 1
      }).then(response => {
        console.log(`📊 Request ${i + 1} completed successfully, found ${response.data.results?.length || 0} results`);
        return { success: true, requestId: i + 1 };
      }).catch(error => {
        console.log(`❌ Request ${i + 1} failed: ${error.response?.status} - ${error.response?.data?.description || error.message}`);
        return { success: false, requestId: i + 1, error: error.message };
      })
    );
  }
  
  try {
    const results = await Promise.all(promises);
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n📈 Results: ${successful} successful, ${failed} failed`);
    
    if (failed === 0) {
      console.log('✅ All requests succeeded - retry logic handled any temporary issues!');
    } else {
      console.log('⚠️  Some requests failed, but this might be expected with rapid requests');
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
  
  console.log('\n🎯 Test 2: Testing delay calculation for different error types');
  const testClient = new TestRetryLogic(apiKey);
  
  console.log('Rate limit (429) delays:');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const delay = testClient.calculateRetryDelay(attempt, 429);
    console.log(`  Attempt ${attempt}: ${Math.round(delay)}ms`);
  }
  
  console.log('Server error (500) delays:');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const delay = testClient.calculateRetryDelay(attempt, 500);
    console.log(`  Attempt ${attempt}: ${Math.round(delay)}ms`);
  }
}

testRetryScenarios(); 