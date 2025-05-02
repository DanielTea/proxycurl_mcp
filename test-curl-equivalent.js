import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';

// Setup dotenv
dotenv.config({ path: 'test.env' });

// Get API key from environment
const API_KEY = process.env.PROXYCURL_API_KEY;

if (!API_KEY) {
  console.error('ERROR: PROXYCURL_API_KEY not set in test.env file');
  process.exit(1);
}

console.log(`Using API Key: ${API_KEY.substring(0, 4)}...`);
console.log("====================================================");

async function runTests() {
  try {
    // Test 1: Basic search with 'headline' parameter
    console.log("Test 1: Basic search with headline parameter");
    let response = await axios.get("https://nubela.co/proxycurl/api/v2/search/person", {
      params: {
        headline: "software engineer",
        region: "California",
        page_size: 3
      },
      headers: {
        Authorization: `Bearer ${API_KEY}`
      }
    });
    console.log(JSON.stringify(response.data, null, 2));
    console.log("====================================================");

    // Test 2: Original complex query
    console.log("Test 2: Complex query with headline parameter");
    response = await axios.get("https://nubela.co/proxycurl/api/v2/search/person", {
      params: {
        headline: "General Manager OR Plant Manager OR Operations Director aerospace",
        region: "California",
        page_size: 3
      },
      headers: {
        Authorization: `Bearer ${API_KEY}`
      }
    });
    console.log(JSON.stringify(response.data, null, 2));
    console.log("====================================================");

    // Test 3: Try with 'keywords' parameter
    console.log("Test 3: Basic search with keywords parameter");
    try {
      response = await axios.get("https://nubela.co/proxycurl/api/v2/search/person", {
        params: {
          keywords: "software engineer",
          region: "California",
          page_size: 3
        },
        headers: {
          Authorization: `Bearer ${API_KEY}`
        }
      });
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log("Error:", error.response ? error.response.data : error.message);
    }
    console.log("====================================================");

    // Test 4: Simplified query
    console.log("Test 4: Simplified search (just job title)");
    response = await axios.get("https://nubela.co/proxycurl/api/v2/search/person", {
      params: {
        headline: "General Manager",
        region: "California",
        page_size: 3
      },
      headers: {
        Authorization: `Bearer ${API_KEY}`
      }
    });
    console.log(JSON.stringify(response.data, null, 2));
    console.log("====================================================");

    // Test 5: Test with specific cities instead of 'Southern California'
    console.log("Test 5: Test with specific cities");
    response = await axios.get("https://nubela.co/proxycurl/api/v2/search/person", {
      params: {
        headline: "General Manager OR Plant Manager",
        region: "California",
        city: "Los Angeles OR San Diego OR Irvine",
        page_size: 3
      },
      headers: {
        Authorization: `Bearer ${API_KEY}`
      }
    });
    console.log(JSON.stringify(response.data, null, 2));
    console.log("====================================================");

  } catch (error) {
    console.error("Test failed:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

runTests();
