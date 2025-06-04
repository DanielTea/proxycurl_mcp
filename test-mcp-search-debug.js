#!/usr/bin/env node

/**
 * Detailed debug test for MCP server retry logic with timestamps
 */

import axios from 'axios';

const API_KEY = process.argv[2] || process.env.PROXYCURL_API_KEY || '5BZB....'; // Use placeholder if not provided

console.log(`🔧 DEBUG: Testing retry logic with API key: ${API_KEY.substring(0, 4)}...`);
console.log(`🕐 Start time: ${new Date().toISOString()}`);

const PROXYCURL_API_BASE = "https://nubela.co/proxycurl/api";

class DetailedRetryClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.axiosInstance = axios.create({
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });
  }

  async makeRequestWithRetry(url, params, maxRetries = 3) {
    console.log(`\n🚀 [${new Date().toISOString()}] Starting request with ${maxRetries} max retries`);
    console.log(`   URL: ${url}`);
    console.log(`   Params: ${JSON.stringify(params)}`);
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const attemptStart = Date.now();
      console.log(`\n🔄 [${new Date().toISOString()}] === ATTEMPT ${attempt} / ${maxRetries + 1} ===`);
      
      try {
        const response = await this.axiosInstance.get(url, { params });
        const duration = Date.now() - attemptStart;
        console.log(`✅ [${new Date().toISOString()}] SUCCESS on attempt ${attempt} (${duration}ms)`);
        console.log(`   Status: ${response.status}`);
        console.log(`   Results: ${response.data?.results?.length || 0}`);
        return response;
        
      } catch (error) {
        const duration = Date.now() - attemptStart;
        const status = error.response?.status || 'No response';
        const errorData = error.response?.data;
        
        console.log(`❌ [${new Date().toISOString()}] FAILED attempt ${attempt} (${duration}ms)`);
        console.log(`   Status: ${status}`);
        console.log(`   Error Data: ${JSON.stringify(errorData)}`);
        console.log(`   Error Message: ${error.message}`);
        
        // Detailed analysis of the error
        if (error.response) {
          console.log(`   Response Headers: ${JSON.stringify(error.response.headers, null, 2)}`);
          
          if (errorData?.description) {
            console.log(`   Proxycurl Description: "${errorData.description}"`);
          }
          if (errorData?.code) {
            console.log(`   Proxycurl Code: ${errorData.code}`);
          }
        }
        
        const isRetryableError = this.isRetryableError(error);
        const isLastAttempt = attempt > maxRetries;
        
        console.log(`   Is Retryable: ${isRetryableError}`);
        console.log(`   Is Last Attempt: ${isLastAttempt}`);
        
        if (isRetryableError && !isLastAttempt) {
          const delay = this.calculateRetryDelay(attempt, error.response?.status);
          console.log(`⏳ [${new Date().toISOString()}] Will retry in ${Math.round(delay)}ms...`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          console.log(`🔄 [${new Date().toISOString()}] Retry delay completed, continuing...`);
          continue;
        }
        
        // Final failure
        if (isLastAttempt && isRetryableError) {
          console.log(`💥 [${new Date().toISOString()}] Max retries (${maxRetries}) exceeded for ${error.response?.status || 'network'} error`);
        } else if (!isRetryableError) {
          console.log(`🚫 [${new Date().toISOString()}] Error is not retryable, failing immediately`);
        }
        
        throw error;
      }
    }
  }

  isRetryableError(error) {
    if (!error.response) {
      console.log(`   🔍 Retry Analysis: Network error - RETRYABLE`);
      return true; // Network errors
    }
    
    const status = error.response.status;
    console.log(`   🔍 Retry Analysis: HTTP ${status}`);
    
    // Retry on these HTTP status codes
    if ([429, 500, 502, 503, 504].includes(status)) {
      console.log(`   🔍 Retry Analysis: Status ${status} - RETRYABLE`);
      return true;
    }
    
    // Retry on 403 "not enough credits" which might be temporary
    if (status === 403 && error.response.data?.description?.includes('Not enough credits')) {
      console.log(`   🔍 Retry Analysis: 403 "Not enough credits" - RETRYABLE (might be temporary)`);
      return true;
    }
    
    console.log(`   🔍 Retry Analysis: Status ${status} - NOT RETRYABLE`);
    return false;
  }

  calculateRetryDelay(attempt, statusCode) {
    let baseDelay = Math.pow(2, attempt - 1) * 1000;
    
    if (statusCode === 429) {
      baseDelay = Math.pow(2, attempt - 1) * 5000;
      console.log(`   ⏱️  Rate limit delay: ${baseDelay}ms base`);
    } else {
      console.log(`   ⏱️  Standard delay: ${baseDelay}ms base`);
    }
    
    const jitter = baseDelay * 0.25 * (Math.random() - 0.5);
    const finalDelay = Math.min(baseDelay + jitter, 30000);
    
    console.log(`   ⏱️  Final delay (with jitter): ${Math.round(finalDelay)}ms`);
    return finalDelay;
  }
}

async function runDetailedTest() {
  const client = new DetailedRetryClient(API_KEY);
  
  const testCases = [
    {
      name: "First MCP Call",
      params: { first_name: "Daniel", last_name: "Tremer" }
    },
    {
      name: "Second MCP Call", 
      params: { headline: "Daniel Tremer" }
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎯 Testing: ${testCase.name}`);
    console.log(`   Params: ${JSON.stringify(testCase.params)}`);
    console.log(`${'='.repeat(60)}`);
    
    try {
      const result = await client.makeRequestWithRetry(
        `${PROXYCURL_API_BASE}/v2/search/person`,
        testCase.params
      );
      
      console.log(`\n✅ [${new Date().toISOString()}] ${testCase.name} SUCCEEDED!`);
      console.log(`   Results found: ${result.data?.results?.length || 0}`);
      
    } catch (error) {
      console.log(`\n❌ [${new Date().toISOString()}] ${testCase.name} FAILED PERMANENTLY`);
      console.log(`   Final error: ${error.message}`);
      console.log(`   Final status: ${error.response?.status || 'No response'}`);
      console.log(`   Final data: ${JSON.stringify(error.response?.data)}`);
    }
    
    // Small delay between tests
    console.log(`\n⏸️  [${new Date().toISOString()}] Waiting 2 seconds before next test...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏁 [${new Date().toISOString()}] All tests completed`);
  console.log(`${'='.repeat(60)}`);
}

console.log(`\n🚀 Starting detailed retry analysis...`);
runDetailedTest().catch(console.error); 