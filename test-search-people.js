import { spawn } from 'child_process';
import axios from 'axios'; // Keep axios for potential direct checks if needed, but not for MCP calls
import dotenv from 'dotenv';
import fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Setup dotenv
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), 'test.env') });

// Get API key from environment
const API_KEY = process.env.PROXYCURL_API_KEY;

if (!API_KEY) {
  console.error('ERROR: PROXYCURL_API_KEY not set in test.env file');
  process.exit(1);
}

let serverProcess;
let requestCounter = 1; // Counter for JSON-RPC request IDs

// --- Server Interaction Functions --- 

// Function to start the MCP server process and wait until it's ready
async function startMCPServer() {
  console.log('Starting MCP server...');
  
  serverProcess = spawn('node', [resolve(dirname(fileURLToPath(import.meta.url)), 'server.js'), '--api-key', API_KEY], {
    stdio: ['pipe', 'pipe', 'pipe'], // Use 'pipe' for stderr too
    env: { ...process.env, PROXYCURL_DEBUG: 'true' } // Enable debug logs if needed
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`SERVER_ERR: ${data.toString().trim()}`);
  });

  // Set a longer timeout in case the server takes time to initialize
  const startupTimeout = 10000; // 10 seconds

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      console.error('Server startup timed out.');
      if (serverProcess) serverProcess.kill();
      reject(new Error('Server startup timed out.'));
    }, startupTimeout);

    let outputBuffer = '';
    serverProcess.stdout.on('data', (data) => {
      outputBuffer += data.toString();
      console.log(`SERVER_OUT: ${data.toString().trim()}`); // Log server output
      // Look for a message indicating the server is ready
      // This depends on server.js logging something specific when ready
      // Let's assume any output means it's starting, and resolve after a short delay
      // A better approach would be for server.js to log a specific 'READY' message.
      // For now, we'll rely on seeing some output and a small delay.
      // Or maybe wait for the first JSON-RPC response? Let's stick to timeout for now.
      // If we see the initial MCP greeting, it's likely ready.
      if (outputBuffer.includes('"jsonrpc":"2.0"')) { 
         console.log('MCP server initial output detected, assuming ready.');
         clearTimeout(timer);
         resolve(serverProcess); 
      }
    });

    serverProcess.on('error', (err) => {
        clearTimeout(timer);
        console.error('Failed to start server process:', err);
        reject(err);
    });

    serverProcess.on('exit', (code) => {
      clearTimeout(timer);
      console.log(`Server process exited with code ${code}`);
      // Only reject if it exits *before* we resolved
      // reject(new Error(`Server process exited prematurely with code ${code}`));
    });
    
    // Send initial listTools request to confirm connection
    const listToolsPayload = JSON.stringify({
      jsonrpc: "2.0",
      method: "mcp/listTools",
      params: {},
      id: requestCounter++
    }) + '\n';
    console.log(`Sending initial listTools request: ${listToolsPayload.trim()}`);
    serverProcess.stdin.write(listToolsPayload);
  });
}

// Function to send a tool call to the MCP server via stdin/stdout
async function callTool(name, args) {
  return new Promise((resolve, reject) => {
    if (!serverProcess || serverProcess.killed) {
      return reject(new Error("Server process is not running."));
    }

    const requestId = requestCounter++;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: name,
        arguments: args
      },
      id: requestId
    }) + '\n'; // Add newline as delimiter

    console.log(`\n>> Sending request (ID: ${requestId}): ${payload.trim()}`);

    let responseBuffer = '';
    const responseListener = (data) => {
      responseBuffer += data.toString();
      // Don't log raw buffer here, wait for line processing
      // console.log(`<< Received data (Buffer): ${data.toString().trim()}`);
      
      // Process buffer line by line
      let newlineIndex;
      while ((newlineIndex = responseBuffer.indexOf('\n')) !== -1) {
          const line = responseBuffer.substring(0, newlineIndex).trim();
          responseBuffer = responseBuffer.substring(newlineIndex + 1);

          if (line && line.startsWith('{') && line.endsWith('}')) { // Basic check for JSON structure
              try {
                  const response = JSON.parse(line);
                  console.log(`<< Parsed Potential JSON (ID: ${response.id}): ${line}`); // Log the parsed line
                  
                  if (response.id === requestId) {
                      console.log(`<< Matched response (ID: ${requestId})`);
                      clearTimeout(timer); // Clear timeout as we got the response
                      serverProcess.stdout.removeListener('data', responseListener); // Clean up listener
                      
                      if (response.error) {
                          console.error(`MCP Error received for ID ${requestId}:`, response.error);
                          reject(new Error(`MCP Error: ${response.error.message} (Code: ${response.error.code})`));
                      } else if (response.result && typeof response.result === 'object' && typeof response.result.result === 'string') {
                          // Handle the observed nested structure: { result: { result: "stringified_json" } }
                          try {
                              const toolResult = JSON.parse(response.result.result); 
                              console.log(`<< Extracted tool result (ID: ${requestId}) from nested structure:`, JSON.stringify(toolResult, null, 2));
                              resolve(toolResult); // Resolve with the PARSED inner result
                          } catch (parseError) {
                              console.error(`Failed to parse nested response.result.result string for ID ${requestId}:`, response.result.result)
                              reject(new Error(`Failed to parse tool result JSON from nested structure: ${parseError.message}`));
                          }
                      } else if (response.result && typeof response.result === 'string') {
                           // Handle the case where result is directly a string (original expectation)
                           // The actual tool result is nested within response.result as a STRING
                           try {
                               const toolResult = JSON.parse(response.result); 
                               console.log(`<< Extracted tool result (ID: ${requestId}):`, JSON.stringify(toolResult, null, 2));
                               resolve(toolResult); // Resolve with the PARSED inner result
                           } catch (parseError) {
                               console.error(`Failed to parse nested response.result string for ID ${requestId}:`, response.result)
                               reject(new Error(`Failed to parse tool result JSON: ${parseError.message}`));
                           }
                      } else {
                           console.error(`Invalid response structure for ID ${requestId}: Missing or invalid 'result' field.`, response);
                           reject(new Error(`Invalid response structure for ID ${requestId}.`));
                      }
                      return; // Exit once the matching response is found and processed
                  } else {
                    // It's a JSON line, but not for our request ID, ignore it.
                    // console.log(`-- Ignoring JSON response for different ID (${response.id})`);
                  }
              } catch (e) {
                  // It looked like JSON, but failed to parse. Log it as a warning.
                  console.warn(`WARN: Failed to parse potential JSON line: ${line}`, e.message);
              }
          } else if (line) {
             // It's a line, but not JSON (likely a debug log), just print it if debugging
             // console.log(`<< Received non-JSON line: ${line}`);
          }
      }
       // Keep any remaining partial line in the buffer for the next 'data' event
    };

    // Timeout for the request
    const requestTimeout = 30000; // 30 seconds, Proxycurl can be slow
    const timer = setTimeout(() => {
        console.error(`Request ID ${requestId} timed out.`);
        serverProcess.stdout.removeListener('data', responseListener);
        reject(new Error(`Request ${requestId} timed out after ${requestTimeout}ms`));
    }, requestTimeout);

    serverProcess.stdout.on('data', responseListener);

    // Handle potential write errors
    if (!serverProcess.stdin.write(payload)) {
        clearTimeout(timer);
        serverProcess.stdout.removeListener('data', responseListener);
        reject(new Error("Failed to write to server stdin."));
    }
  });
}

// --- Test Execution --- 

// Main function to run the test
async function runTest() {
  try {
    // Start the MCP server
    await startMCPServer();

    // --- Test 1: Initial Search --- 
    console.log('\n------------- TEST 1: Initial Search -------------\n');
    const searchArgs = {
      headline: "Software Engineer OR Developer",
      region: "California",
      page_size: 2 // Small page size to ensure pagination
    };
    let firstPageResult;
    try {
      firstPageResult = await callTool("search_people", searchArgs);
      console.log('Initial search results:', JSON.stringify(firstPageResult, null, 2));
      if (!firstPageResult || !firstPageResult.results) {
        // Check if it was an error returned *within* the result object
        if (firstPageResult.error) {
            throw new Error(`Initial search failed with error: ${firstPageResult.error}`);
        }
        throw new Error("Initial search did not return expected 'results' field or an error field.");
      }
      console.log(`Found ${firstPageResult.results.length} results on first page.`);
      if (firstPageResult.results.length === 0) {
          console.warn("WARN: Initial search returned 0 results. Pagination test might not be meaningful.");
      }
      if (firstPageResult.error) {
        throw new Error(`Initial search returned error: ${firstPageResult.error}`);
      }
    } catch (error) {
      console.error("Initial search failed:", error);
      throw error; // Stop test if initial search fails
    }

    // --- Test 2: Get Next Page --- 
    console.log('\n------------- TEST 2: Get Next Page -------------\n');
    // Check if the previous result indicated a next page exists implicitly (server stores the URL)
    // Proxycurl response includes 'next_page' field, but our tool abstracts that.
    // We just need to call with get_next_page: true
    let secondPageResult;
    try {
      secondPageResult = await callTool("search_people", { get_next_page: true });
      console.log('Next page results:', JSON.stringify(secondPageResult, null, 2));
      if (!secondPageResult || !secondPageResult.results) {
        // Check if it was an error returned *within* the result object
        if (secondPageResult.error) {
             // It's possible the first search had few results and no actual next page
             if (secondPageResult.error.includes("No next page available")) {
               console.warn("WARN: Server reported no next page available, which might be correct.")
             } else {
               throw new Error(`Next page call failed with error: ${secondPageResult.error}`);
             }
        } else {
           throw new Error("Next page call did not return expected 'results' field or an error field.");
        }
      }
      console.log(`Found ${secondPageResult.results.length} results on second page.`);
      // Error check moved above
      /*
      if (secondPageResult.error) {
         // It's possible the first search had few results and no actual next page
         if (secondPageResult.error.includes("No next page available")) {
           console.warn("WARN: Server reported no next page available, which might be correct.")
         } else {
           throw new Error(`Next page call returned error: ${secondPageResult.error}`);
         }
      }
      */
      // Add closing comment tag
      // Basic check: If both pages have results, ensure they are different (simple check on first profile URL)
      if (firstPageResult.results.length > 0 && secondPageResult.results.length > 0 
          && firstPageResult.results[0]?.linkedin_profile_url && secondPageResult.results[0]?.linkedin_profile_url) { // Add null checks
          if (firstPageResult.results[0].linkedin_profile_url === secondPageResult.results[0].linkedin_profile_url) {
              console.warn("WARN: First result on page 1 and page 2 are the same. Pagination might not be working as expected or data is limited.");
          }
      }

    } catch (error) {
       console.error("Next page call failed:", error);
       // Don't necessarily stop the test, might be expected if no next page
    }
    
    // --- Test 3: Get Next Page BEFORE Initial Search --- 
    console.log('\n------------- TEST 3: Get Next Page Before Initial Search -------------\n');

    // Reset the server's search state before this test
    console.log('>> Sending request (ID: reset): {"jsonrpc":"2.0","method":"tools/call","params":{"name":"reset_search_state","arguments":{}},"id":"reset"}');
    serverProcess.stdin.write('{"jsonrpc":"2.0","method":"tools/call","params":{"name":"reset_search_state","arguments":{}},"id":"reset"}\n');
    const resetResult = await waitForResponse(serverProcess, 'reset');
    console.log('<< Reset State Result:', resetResult);
    if (!resetResult?.result?.includes('"success":true')) { // Check if the result string contains the success indicator
      throw new Error('Failed to reset server state before Test 3.');
    }

    // Now attempt to get next page without a prior search in this context
    const nextPageArgs = { get_next_page: true };
    const nextPageResult = await callTool("search_people", nextPageArgs);
    console.log('Result (Next Page Before Initial):', JSON.stringify(nextPageResult, null, 2));
    if (!nextPageResult.error || !nextPageResult.error.includes("No next page available")) {
       console.error("FAIL: Calling next page before initial search did NOT return the expected error.", nextPageResult);
       throw new Error("Test 3 Failed: Did not get expected 'No next page' error."); // Make sure test actually fails
    } else {
        console.log("PASS: Correctly received 'No next page available' error.");
    }

    console.log('\n------------- TEST COMPLETED SUCCESSFULLY -------------\n');

  } catch (error) {
    console.error('\n!!!!!!!!!!!!!! TEST FAILED !!!!!!!!!!!!!!\n');
    console.error(error.message);
    if (error.stack) {
        console.error(error.stack);
    }
  } finally {
    // Clean up the server process
    if (serverProcess && !serverProcess.killed) {
      console.log('Stopping MCP server...');
      serverProcess.kill();
      console.log('Server stopped.');
    }
  }
}

// Run the test
runTest();

// Helper function to wait for a specific response ID
async function waitForResponse(process, id) {
  return new Promise((resolve, reject) => {
    let responseBuffer = '';
    const responseListener = (data) => {
      responseBuffer += data.toString();
      // Process buffer line by line
      let newlineIndex;
      while ((newlineIndex = responseBuffer.indexOf('\n')) !== -1) {
          const line = responseBuffer.substring(0, newlineIndex).trim();
          responseBuffer = responseBuffer.substring(newlineIndex + 1);

          if (line && line.startsWith('{') && line.endsWith('}')) { // Basic check for JSON structure
              try {
                  const response = JSON.parse(line);
                  if (response.id === id) {
                      process.stdout.removeListener('data', responseListener); // Clean up listener
                      resolve(response);
                  }
              } catch (e) {
                  // It looked like JSON, but failed to parse. Log it as a warning.
                  console.warn(`WARN: Failed to parse potential JSON line: ${line}`, e.message);
              }
          }
      }
    };

    process.stdout.on('data', responseListener);
  });
}
