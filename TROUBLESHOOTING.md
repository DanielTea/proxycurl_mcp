# Proxycurl MCP Server Troubleshooting Guide

## 403 Forbidden Error Resolution

### Problem
The MCP server was returning 403 Forbidden errors when trying to search for people on LinkedIn through the Proxycurl API.

### Root Cause Identified
The error message "Not enough credits" can indicate either:
1. **Insufficient credits** in the Proxycurl account 
2. **Temporary API issues** where Proxycurl incorrectly reports credit problems

**Note**: In many cases, this error is temporary and resolves itself. Always check your actual credit balance first.

### Error Details
```
Status: 403
Error: { code: 403, description: 'Not enough credits', name: 'Forbidden' }
```

### Solution
Add credits to your Proxycurl account at https://nubela.co/proxycurl/

### Credit Costs
- **Profile lookups**: 1 credit per request
- **Search operations**: 3 credits per result returned
- **Company searches**: 3 credits per company URL returned

## Debugging Tools

### 1. Test API Key Script
```bash
node test-api-key.js YOUR_API_KEY
```
This script tests both profile lookup and search endpoints to verify API key validity and credit availability.

### 2. Debug MCP Calls Script
```bash
node debug-mcp-call.js YOUR_API_KEY
```
This script tests the exact same API calls that were failing in the MCP logs.

### 3. MCP Server Test Tool
The server now includes a `test_api_key` tool that can be called from your MCP client to validate the API key.

## Enhanced Error Messages

The server now provides more specific error messages for 403 responses:

- **Credit-related**: "Search failed - Your Proxycurl account has insufficient credits. Please add credits to your account at https://nubela.co/proxycurl/"
- **General 403**: Detailed explanation of possible causes (invalid key, permissions, credits, etc.)

## Debug Logging

Enable detailed logging by setting:
```bash
export PROXYCURL_DEBUG=true
```

## Common Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| 403 "Not enough credits" | Account out of credits | Add credits at https://nubela.co/proxycurl/ |
| 403 "Forbidden" | Invalid API key | Verify API key in dashboard |
| 401 "Unauthorized" | Wrong API key format | Check API key format |
| 429 "Rate Limited" | Too many requests | Automatic retry with exponential backoff |

## API Key Validation

Proxycurl API keys are typically 20+ characters long. If your key is shorter, it may be invalid.

## Files Modified

1. **server.js**: Enhanced error handling and debugging
2. **test-api-key.js**: Standalone API key testing
3. **debug-mcp-call.js**: MCP call debugging
4. **README.md**: Added troubleshooting section
5. **TROUBLESHOOTING.md**: This comprehensive guide

## Automatic Retry Logic

The server now includes robust retry mechanisms:

- **Rate Limiting (429)**: Automatic retry with exponential backoff (5s, 10s, 20s delays)
- **Server Errors (500, 502, 503, 504)**: Retries with shorter delays (1s, 2s, 4s)
- **Temporary Credit Issues**: Retries 403 "not enough credits" errors
- **Network Failures**: Handles connection timeouts and network issues
- **Smart Backoff**: Uses jitter to prevent thundering herd effects

Test the retry logic:
```bash
node test-retry-logic.js YOUR_API_KEY
```

## Next Steps

1. Add credits to your Proxycurl account if needed
2. Test the API key using the provided scripts
3. The server will automatically handle temporary issues with retry logic
4. Enhanced error messages provide clearer guidance for any persistent issues 