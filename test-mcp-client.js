#!/usr/bin/env node

import { spawn } from 'child_process';
import readline from 'readline';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get directory name for the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from test.env file
config({ path: join(__dirname, 'test.env') });

// Get API key from environment variable or command line arguments
let API_KEY = process.env.PROXYCURL_API_KEY || null;

// Try command line arguments
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--api-key' && i + 1 < process.argv.length) {
    API_KEY = process.argv[i + 1];
    break;
  }
}

// Check if API key is provided
if (!API_KEY) {
  console.error('Error: Proxycurl API key is required.');
  console.error('Option 1: Add your API key to the test.env file (PROXYCURL_API_KEY=your_key)');
  console.error('Option 2: Run with: node test-mcp-client.js --api-key YOUR_API_KEY');
  console.error('Option 3: Set the PROXYCURL_API_KEY environment variable');
  process.exit(1);
}

// This is a simple JSON-RPC 2.0 client for MCP
class MCPClient {
  constructor() {
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.serverProcess = null;
    this.serverOutputReader = null;
  }

  async start() {
    console.log("Starting MCP server...");
    
    // Start the server process with debug mode enabled
    this.serverProcess = spawn('node', ['server.js', '--api-key', API_KEY], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PROXYCURL_DEBUG: 'true' }
    });

    // Set up readline interface to parse server responses
    this.serverOutputReader = readline.createInterface({
      input: this.serverProcess.stdout,
      terminal: false
    });
    
    // Also capture stderr for debugging
    this.serverProcess.stderr.on('data', (data) => {
      console.error(`SERVER DEBUG: ${data.toString().trim()}`);
    });

    // Handle server responses
    this.serverOutputReader.on('line', (line) => {
      try {
        const response = JSON.parse(line);
        
        // Find the corresponding request and resolve its promise
        if (response.id !== undefined && this.pendingRequests.has(response.id)) {
          const { resolve, reject } = this.pendingRequests.get(response.id);
          
          if (response.error) {
            reject(response.error);
          } else {
            resolve(response.result);
          }
          
          this.pendingRequests.delete(response.id);
        }
      } catch (error) {
        console.log("Non-JSON response:", line);
      }
    });

    // Handle server error output
    this.serverProcess.stderr.on('data', (data) => {
      console.error(`Server error: ${data.toString()}`);
    });

    // Wait a moment for server to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Initialize the connection
    await this.initialize();
  }

  stop() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
    
    if (this.serverOutputReader) {
      this.serverOutputReader.close();
      this.serverOutputReader = null;
    }
  }

  async send(method, params = {}) {
    const id = this.requestId++;
    
    return new Promise((resolve, reject) => {
      // Store the promise callbacks
      this.pendingRequests.set(id, { resolve, reject });
      
      // Create JSON-RPC 2.0 request
      const request = {
        jsonrpc: "2.0",
        id,
        method,
        params
      };
      
      // Send request to server
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async initialize() {
    const initParams = {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" }
    };
    
    const result = await this.send("initialize", initParams);
    console.log("Connected to MCP server:", result.serverInfo);
    
    // Send initialized notification
    this.serverProcess.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized"
    }) + '\n');
    
    return result;
  }

  async listTools() {
    const result = await this.send("tools/list");
    return result.tools;
  }

  async callTool(name, args) {
    const result = await this.send("tools/call", { name, arguments: args });
    return result;
  }
}

// Parse command-line args for custom tool call
function parseCustomToolCall() {
  let customTool = null;
  let customArgs = null;
  
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--tool' && i + 1 < process.argv.length) {
      customTool = process.argv[i + 1];
    }
    if (process.argv[i] === '--args' && i + 1 < process.argv.length) {
      try {
        customArgs = JSON.parse(process.argv[i + 1]);
      } catch (e) {
        console.error('Error parsing args JSON:', e.message);
        process.exit(1);
      }
    }
  }
  
  return { customTool, customArgs };
}

// Main test function
async function runTest() {
  const client = new MCPClient();
  const { customTool, customArgs } = parseCustomToolCall();
  
  try {
    await client.start();
    
    // List available tools
    console.log("\n=== Available Tools ===");
    const tools = await client.listTools();
    tools.forEach(tool => {
      console.log(`- ${tool.name}: ${tool.description}`);
    });
    
    if (customTool && customArgs) {
      // Run custom tool call
      console.log(`\n=== Testing ${customTool} with custom args ===`);
      const customResult = await client.callTool(customTool, customArgs);
      console.log("Result:", JSON.stringify(customResult, null, 2));
    } else {
      // Run default test cases
      console.log("\n=== Testing advanced_search_companies ===\nParams: various test cases");
      
      // Try a very basic search with just company name
      console.log("\nTest Case 1: Basic search for a major company");
      try {
        const basicParams = {
          "name": "Microsoft",
          "page_size": 3
        };
        console.log("Sending basic search with params:", JSON.stringify(basicParams, null, 2));
        const basicSearch = await client.callTool("advanced_search_companies", basicParams);
        console.log("Success!", JSON.stringify(basicSearch, null, 2));
      } catch (error) {
        console.error("Test Case 1 failed:", error.message);
      }
      
      // Try with just employee count range
      console.log("\nTest Case 2: Search with employee count range");
      try {
        console.log("Sending request with params: { employee_count_min: 5000, employee_count_max: 10000 }");
        const employeeSearch = await client.callTool("advanced_search_companies", {
          employee_count_min: 5000,
          employee_count_max: 10000,
          page_size: 3
        });
        console.log("Success!", JSON.stringify(employeeSearch, null, 2));
      } catch (error) {
        console.error("Test Case 2 failed:", error.message);
      }
      
      // Try with location parameters
      console.log("\nTest Case 3: Search with location parameters");
      try {
        console.log("Sending request with params: { country: 'US', region: 'California' }");
        const locationSearch = await client.callTool("advanced_search_companies", {
          country: "US",
          region: "California",
          page_size: 3
        });
        console.log("Success!", JSON.stringify(locationSearch, null, 2));
      } catch (error) {
        console.error("Test Case 3 failed:", error.message);
      }
      
      console.log("\n=== Testing lookup_profile_by_person_name ===\nPerson: Satya Nadella, Company: Microsoft");
      console.log("Sending lookup_profile_by_person_name request with params:");
      const lookupParams = {
        first_name: "Satya",
        last_name: "Nadella", 
        company_domain: "microsoft.com"
      };
      console.log(JSON.stringify(lookupParams, null, 2));
      try {
        const lookupResult = await client.callTool("lookup_profile_by_person_name", lookupParams);
        console.log("Result:", JSON.stringify(lookupResult, null, 2));
      } catch (error) {
        console.error("Error calling lookup_profile_by_person_name:", error);
      }
      
      console.log("\n=== Testing search_employees ===\nCompany: Microsoft, Role: CEO");
      console.log("Sending search_employees request with params:");
      const employeeSearchParams = {
        "linkedinUrl": "https://www.linkedin.com/company/microsoft",
        "page_size": 5,
        "role": "CEO"
      };
      console.log(JSON.stringify(employeeSearchParams, null, 2));
      try {
        const employeeSearchResult = await client.callTool("search_employees", employeeSearchParams);
        console.log("Result:", JSON.stringify(employeeSearchResult, null, 2));
      } catch (error) {
        console.error("Error calling search_employees:", error);
      }
    }
  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    client.stop();
  }
}

// Run the test
runTest().catch(console.error);
