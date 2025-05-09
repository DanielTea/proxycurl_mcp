import { spawn } from 'child_process';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import { createRequire } from 'module';

// Setup dotenv
dotenv.config({ path: 'test.env' });

// Get API key from environment
const API_KEY = process.env.PROXYCURL_API_KEY;

if (!API_KEY) {
  console.error('ERROR: PROXYCURL_API_KEY not set in test.env file');
  process.exit(1);
}

// Function to start the MCP server process
async function startMCPServer() {
  console.log('Starting MCP server...');
  
  const serverProcess = spawn('node', ['server.js', '--api-key', API_KEY], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, PROXYCURL_DEBUG: 'true' }
  });
  
  // Give the server some time to start
  return new Promise((resolve) => {
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`SERVER: ${output.trim()}`);
      
      // If we see the server started message, we can proceed
      if (output.includes('Server started') || output.includes('Initializing server')) {
        console.log('MCP server is ready!');
        resolve(serverProcess);
      }
    });
    
    // In case the server doesn't start properly, resolve after a timeout
    setTimeout(() => {
      console.log('Assuming server is ready (timed out waiting for start message)');
      resolve(serverProcess);
    }, 3000);
  });
}

// Function to send a tool call to the MCP server
async function callTool(name, args) {
  console.log(`Calling tool "${name}" with args:`, JSON.stringify(args, null, 2));
  
  try {
    // Mock the MCP protocol request
    const payload = {
      command: "mcp-tool-call",
      parameters: {
        tool: name,
        arguments: args
      }
    };

    // For search_employees, create a direct API call to test
    if (name === "search_employees") {
      await makeDirectApiCall(args);
    }
    
    // This would normally communicate with the local MCP server
    // For testing, we'll implement a simplified version directly
    const result = await onRequest(payload);
    
    return result;
    
  } catch (error) {
    console.error(`Error calling tool "${name}":`, error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// Make a direct call to the Proxycurl API to test the search_employees endpoint
async function makeDirectApiCall(args) {
  console.log('\n------------- DIRECT API TEST -------------\n');
  try {
    // Extract parameters from the args
    const url = args.url;
    
    // Basic parameters for the API request
    const apiParams = {
      url: url
    };
    
    // Add other parameters
    if (args.country) apiParams.country = args.country;
    if (args.enrich_profiles) apiParams.enrich_profiles = args.enrich_profiles;
    if (args.page_size) apiParams.page_size = args.page_size;
    
    // Format role_search correctly - this is a key part to test
    if (args.role_search) {
      // Try with quotes properly formatted, not escaped
      apiParams.role_search = args.role_search.replace(/\\"/g, '"');
      console.log(`Formatted role_search: ${apiParams.role_search}`);
    }
    
    console.log('Making direct API call to Proxycurl with parameters:', JSON.stringify(apiParams, null, 2));
    
    // Make the actual API call
    const PROXYCURL_API_BASE = 'https://nubela.co/proxycurl/api';
    const response = await axios.get(`${PROXYCURL_API_BASE}/linkedin/company/employees`, {
      params: apiParams,
      headers: {
        Authorization: `Bearer ${API_KEY}`
      }
    });
    
    console.log('\n------------- DIRECT API RESULTS -------------\n');
    console.log(`Total employees found: ${response.data.employees ? response.data.employees.length : 0}`);
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('Error making direct API call:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Handler for MCP tool call requests
async function onRequest(params) {
  console.log(`Handling MCP request for tool: ${params.parameters.tool}`);
  
  try {
    const toolName = params.parameters.tool;
    
    if (toolName === "search_employees") {
      // We'll handle this via the direct API call for testing
      return { employees: [], next_page: null }; // Placeholder
    }
    
    return { error: `Tool not implemented in test: ${toolName}` };
  } catch (error) {
    console.error("Error handling MCP request:", error);
    throw error;
  }
}

// Main test function
async function runTest() {
  let serverProcess = null;
  
  try {
    // Start the MCP server
    serverProcess = await startMCPServer();
    
    // Test data - matching the example from user
    const searchArgs = {
      url: "https://www.linkedin.com/company/l3harris-technologies/",
      country: "us",
      enrich_profiles: "enrich",
      role_search: "\"General Manager\" OR \"Plant Manager\" OR \"Operations Director\"", // Note: no escaping
      page_size: 5
    };
    
    // Call the search_employees tool
    console.log('\n------------- SENDING SEARCH_EMPLOYEES REQUEST -------------\n');
    const result = await callTool("search_employees", searchArgs);
    
    console.log('\n------------- TEST COMPLETED -------------\n');
    
  } catch (error) {
    console.error("Test failed:", error.message);
  } finally {
    // Stop the MCP server if it's running
    if (serverProcess) {
      console.log("Stopping MCP server...");
      serverProcess.kill();
    }
  }
}

runTest();
