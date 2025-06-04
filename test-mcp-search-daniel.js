#!/usr/bin/env node

/**
 * Test script that exactly mimics the MCP server search calls for Daniel Tremer
 */

import axios from 'axios';

const apiKey = process.argv[2] || process.env.PROXYCURL_API_KEY;

if (!apiKey) {
  console.error('❌ No API key provided. Usage: node test-mcp-search-daniel.js [API_KEY]');
  process.exit(1);
}

console.log(`🔍 Testing MCP-style search for Daniel Tremer with API key: ${apiKey.substring(0, 4)}...`);

const PROXYCURL_API_BASE = "https://nubela.co/proxycurl/api";

// Exact copy of the retry logic from server.js
class MCPStyleClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.axiosInstance = axios.create({
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });
  }

  // Exact copy of makeRequestWithRetry from server.js
  async makeRequestWithRetry(url, params, maxRetries = 3) {
    console.log(`🚀 Making request to: ${url}`);
    console.log(`📦 Params: ${JSON.stringify(params)}`);
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const response = await this.axiosInstance.get(url, { params });
        console.log(`✅ Request succeeded on attempt ${attempt}`);
        return response;
      } catch (error) {
        console.log(`❌ Attempt ${attempt} failed: ${error.response?.status} - ${error.response?.data?.description || error.message}`);
        
        const isRetryableError = this.isRetryableError(error);
        const isLastAttempt = attempt > maxRetries;
        
        if (isRetryableError && !isLastAttempt) {
          const delay = this.calculateRetryDelay(attempt, error.response?.status);
          console.log(`⚠️  Retrying in ${Math.round(delay)}ms... (attempt ${attempt}/${maxRetries + 1})`);
          
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

  // Exact copy of search_people logic from server.js
  async search_people(params) {
    const { get_next_page, ...searchParams } = params;

    if (get_next_page === true) {
      throw new Error("Next page functionality not implemented in test");
    } else {
      // --- Handle initial search --- 
      console.log(`🔍 Performing NEW search_people with params: ${JSON.stringify(searchParams)}`);
      try {
        const requestUrl = `${PROXYCURL_API_BASE}/v2/search/person`;
        console.log(`🌐 URL: ${requestUrl}`);
        
        // Make GET request for a new search with retry logic
        const response = await this.makeRequestWithRetry(requestUrl, searchParams);
        
        console.log(`✅ Search successful! Found ${response.data.results?.length || 0} results`);
        
        return response.data;

      } catch (error) {
        console.log(`❌ Search failed: ${error.message}`);
        if (error.response) {
          console.log(`📊 Status: ${error.response.status}`);
          console.log(`📄 Data: ${JSON.stringify(error.response.data)}`);
          
          // This is where the MCP error gets thrown
          const detail = error.response.data?.detail || error.response.data?.description || error.message;
          
          // Provide more specific error messages for 403 responses
          if (error.response.status === 403) {
            const apiKeyInfo = `API key: ${this.apiKey.substring(0, 4)}...`;
            
            // Check for specific credit-related errors
            if (error.response.data?.description?.includes('Not enough credits') || error.response.data?.code === 403) {
              const enhancedMessage = `Search failed - Proxycurl returned "Not enough credits" error. This may be temporary. Try checking your credit balance and retrying the request. ${apiKeyInfo}. Original error: ${detail}`;
              throw new Error(enhancedMessage);
            }
            
            const enhancedMessage = `Failed to search people - Access Forbidden (403). This usually indicates: 1) Invalid API key, 2) Insufficient account permissions, 3) Account out of credits (possibly temporary), or 4) API key lacks access to search endpoints. Try retrying the request. ${apiKeyInfo}. Original error: ${detail}`;
            throw new Error(enhancedMessage);
          }
          
          throw new Error(`Failed to search people with params ${JSON.stringify(searchParams)}: ${detail} (Status: ${error.response.status})`);
        } else if (error.request) {
          throw new Error(`Failed to search people with params ${JSON.stringify(searchParams)}: No response from server.`);
        } else {
          throw new Error(`Failed to search people with params ${JSON.stringify(searchParams)}: ${error.message}`);
        }
      }
    }
  }
}

async function testMCPStyleSearch() {
  const client = new MCPStyleClient(apiKey);
  
  console.log('\n🎯 Test 1: Exact MCP call - first_name: "Daniel", last_name: "Tremer"');
  try {
    const result1 = await client.search_people({
      first_name: "Daniel",
      last_name: "Tremer"
    });
    console.log(`✅ Success! Found ${result1.results?.length || 0} results`);
    if (result1.results?.length > 0) {
      console.log(`👤 First result: ${result1.results[0].full_name || 'Unknown'}`);
    }
  } catch (error) {
    console.log(`❌ Test 1 failed: ${error.message}`);
  }
  
  console.log('\n🎯 Test 2: Exact MCP call - headline: "Daniel Tremer"');
  try {
    const result2 = await client.search_people({
      headline: "Daniel Tremer"
    });
    console.log(`✅ Success! Found ${result2.results?.length || 0} results`);
    if (result2.results?.length > 0) {
      console.log(`👤 First result: ${result2.results[0].full_name || 'Unknown'}`);
    }
  } catch (error) {
    console.log(`❌ Test 2 failed: ${error.message}`);
  }
  
  console.log('\n📊 Summary:');
  console.log('This test mimics exactly what the MCP server does when searching for Daniel Tremer');
  console.log('If retry logic works here but not in MCP, there may be an issue with how errors are handled in the MCP context');
}

testMCPStyleSearch(); 