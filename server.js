#!/usr/bin/env node

/**
 * Proxycurl MCP Server
 * Provides LinkedIn data access through the Proxycurl API
 */

// Import required dependencies
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createInterface } from "readline";
import axios from "axios";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Get the directory of the current script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
let apiKey = null;

// Check for API key in command line arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--api-key' && i + 1 < args.length) {
    apiKey = args[i + 1];
    safeLog('info', 'Using API key from command line arguments');
    break;
  }
}

// If no API key in command line, check environment variable
if (!apiKey) {
  apiKey = process.env.PROXYCURL_API_KEY;
  if (apiKey) {
    safeLog('info', 'Using API key from PROXYCURL_API_KEY environment variable');
  }
}

// Final check for API key
if (!apiKey) {
  safeLog('error', `

❌ ERROR: Proxycurl API key not found in command line arguments or environment.

Options to provide the API key:

1. Configure in Claude Desktop:
   - Open Claude Desktop settings
   - Go to "Model Context Protocol" tab
   - Ensure your API key is set in the args array:
     ["proxycurl-mcp", "--api-key", "YOUR_ACTUAL_API_KEY"]

2. Set the PROXYCURL_API_KEY environment variable:
   export PROXYCURL_API_KEY=your_api_key

3. Run this CLI tool directly with:
   npx proxycurl-mcp --api-key YOUR_API_KEY
`);
  process.exit(1);
}

// Base URL for Proxycurl API
const PROXYCURL_API_BASE = "https://nubela.co/proxycurl/api";

// Custom MCP Error Class
class MCPError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "MCPError";
  }
}

// Helper function to map HTTP status codes to MCP error codes
function getMcpErrorCode(httpStatus) {
  if (!httpStatus) return ErrorCode.INTERNAL; // Default if status is unknown
  if (httpStatus >= 500) return ErrorCode.INTERNAL;
  switch (httpStatus) {
    case 400: return ErrorCode.INVALID_ARGUMENT;
    case 401: return ErrorCode.UNAUTHENTICATED;
    case 403: return ErrorCode.PERMISSION_DENIED;
    case 404: return ErrorCode.NOT_FOUND;
    case 422: return ErrorCode.INVALID_ARGUMENT; // Unprocessable Entity, often due to bad input
    case 429: return ErrorCode.RESOURCE_EXHAUSTED; // Rate limit
    default: return ErrorCode.UNKNOWN; // Or ErrorCode.INTERNAL for unmapped client errors
  }
}

// Helper function for logging that won't interfere with MCP JSON communication
function safeLog(type, message, data = null) {
  // Only log in development environment when explicitly enabled
  // This prevents logs from breaking the JSON communication with Claude Desktop
  if (process.env.PROXYCURL_DEBUG === 'true') {
    const output = data ? `${message}: ${JSON.stringify(data)}` : message;
    if (type === 'error') {
      console.error(output);
    } else {
      console.log(output);
    }
  }
}

// Create MCP server
const server = new Server(
  { name: "curl-mcp", version: "1.0.0" },
  {
    description: "LinkedIn data search. Allows retrieving detailed LinkedIn profile data for people and companies, as well as searching for professionals and organizations. PRICING: Each credit costs $0.0264 USD.",
    capabilities: {
      tools: {},
    },
  }
);

// ProxycurlClient class to handle API requests
class ProxycurlClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.nextPageSearchPeopleUrl = null; // State for search_people pagination
    
    if (!apiKey || apiKey.trim() === '') {
      safeLog('error', "ERROR: No API key provided or API key is empty");
      throw new Error("No API key provided or API key is empty");
    }
    
    // Log API key length and first few characters for debugging
    safeLog('info', `API Key length: ${apiKey.length} characters`);
    safeLog('info', `API Key first 4 chars: ${apiKey.substring(0, 4)}...`);
    
    // Configure axios with default headers
    this.axiosInstance = axios.create({
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });
    
    // Add request interceptor for logging
    this.axiosInstance.interceptors.request.use(function (config) {
      safeLog('info', `Making request to: ${config.url}`);
      safeLog('info', `Request headers: ${JSON.stringify(config.headers)}`);
      return config;
    }, function (error) {
      safeLog('error', `Request error: ${error.message}`);
      return Promise.reject(error);
    });
  }

  async getPersonProfile(url, options = {}) {
    safeLog('info', `Fetching person profile for ${url} with options: ${JSON.stringify(options)}`);
    try {
      // Build parameters object with all supported options
      const params = {
        url: url,
        ...options // This allows passing any of the optional parameters
      };
      
      // Log the full request URL and parameters for debugging
      const requestUrl = `${PROXYCURL_API_BASE}/v2/linkedin`;
      safeLog('info', `DEBUG: Person profile URL: ${requestUrl}`);
      safeLog('info', `DEBUG: Person profile params: ${JSON.stringify(params)}`);
      
      const response = await this.axiosInstance.get(requestUrl, {
        params: params
      });
      
      // Log the full JSON response
      safeLog('info', `Person profile response (${url}):\n${JSON.stringify(response.data, null, 2)}`);
      
      return response.data;
    } catch (error) {
      safeLog('error', "Error fetching person profile:", error.message);
      if (error.response) {
        safeLog('error', "Response status:", error.response.status);
        safeLog('error', "Response headers:", JSON.stringify(error.response.headers));
        safeLog('error', "Response data:", JSON.stringify(error.response.data));
        const mcpCode = getMcpErrorCode(error.response.status);
        const apiMessage = error.response.data?.detail || error.response.data?.message || error.message;
        throw new MCPError(mcpCode, `Failed to fetch LinkedIn profile for URL '${url}': ${apiMessage}`);
      } else if (error.request) {
        safeLog('error', "No response received. Request:", error.request);
        throw new MCPError(ErrorCode.UNAVAILABLE, `Failed to fetch LinkedIn profile for URL '${url}': No response from server.`);
      } else {
        safeLog('error', "Error setting up request:", error.message);
        throw new MCPError(ErrorCode.INTERNAL, `Failed to fetch LinkedIn profile for URL '${url}': ${error.message}`);
      }
    }
  }

  async getCompanyProfile(url, options = {}) {
    safeLog('info', `Fetching company profile for ${url} with options: ${JSON.stringify(options)}`);
    try {
      // Build parameters object with all supported options from the curl example
      const params = {
        url: url,
        ...options // This allows passing any of the optional parameters
      };
      
      // Log the full request URL and parameters for debugging
      const requestUrl = `${PROXYCURL_API_BASE}/linkedin/company`;
      safeLog('info', `DEBUG: Company profile URL: ${requestUrl}`);
      safeLog('info', `DEBUG: Company profile params: ${JSON.stringify(params)}`);
      
      const response = await this.axiosInstance.get(requestUrl, {
        params: params
      });
      
      // Log the full JSON response
      safeLog('info', `Company profile response (${url}):\n${JSON.stringify(response.data, null, 2)}`);
      
      return response.data;
    } catch (error) {
      safeLog('error', "Error fetching company profile:", error.message);
      if (error.response) {
        safeLog('error', "Response status:", error.response.status);
        safeLog('error', "Response headers:", JSON.stringify(error.response.headers));
        safeLog('error', "Response data:", JSON.stringify(error.response.data));
        const mcpCode = getMcpErrorCode(error.response.status);
        const apiMessage = error.response.data?.detail || error.response.data?.message || error.message;
        throw new MCPError(mcpCode, `Failed to fetch company profile for URL '${url}': ${apiMessage}`);
      } else if (error.request) {
        safeLog('error', "No response received. Request:", error.request);
        throw new MCPError(ErrorCode.UNAVAILABLE, `Failed to fetch company profile for URL '${url}': No response from server.`);
      } else {
        safeLog('error', "Error setting up request:", error.message);
        throw new MCPError(ErrorCode.INTERNAL, `Failed to fetch company profile for URL '${url}': ${error.message}`);
      }
    }
  }

  async lookupProfileByPersonName(first_name, company_domain = null, location = null, title = null, last_name = null, options = {}) {
    // Create a more detailed log message for debugging
    const personInfo = `${first_name || ''} ${last_name || ''}`;
    const companyInfo = company_domain || 'not specified';
    const locationInfo = location || 'not specified';
    const titleInfo = title || 'not specified';
    
    safeLog('info', `Looking up person: ${personInfo}, company: ${companyInfo}, location: ${locationInfo}, title: ${titleInfo}`);
    
    try {
      // Initialize params with required first_name
      const params = {
        first_name: first_name,
        similarity_checks: options.similarity_checks || 'include', // Default to include for better results
        enrich_profile: options.enrich_profile || 'enrich' // Default to enrich for more detailed profiles
      };
      
      // Add last name if available
      if (last_name) {
        params.last_name = last_name;
      }
      
      // Add company domain if available
      if (company_domain) {
        // If company_domain includes a domain, use it directly
        if (company_domain.includes('.')) {
          params.company_domain = company_domain;
        } else {
          // Otherwise, use company name
          params.company_domain = company_domain.replace('.com', '');
        }
      }
      
      // Add location if available
      if (location) {
        params.location = location;
      }
      
      // Add title if available
      if (title) {
        params.title = title;
      }
      
      safeLog('info', "API parameters:", params);
      
      const response = await this.axiosInstance.get(`${PROXYCURL_API_BASE}/linkedin/profile/resolve`, {
        params: params
      });
      
      // Log the full JSON response with person info, not using name variable
      safeLog('info', `Person lookup response for ${personInfo}:\n${JSON.stringify(response.data, null, 2)}`);
      
      return response.data;
    } catch (error) {
      safeLog('error', "Error looking up person:", error.message);
      if (error.response) {
        safeLog('error', "Response data:", error.response.data);
        const mcpCode = getMcpErrorCode(error.response.status);
        const apiMessage = error.response.data?.detail || error.response.data?.message || error.message;
        const inputSummary = `name: ${first_name || ''} ${last_name || ''}, domain: ${company_domain || 'N/A'}, location: ${location || 'N/A'}, title: ${title || 'N/A'}`.trim();
        throw new MCPError(mcpCode, `Failed to lookup person with params (${inputSummary}): ${apiMessage}`);
      } else if (error.request) {
        safeLog('error', "No response received. Request:", error.request);
        const inputSummary = `name: ${first_name || ''} ${last_name || ''}, domain: ${company_domain || 'N/A'}, location: ${location || 'N/A'}, title: ${title || 'N/A'}`.trim();
        throw new MCPError(ErrorCode.UNAVAILABLE, `Failed to lookup person with params (${inputSummary}): No response from server.`);
      } else {
        safeLog('error', "Error setting up request:", error.message);
        const inputSummary = `name: ${first_name || ''} ${last_name || ''}, domain: ${company_domain || 'N/A'}, location: ${location || 'N/A'}, title: ${title || 'N/A'}`.trim();
        throw new MCPError(ErrorCode.INTERNAL, `Failed to lookup person with params (${inputSummary}): ${error.message}`);
      }
    }
  }

  async searchEmployees(url, options = {}) {
    // Make sure options is an object, not a string
    if (typeof options === 'string') {
      try {
        options = JSON.parse(options);
      } catch (e) {
        options = {};
      }
    }
    
    // Create a clean copy of options without undefined values
    const cleanOptions = {};
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined && value !== null) {
        cleanOptions[key] = value;
      }
    }
    
    // Extract role_search separately if present since it needs special handling
    let roleSearch = cleanOptions.role_search;
    delete cleanOptions.role_search;
    
    // Fix escaped quotes in roleSearch if present
    if (roleSearch && typeof roleSearch === 'string') {
      // Convert escaped quotes to regular quotes for the API
      roleSearch = roleSearch.replace(/\\*"/g, '"');
      safeLog('info', `Formatted role_search for API: ${roleSearch}`);
    }
    
    // Extract keyword from options if present
    const keyword = cleanOptions.keyword || null;
    
    safeLog('info', `Searching employees at: ${url}, role: ${roleSearch || 'any'}, keyword: ${keyword || 'none'}`);
    safeLog('info', `Additional options: ${JSON.stringify(cleanOptions)}`);
    
    try {
      // Now build the params object for the API call
      const params = {
        url: url // The company LinkedIn URL is required
      };
      
      // Add role_search if present
      if (roleSearch) params.role_search = roleSearch;
      
      // Add keyword if present
      if (keyword) params.keyword = keyword;
      
      // Set page_size from options or default (using smaller size to save money)
      params.page_size = cleanOptions.page_size || 5;
      
      // Support additional options directly from curl example
      if (cleanOptions.country) params.country = cleanOptions.country;
      if (cleanOptions.coy_name_match) params.coy_name_match = cleanOptions.coy_name_match;
      if (cleanOptions.enrich_profiles) params.enrich_profiles = cleanOptions.enrich_profiles;
      if (cleanOptions.employment_status) params.employment_status = cleanOptions.employment_status;
      if (cleanOptions.sort_by) params.sort_by = cleanOptions.sort_by;
      if (cleanOptions.resolve_numeric_id !== undefined) params.resolve_numeric_id = cleanOptions.resolve_numeric_id;
      if (cleanOptions.use_cache) params.use_cache = cleanOptions.use_cache;
      
      // Log the full request URL and parameters for debugging
      const requestUrl = `${PROXYCURL_API_BASE}/linkedin/company/employees`;
      safeLog('info', `DEBUG: Employee search URL: ${requestUrl}`);
      safeLog('info', `DEBUG: Employee search params: ${JSON.stringify(params)}`);
      
      const response = await this.axiosInstance.get(requestUrl, {
        params: params
      });
      
      // Log employee search response for debugging
      safeLog('info', `Employee search response (${url})\nFound ${response.data.total || 0} employees`);
      if (response.data.total > 0) {
        safeLog('info', `First employee: ${JSON.stringify(response.data.employees[0], null, 2)}`);
      }
      
      return response.data;
    } catch (error) {
      safeLog('error', "Error searching employees:", error.message);
      if (error.response) {
        safeLog('error', "Response status:", error.response.status);
        safeLog('error', "Response headers:", JSON.stringify(error.response.headers));
        safeLog('error', "Response data:", JSON.stringify(error.response.data));
        const mcpCode = getMcpErrorCode(error.response.status);
        const apiMessage = error.response.data?.detail || error.response.data?.message || error.message;
        const roleInfo = options.role_search || 'any';
        const keywordInfo = options.keyword || 'none';
        throw new MCPError(mcpCode, `Failed to search employees for company URL '${url}' (role: ${roleInfo}, keyword: ${keywordInfo}): ${apiMessage}`);
      } else if (error.request) {
        safeLog('error', "No response received. Request:", error.request);
        const roleInfo = options.role_search || 'any';
        const keywordInfo = options.keyword || 'none';
        throw new MCPError(ErrorCode.UNAVAILABLE, `Failed to search employees for company URL '${url}' (role: ${roleInfo}, keyword: ${keywordInfo}): No response from server.`);
      } else {
        safeLog('error', "Error setting up request:", error.message);
        const roleInfo = options.role_search || 'any';
        const keywordInfo = options.keyword || 'none';
        throw new MCPError(ErrorCode.INTERNAL, `Failed to search employees for company URL '${url}' (role: ${roleInfo}, keyword: ${keywordInfo}): ${error.message}`);
      }
    }
  }

  // Modified search_people to handle initial search and pagination
  async search_people(params) {
    const { get_next_page, ...searchParams } = params;

    if (get_next_page === true) {
      // --- Handle fetching next page --- 
      const nextPageUrl = this.nextPageSearchPeopleUrl;
      safeLog('info', `Fetching next page for search_people using URL: ${nextPageUrl}`);
      if (!nextPageUrl) {
        safeLog('warn', "No next page URL available for search_people. Call search_people without 'get_next_page: true' first.");
        return { error: "No next page available. Please perform a new search first (call without 'get_next_page: true').", results: [] }; // Return object
      }

      try {
        // Use axiosInstance which includes default headers (Authorization)
        const response = await this.axiosInstance.get(nextPageUrl);
        
        safeLog('info', `Next page search_people response status: ${response.status}`);
        
        // Update the next page URL for subsequent calls
        this.nextPageSearchPeopleUrl = response.data.next_page || null;
        safeLog('info', `Updated next page URL: ${this.nextPageSearchPeopleUrl}`);
        
        return response.data; // Return object

      } catch (error) {
        safeLog('error', "Error fetching next page for search_people:", error.message);
        const oldUrl = this.nextPageSearchPeopleUrl; // Store old URL before resetting
        this.nextPageSearchPeopleUrl = null; // Reset the URL on error
        if (error.response) {
          safeLog('error', "Response status:", error.response.status);
          safeLog('error', "Response data:", JSON.stringify(error.response.data));
          const detail = error.response.data?.detail || error.message;
          const mcpCode = getMcpErrorCode(error.response.status);
          throw new MCPError(mcpCode, `Failed to fetch next page from ${oldUrl}: ${detail} (Status: ${error.response.status})`);
        } else {
          throw new MCPError(ErrorCode.UNAVAILABLE, `Failed to fetch next page from ${oldUrl}: ${error.message}`);
        }
      }

    } else {
      // --- Handle initial search --- 
      safeLog('info', `Performing NEW search_people with params: ${JSON.stringify(searchParams)}`);
      this.nextPageSearchPeopleUrl = null; // Reset next page URL on new search
      try {
        const requestUrl = `${PROXYCURL_API_BASE}/v2/search/person`;
        safeLog('info', `DEBUG: New Search People URL: ${requestUrl}`);
        safeLog('info', `DEBUG: New Search People Params: ${JSON.stringify(searchParams)}`);

        // Make GET request for a new search, passing params in the query string
        // Exactly matching the curl example from the docs
        const response = await this.axiosInstance.get(requestUrl, { params: searchParams }); // Use GET with params

        safeLog('info', `New search people response:
${JSON.stringify(response.data, null, 2)}`);

        // Store the next page URL if it exists
        this.nextPageSearchPeopleUrl = response.data.next_page || null;
        safeLog('info', `Stored next page URL: ${this.nextPageSearchPeopleUrl}`);

        return response.data; // Return object

      } catch (error) {
        safeLog('error', "Error performing new search_people:", error.message);
        if (error.response) {
          safeLog('error', "Response status:", error.response.status);
          safeLog('error', "Response data:", JSON.stringify(error.response.data));
          const detail = error.response.data?.detail || error.message;
          const mcpCode = getMcpErrorCode(error.response.status);
          throw new MCPError(mcpCode, `Failed to search people with params ${JSON.stringify(searchParams)}: ${detail} (Status: ${error.response.status})`);
        } else if (error.request) {
          safeLog('error', "No response received. Request:", error.request);
          throw new MCPError(ErrorCode.UNAVAILABLE, `Failed to search people with params ${JSON.stringify(searchParams)}: No response from server.`);
        } else {
          throw new MCPError(ErrorCode.INTERNAL, `Failed to search people with params ${JSON.stringify(searchParams)}: ${error.message}`);
        }
      }
    }
  }

  async reset_search_state() {
    safeLog('info', 'Resetting search state: Clearing next page URL.');
    this.nextPageSearchPeopleUrl = null;
    return { success: true, message: 'Search state reset.' }; // Return object
  }

  async advancedSearchCompanies(filters = {}) {
    const filterParams = { ...filters };
    safeLog('info', `Advanced company search with filters: ${JSON.stringify(filterParams, null, 2)}`);
    
    try {
      // Set default page size if not provided (using smaller size to save money)
      if (!filterParams.page_size) {
        filterParams.page_size = 5;
      }
      
      // Parameters that are valid according to the Proxycurl API docs
      const validParams = [
        'country', 'region', 'city', 'type', 'follower_count_min', 'follower_count_max',
        'name', 'industry', 'employee_count_max', 'employee_count_min', 'description',
        'founded_after_year', 'founded_before_year', 'funding_amount_max', 'funding_amount_min',
        'funding_raised_after', 'funding_raised_before', 'public_identifier_in_list',
        'public_identifier_not_in_list', 'page_size', 'enrich_profiles', 'use_cache'
      ];
      
      // Check for any invalid parameters and log them
      const invalidParams = Object.keys(filterParams).filter(param => !validParams.includes(param));
      if (invalidParams.length > 0) {
        safeLog('warn', `WARNING: The following parameters are not in the validParams list: ${invalidParams.join(', ')}`);
      }
      
      // Convert limit parameter to page_size if needed
      if (filterParams.limit && !filterParams.page_size) {
        safeLog('info', `Converting 'limit' parameter to 'page_size'`);
        filterParams.page_size = filterParams.limit;
        delete filterParams.limit;
      }
      
      const requestUrl = `${PROXYCURL_API_BASE}/v2/search/company`;
      safeLog('info', `Making request to: ${requestUrl}`);
      
      // Make the request with Authorization header and URL parameters
      // Exactly matching the curl example from the docs
      const response = await axios.get(requestUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        params: filterParams
      });
      
      safeLog('info', `Advanced company search response (with ${Object.keys(filterParams).length} filters):\n${JSON.stringify(response.data, null, 2)}`);
      
      return response.data;
    } catch (error) {
      safeLog('error', "Error in advanced company search:", error.message);
      if (error.response) {
        safeLog('error', "Response status:", error.response.status);
        safeLog('error', "Response headers:", JSON.stringify(error.response.headers));
        if (error.response.data) {
          safeLog('error', "Response data:", JSON.stringify(error.response.data, null, 2));
        }
        const mcpCode = getMcpErrorCode(error.response.status);
        const apiMessage = error.response.data?.detail || error.response.data?.message || error.message;
        throw new MCPError(mcpCode, `Error in advanced company search with filters ${JSON.stringify(filters)}: ${apiMessage}`);
      } else if (error.request) {
        safeLog('error', "No response received. Request:", error.request);
        throw new MCPError(ErrorCode.UNAVAILABLE, `Error in advanced company search with filters ${JSON.stringify(filters)}: No response from server.`);
      } else {
        throw new MCPError(ErrorCode.INTERNAL, `Error in advanced company search with filters ${JSON.stringify(filters)}: ${error.message}`);
      }
    }
  }
}

// Create ProxycurlClient instance
const proxycurlClient = new ProxycurlClient(apiKey);

// Define tool schemas based on official Proxycurl API documentation
const personProfileSchema = {
  linkedin_profile_url: {
    type: "string",
    description: "LinkedIn profile URL (include only one of: linkedin_profile_url, twitter_profile_url, or facebook_profile_url). URL should be in the format of https://linkedin.com/in/<public-identifier>"
  },
  twitter_profile_url: {
    type: "string",
    description: "Twitter/X profile URL (include only one of: linkedin_profile_url, twitter_profile_url, or facebook_profile_url). URL should be in the format of https://x.com/<public-identifier>"
  },
  facebook_profile_url: {
    type: "string",
    description: "Facebook profile URL (include only one of: linkedin_profile_url, twitter_profile_url, or facebook_profile_url). URL should be in the format of https://facebook.com/<public-identifier>"
  },
  extra: {
    type: "string",
    description: "Optional. Enriches the Person Profile with extra details from external sources (gender, birth date, industry and interests). Values: 'exclude' (default) or 'include'. Costs an extra 1 credit if data is available."
  },
  github_profile_id: {
    type: "string",
    description: "Optional. Enriches the Person Profile with Github Id from external sources. Values: 'exclude' (default) or 'include'. Costs an extra 1 credit if data is available."
  },
  facebook_profile_id: {
    type: "string",
    description: "Optional. Enriches the Person Profile with Facebook Id from external sources. Values: 'exclude' (default) or 'include'. Costs an extra 1 credit if data is available."
  },
  twitter_profile_id: {
    type: "string",
    description: "Optional. Enriches the Person Profile with Twitter Id from external sources. Values: 'exclude' (default) or 'include'. Costs an extra 1 credit if data is available."
  },
  personal_contact_number: {
    type: "string",
    description: "Optional. Enriches the Person Profile with personal numbers from external sources. Values: 'exclude' (default) or 'include'. Costs an extra 1 credit per personal number returned if data is available."
  },
  personal_email: {
    type: "string",
    description: "Optional. Enriches the Person Profile with personal emails from external sources. Values: 'exclude' (default) or 'include'. Costs an extra 1 credit per email returned if data is available."
  },
  inferred_salary: {
    type: "string",
    description: "Optional. Include inferred salary range from external sources. Values: 'exclude' (default) or 'include'. Costs an extra 1 credit if data is available."
  },
  skills: {
    type: "string",
    description: "Optional. Include skills data from external sources. Values: 'exclude' (default) or 'include'. Costs an extra 1 credit if data is available."
  },
  education: {
    type: "string",
    description: "Optional. Set to 'include' to include education information. Default: 'exclude'"
  },
  certification: {
    type: "string",
    description: "Optional. Set to 'include' to include certification information. Default: 'exclude'"
  },
  courses: {
    type: "string",
    description: "Optional. Set to 'include' to include courses information. Default: 'exclude'"
  },
  languages: {
    type: "string",
    description: "Optional. Set to 'include' to include languages information. Default: 'exclude'"
  },
  projects: {
    type: "string",
    description: "Optional. Set to 'include' to include projects information. Default: 'exclude'"
  },
  volunteer_work: {
    type: "string",
    description: "Optional. Set to 'include' to include volunteer work information. Default: 'exclude'"
  },
  // use_cache: {
  //   type: "string",
  //   description: "Optional. Values: 'if-present' (fetches profile from cache regardless of age) or 'if-recent' (default, returns a fresh profile no older than 29 days, costs an extra 1 credit)."
  // },
  fallback_to_cache: {
    type: "string",
    description: "Optional. Tweaks the fallback behavior if an error arises from fetching a fresh profile. Values: 'on-error' (default) or 'never'."
  }
};

const companyProfileSchema = {
  url: {
    type: "string",
    description: "URL of the LinkedIn Company Profile to crawl. URL should be in the format of https://www.linkedin.com/company/<public_identifier>"
  },
  categories: {
    type: "string",
    description: "Optional. Appends categories data of this company. Default value is 'exclude'. Set to 'include' to include these categories (if available) for 1 extra credit."
  },
  funding_data: {
    type: "string",
    description: "Optional. Returns a list of funding rounds that this company has received. Default value is 'exclude'. Set to 'include' to include funding data (if available) for 1 extra credit."
  },
  exit_data: {
    type: "string",
    description: "Optional. Returns a list of investment portfolio exits. Default value is 'exclude'. Set to 'include' to include exit data (if available) for 1 extra credit."
  },
  acquisitions: {
    type: "string",
    description: "Optional. Provides further enriched data on acquisitions made by this company from external sources. Default value is 'exclude'. Set to 'include' to include acquisition data (if available) for 1 extra credit."
  },
  extra: {
    type: "string",
    description: "Optional. Enriches the Company Profile with extra details from external sources (Crunchbase ranking, contact email, phone number, social accounts, funding rounds and amount, IPO status, investor information, etc). Default value is 'exclude'. Set to 'include' to include extra details (if available) for 1 extra credit."
  },
  // use_cache: {
  //   type: "string",
  //   description: "Optional. 'if-present' - Fetches profile from cache regardless of age. If profile is not available in cache, API will attempt to source profile externally. 'if-recent' (Default) - API will make a best effort to return a fresh profile no older than 29 days. Costs an extra 1 credit on top of the base endpoint cost."
  // },
  // fallback_to_cache: {
  //   type: "string",
  //   description: "Optional. Tweaks the fallback behavior if an error arises from fetching a fresh profile. Values: 'on-error' (default) - Fallback to reading the profile from cache if an error arises, or 'never' - Do not ever read profile from cache."
  // }
};

const lookupProfileByPersonNameSchema = {
  company_domain: {
    type: "string",
    description: "Company name or domain. Required."
  },
  first_name: {
    type: "string",
    description: "First name of the user. Required."
  },
  last_name: {
    type: "string",
    description: "Last name of the user. Optional."
  },
  location: {
    type: "string",
    description: "The location of this user. Name of country, city or state. Optional."
  },
  title: {
    type: "string",
    description: "Title that user is holding at his/her current job. Optional."
  },
  similarity_checks: {
    type: "string",
    description: "Controls whether the API performs similarity comparisons between input parameters and results. Values: 'include' (default) - Perform similarity checks and discard false positives (credits charged even for null results), or 'skip' - Bypass similarity checks (no credits charged if no results). Optional."
  },
  enrich_profile: {
    type: "string",
    description: "Enrich the result with a cached profile of the lookup result. Values: 'skip' (default) - Do not enrich results with cached profile data, or 'enrich' - Enriches the result with cached profile data (costs an extra credit). Optional."
  }
};

const searchEmployeesSchema = {
  url: {
    type: "string",
    description: "URL of the LinkedIn Company Profile to target. URL should be in the format of https://www.linkedin.com/company/<public_identifier>. Required."
  },
  role_search: {
    type: "string",
    description: "Filter employees by their title by matching the employee's title against a regular expression. The accepted value is a case-insensitive regular expression. The base cost with this parameter is 10 credits plus 3 extra credits per matched employee. Default: null (no filtering). Optional."
  },
  country: {
    type: "string",
    description: "Limit the result set to the country locality of the profile. Accepts a comma-separated case-insensitive list of Alpha-2 ISO3166 country codes. Example: 'us' for US only, or 'us,sg' for both US and Singapore. Costs an extra 3 credits per result returned. Optional."
  },
  coy_name_match: {
    type: "string",
    description: "Include profiles that match the company name. The Employee Listing Endpoint works by identifying profiles with work experience matching the LinkedIn Company URL. This option also allows profiles with work experience matching the company name. Values: 'include' (default) - Include employees whose profiles match the company name, or 'exclude' - Exclude employees by company name match. Optional."
  },
  // use_cache: {
  //   type: "string",
  //   description: "Define the freshness guarantee on results. Values: 'if-present' (default) - Returns result as-is without freshness guarantee, or 'if-recent' - Returns profiles less than 29 days old (costs 1 extra credit per result on Growth plan, 2 extra credits otherwise). If 'if-recent' is used, page_size is limited to maximum of 10. Optional."
  // },
  enrich_profiles: {
    type: "string",
    description: "Get the full profile of employees instead of only their profile URLs. Values: 'skip' (default) - Lists employee's profile URL only, or 'enrich' - Lists full profile of employees (costs an extra 1 credit per employee returned). Optional."
  },
  page_size: {
    type: "integer",
    description: "Limit the maximum results returned per API call. Default: 10. Accepted values: 1-200000, except when enrich_profiles=enrich where the maximum (and default) is 10. Optional."
  },
  employment_status: {
    type: "string",
    description: "Parameter to tell the API to return past or current employees. Values: 'current' (default) - Lists current employees, 'past' - Lists past employees, or 'all' - Lists both current & past employees. Optional."
  },
  sort_by: {
    type: "string",
    description: "Sort employees by recency. Values: 'recently-joined' - Sort by join date with most recent first, 'recently-left' - Sort by departure date with most recent first, 'oldest' - Returns oldest employees first, or 'none' (default) - No sorting. Non-default sorting adds 50 credits to base cost plus 10 additional credits per employee returned. Optional."
  },
  resolve_numeric_id: {
    type: "boolean",
    description: "Enable support for Company Profile URLs with numerical IDs from Sales Navigator. Values: false (default) - Will not resolve numerical IDs, or true - Enable support for numerical IDs (costs an extra 2 credits). Optional."
  }
};

const searchPeopleSchema = {
  get_next_page: {
    type: "boolean",
    description: "Set to true to fetch the next page of results from the *immediately previous search*. If you want to revisit a previous search to get more results, you'll need to do that search again and then use this for paging, also in this case you could just use a large page size. If true, all other parameters are ignored. Defaults to false.",
    optional: true // Explicitly mark as optional
  },
  headline: {
    type: "string",
    description: "Filter people whose LinkedIn headline fields match the provided search expression."
  },
  summary: {
    type: "string",
    description: "Filter people whose LinkedIn summary fields match the provided search expression."
  },
  country: {
    type: "string",
    description: "Filter people located in this country. This parameter accepts a case-insensitive Alpha-2 ISO3166 country code."
  },
  region: {
    type: "string",
    description: "Filter based on US states. 'Southern California' will NOT return results. Instead, use 'California'."
  },
  city: {
    type: "string",
    description: "Filter people located in a city matching the provided search expression."
  },
  
  // Personal information filters
  first_name: {
    type: "string",
    description: "Filter people whose first names match the provided search expression."
  },
  last_name: {
    type: "string",
    description: "Filter people whose last names match the provided search expression."
  },
  follower_count_min: {
    type: "number",
    description: "Filter people with a LinkedIn follower count more than this value."
  },
  follower_count_max: {
    type: "number",
    description: "Filter people with a LinkedIn follower count less than this value."
  },
  
  // Education filters
  education_field_of_study: {
    type: "string",
    description: "Filter people with a field of study matching the provided search expression, based on education history."
  },
  education_degree_name: {
    type: "string",
    description: "Filter people who earned a degree matching the provided search expression, based on education history."
  },
  education_school_name: {
    type: "string",
    description: "Filter people who have attended a school whose name matches the provided search expression, based on education history."
  },
  education_school_linkedin_profile_url: {
    type: "string",
    description: "Filter people who have attended a school with a specific LinkedIn profile URL, based on education history."
  },
  
  // Current role filters
  current_role_title: {
    type: "string",
    description: "Filter people who are currently working as a role whose title matches the provided search expression. You'll be looking for profiles on LinkDB that show a person's current job. However, keep in mind that some of these profiles may not be up-to-date, which means you might sometimes see a person's old job instead of their current job on LinkedIn."
  },
  current_role_before: {
    type: "string",
    description: "Filter people who started their current role before this date. You'll be looking for profiles on LinkDB that show a person's current job. However, keep in mind that some of these profiles may not be up-to-date, which means you might sometimes see a person's old job instead of their current job on LinkedIn. This parameter takes a ISO8601 date. Default value of this parameter is null."
  },
  current_role_after: {
    type: "string",
    description: "Filter people who started their current role after this date. You'll be looking for profiles on LinkDB that show a person's current job. However, keep in mind that some of these profiles may not be up-to-date, which means you might sometimes see a person's old job instead of their current job on LinkedIn. This parameter takes a ISO8601 date. Default value of this parameter is null."
  },
  current_job_description: {
    type: "string",
    description: "Filter people with current job descriptions matching the provided search expression."
  },
  
  // Past role filters
  past_role_title: {
    type: "string",
    description: "Filter people who have in the past worked as a role whose title matches the provided search expression."
  },
  past_job_description: {
    type: "string",
    description: "Filter people with past job descriptions matching the provided search expression."
  },
  
  // Current company filters
  current_company_linkedin_profile_url: {
    type: "string",
    description: "Filter people who are currently working at a company represented by this LinkedIn Company Profile URL. Default value of this parameter is null."
  },
  current_company_name: {
    type: "string",
    description: "Filter people who are currently working at a company whose name matches the provided search expression."
  },
  current_company_industry: {
    type: "string",
    description: "Filter people who are currently working at a company belonging to an industry that matches the provided search expression. The industry attribute, found in a LinkedIn Company profile, describes the industry in which the company operates. The value of this attribute is an enumerator."
  },
  current_company_country: {
    type: "string",
    description: "Filter people who are currently working at a company with an office based in this country. This parameter accepts a case-insensitive Alpha-2 ISO3166 country code."
  },
  current_company_region: {
    type: "string",
    description: "Filter people who are currently working at a company based in a state or province matching the provided search expression. Searches like 'Southern California' will NOTreturn results, instead search for 'California' and narrow in other parameters."
  },
  current_company_city: {
    type: "string",
    description: "Filter people who are currently working at a company based in a city matching the provided search expression."
  },
  current_company_type: {
    type: "string",
    description: "Filter people who are currently working at a company of the provided LinkedIn type. Possible values: EDUCATIONAL: Educational Institution, GOVERNMENT_AGENCY: Government Agency, NON_PROFIT: Nonprofit, PARTNERSHIP: Partnership, PRIVATELY_HELD: Privately Held, PUBLIC_COMPANY: Public Company, SELF_EMPLOYED: Self-Employed, SELF_OWNED: Sole Proprietorship"
  },
  current_company_employee_count_min: {
    type: "number",
    description: "Filter people who are currently working at a company with at least this many employees."
  },
  current_company_employee_count_max: {
    type: "number",
    description: "Filter people who are currently working at a company with at most this many employees."
  },
  current_company_follower_count_min: {
    type: "number",
    description: "Filter people who are currently working at a company with a LinkedIn follower count more than this value."
  },
  current_company_follower_count_max: {
    type: "number",
    description: "Filter people who are currently working at a company with a LinkedIn follower count less than this value."
  },
  current_company_description: {
    type: "string",
    description: "Filter people who are currently working at a company with a description matching the provided search expression."
  },
  current_company_founded_after_year: {
    type: "number",
    description: "Filter people who are currently working at a company that was founded after this year."
  },
  current_company_founded_before_year: {
    type: "number",
    description: "Filter people who are currently working at a company that was founded before this year."
  },
  current_company_funding_amount_min: {
    type: "number",
    description: "Filter people who are currently working at a company that has raised at least this much (USD) funding amount."
  },
  current_company_funding_amount_max: {
    type: "number",
    description: "Filter people who are currently working at a company that has raised at most this much (USD) funding amount."
  },
  current_company_funding_raised_after: {
    type: "string",
    description: "Filter people who are currently working at a company that has raised funding after this date."
  },
  current_company_funding_raised_before: {
    type: "string",
    description: "Filter people who are currently working at a company that has raised funding before this date."
  },
  
  // Past company filters
  past_company_linkedin_profile_url: {
    type: "string",
    description: "Filter people who have in the past worked at the company represented by this LinkedIn Company Profile URL. This parameter takes a LinkedIn Company Profile URL. Default value of this parameter is null."
  },
  past_company_name: {
    type: "string",
    description: "Filter people who have previously worked at a company whose name matches the provided search expression."
  },
  
  // Skills, languages, interests filters
  linkedin_groups: {
    type: "string",
    description: "Filter people who are members of LinkedIn groups whose names match the provided search expression."
  },
  languages: {
    type: "string",
    description: "Filter people who list a language matching the provided search expression."
  },
  interests: {
    type: "string",
    description: "Filter people whose Linkedin interest fields match the provided search expression."
  },
  skills: {
    type: "string",
    description: "Filter people whose Linkedin skill fields match the provided search expression."
  },
  industries: {
    type: "string",
    description: "Person's inferred industry. May sometimes exist when current_company_industry does not, but current_company_industry should be preferred when it exists."
  },
  
  // Identifier filters
  public_identifier_in_list: {
    type: "string",
    description: "A list of public identifiers (the identifying portion of the person's profile URL). The target person's identifier must be a member of this list."
  },
  public_identifier_not_in_list: {
    type: "string",
    description: "A list of public identifiers (the identifying portion of the person's profile URL). The target person's identifier must not be a member of this list."
  },
  
  // Pagination and enrichment
  page_size: {
    type: "number",
    description: "Tune the maximum results returned per API call. The default value of this parameter is 100. Accepted values for this parameter is an integer ranging from 1 to 100, except when using enrich_profiles='enrich' where the maximum is 10. For basic testing, small values like 3-5 are recommended to save credits. Example: 10. Optional."
  },
  enrich_profiles: {
    type: "string",
    description: "Get the person's complete profile data rather than just the URLs to their LinkedIn profiles. Each request respond with a streaming response of profiles. The valid values are: 'skip' (default): lists person's profile url only, 'enrich': include person's profile data in the list. Calling this API endpoint with this parameter would add 1 credit per result returned."
  },
  // use_cache: {
  //   type: "string",
  //   description: "Define the freshness guarantee on the results returned. This parameter accepts the following values: if-present (default value) - Returns result as-is without freshness guarantee, if-recent - Will make a best effort to return results of profiles no older than 29 days. Costs 1 extra credit per result on top of the base cost of the endpoint for users on the Growth plan or 2 extra credits otherwise. Note: If use_cache=if-recent, page_size is limited to a value of 10 or smaller."
  // }
};

const advancedSearchCompaniesSchema = {
  country: {
    type: "string",
    description: "Filter companies with an office based in this country. Uses Alpha-2 ISO3166 country code (e.g., 'US' for United States). Search expressions are limited to 255 characters. Optional."
  },
  region: {
    type: "string",
    description: "Filter companies located in a state or province. Searches like 'Southern California' will NOTreturn results, instead search for 'California' and narrow in other parameters. Search expressions are limited to 255 characters. Optional."
  },
  city: {
    type: "string",
    description: "Filter companies based in cities matching this search expression. Supports boolean operators (AND, OR). Example: 'San Francisco' or 'New York OR Boston'. Search expressions are limited to 255 characters. Optional."
  },
  type: {
    type: "string",
    description: "Filter companies of the provided LinkedIn type. Valid values: EDUCATIONAL (Educational Institution), GOVERNMENT_AGENCY (Government Agency), NON_PROFIT (Nonprofit), PARTNERSHIP (Partnership), PRIVATELY_HELD (Privately Held), PUBLIC_COMPANY (Public Company), SELF_EMPLOYED (Self-Employed), SELF_OWNED (Sole Proprietorship). Optional."
  },
  follower_count_min: {
    type: "number",
    description: "Filter companies with a LinkedIn follower count more than or equal to this value. Example: 1000. Optional."
  },
  follower_count_max: {
    type: "number",
    description: "Filter companies with a LinkedIn follower count less than or equal to this value. Example: 10000. Optional."
  },
  name: {
    type: "string",
    description: "Filter companies with a name matching this search expression. For basic searches, simply provide the company name (e.g., 'Microsoft'). Supports boolean operators (AND, OR) for more complex queries (e.g., 'Google OR Apple'). Search expressions are limited to 255 characters. Optional."
  },
  industry: {
    type: "string",
    description: "Filter companies belonging to an industry that matches this search expression. Example: 'technology' or 'healthcare AND devices'. Search expressions are limited to 255 characters. Optional."
  },
  employee_count_min: {
    type: "number",
    description: "Filter companies with at least this many employees. Example: 1000. Optional."
  },
  employee_count_max: {
    type: "number",
    description: "Filter companies with at most this many employees. Example: 10000. Optional."
  },
  description: {
    type: "string",
    description: "Filter companies with a description matching this search expression. Supports boolean operators. Example: 'artificial intelligence' or 'medical AND device'. Search expressions are limited to 255 characters. Optional."
  },
  founded_after_year: {
    type: "number",
    description: "Filter companies founded after or in this year. Example: 1999. Optional."
  },
  founded_before_year: {
    type: "number",
    description: "Filter companies founded before or in this year. Example: 2010. Optional."
  },
  funding_amount_min: {
    type: "number",
    description: "Filter companies that have raised at least this much funding amount in USD. Example: 1000000 (for $1 million). This refers to the total funding amount raised across all rounds. Optional."
  },
  funding_amount_max: {
    type: "number",
    description: "Filter companies that have raised at most this much funding amount in USD. Example: 10000000 (for $10 million). This refers to the total funding amount raised across all rounds. Optional."
  },
  funding_raised_after: {
    type: "string",
    description: "Filter companies that have raised funding after or on this date. Must use ISO8601 date format (YYYY-MM-DD). Example: '2019-12-30'. This checks if any funding round was raised on or after the specified date. Optional."
  },
  funding_raised_before: {
    type: "string",
    description: "Filter companies that have raised funding before or on this date. Must use ISO8601 date format (YYYY-MM-DD). Example: '2022-01-01'. This checks if any funding round was raised on or before the specified date. Optional."
  },
  public_identifier_in_list: {
    type: "string",
    description: "A comma-separated list of LinkedIn public identifiers (the portion after /company/ in the company's LinkedIn URL). Only companies with identifiers in this list will be included in results. Example: 'microsoft,apple,google'. Use this to restrict results to a specific set of companies. Optional."
  },
  public_identifier_not_in_list: {
    type: "string",
    description: "A comma-separated list of LinkedIn public identifiers to exclude. Companies with identifiers in this list will NOT be included in results. Example: 'meta,twitter,amazon'. Use this to exclude specific companies from your search. Optional."
  },
  page_size: {
    type: "number",
    description: "Maximum number of results to return per API call. Default: 5. Accepted values range from 1 to 100, except when using enrich_profiles='enrich' where the maximum is 10. For basic testing, small values like 3-5 are recommended to save credits. Example: 10. Optional."
  },
  enrich_profiles: {
    type: "string",
    description: "Controls whether to return complete company profile data or just LinkedIn URLs. Values: 'skip' (default, returns only LinkedIn profile URLs) or 'enrich' (returns complete company profile data, costs an additional 1 credit per result). When 'enrich' is used, page_size is limited to a maximum of 10. Optional."
  },
  // use_cache: {
  //   type: "string",
  //   description: "Controls the freshness guarantee of the returned results. Values: 'if-present' (default, returns results as they are in the cache with no freshness guarantee) or 'if-recent' (returns profiles that are less than 29 days old, costs 1 extra credit per result on the Growth plan or 2 extra credits on other plans). When 'if-recent' is used, page_size is limited to a maximum of 10. Optional."
  // }
};

// Handler for listing available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        // https://nubela.co/proxycurl/docs?shell#people-api-person-profile-endpoint
        name: "get_person_profile", 
        description: "Get structured data of a Personal Profile. COST: 1 credit per profile request (additional credits may apply for optional parameters). Returns comprehensive data including work experience, education, skills, recommendations, volunteer work, certifications, and more.",
        inputSchema: {
          type: "object",
          properties: personProfileSchema,
          required: ["linkedin_profile_url"]
        }
      },
      {
        // https://nubela.co/proxycurl/docs?shell#company-api-company-profile-endpoint
        name: "get_company_profile", 
        description: "Get structured data of a Company Profile. COST: 1 credit per request (additional credits may apply for optional parameters).",
        inputSchema: {
          type: "object",
          properties: companyProfileSchema,
          required: ["url"]
        }
      },
      {
        // https://nubela.co/proxycurl/docs?shell#people-api-person-lookup-endpoint
        name: "lookup_profile_by_person_name", 
        description: "When you already know the first name of the person, combine that with other criteria to find people. NOT TO BE USED TO FIND PEOPLE BY JOB TITLE ALONE! COST: 2 credits per successful request.",
        inputSchema: {
          type: "object",
          properties: lookupProfileByPersonNameSchema,
          required: ["first_name", "company_domain"]
        }
      },
      {
        // https://nubela.co/proxycurl/docs?shell#company-api-employee-listing-endpoint
        name: "search_employees", 
        description: "Get a list of employees of a Company. Cost: 3 credits / employee returned. Extra charges might be incurred if premium optional parameters are used.",
        inputSchema: {
          type: "object",
          properties: searchEmployeesSchema,
          required: ["url"]
        }
      },
      {
        // https://nubela.co/proxycurl/docs?shell#search-api-person-search-endpoint
        name: "search_people", 
        description: "Search for people who meet a set of criteria within the LinkedIn database. COST: 3 credits per LinkedIn URL returned (additional credits may apply for optional parameters). IMPORTANT: Use 'headline' parameter for your main search query (not 'query'). You can also use 'summary', 'current_role_title', etc. for more specific searches. Each search parameter is limited to 255 characters. Search expressions follow the Boolean Search Syntax: Quotes \" \": Search for exact phrases (e.g., \"banana bread\"). OR ||: Search for either term (e.g., 'bananas OR apples'). AND &&: Require all terms (e.g., 'bananas AND apples'). NOT -: Exclude terms (e.g., 'bananas -apples'). Parentheses ( ): Group terms (e.g., '(bananas OR apples) AND bread'). For region searches, use standard LinkedIn regions like 'California' rather than 'Southern California'.",
        inputSchema: {
          type: "object",
          properties: searchPeopleSchema,
          required: [] // No required parameters, more flexible for different search approaches
        }
      },
      {
        // https://nubela.co/proxycurl/docs?shell#search-api-company-search-endpoint
        name: "advanced_search_companies", 
        description: "Search for companies that meet specific criteria within the LinkedIn database. COST: 3 credits per company URL returned plus additional costs for certain parameters.",
        inputSchema: {
          type: "object",
          properties: advancedSearchCompaniesSchema
        }
      },
      {
        name: "reset_search_state", 
        description: "Resets the internal state for search pagination (clears next page URL). For testing.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
    ]
  };
});

// Handler for tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    
    // Log tool call
    safeLog('info', `Tool call: ${name}`, args);
    
    let result;
    
    // Handle different tools
    switch (name) {
      case "get_person_profile":
        result = await proxycurlClient.getPersonProfile(args.linkedin_profile_url || args.url, args);
        break;
        
      case "get_company_profile":
        result = await proxycurlClient.getCompanyProfile(args.url, args);
        break;
        
      case "lookup_profile_by_person_name":
        try {
          // Extract parameters with defaults to avoid undefined errors
          const { 
            first_name, 
            last_name = null, 
            company_domain, 
            location = null, 
            title = null, 
            similarity_checks = 'include', 
            enrich_profile = 'enrich',
            name = null  // For backward compatibility
          } = args;
          
          // Log detailed debugging info
          safeLog('info', `DEBUG lookup_profile_by_person_name parameters: ${JSON.stringify(args, null, 2)}`);
          
          // Check required parameters
          if (!first_name || !company_domain) {
            throw new MCPError(ErrorCode.INVALID_ARGUMENT, "first_name and company_domain are required parameters");
          }
          
          // Setup options object
          const options = {
            similarity_checks,
            enrich_profile
          };
          
          // Log parameters being sent to the client method
          safeLog('info', `Calling lookupProfileByPersonName with: first_name=${first_name}, company_domain=${company_domain}, location=${location}, title=${title}, last_name=${last_name}, options=${JSON.stringify(options)}`);
          
          result = await proxycurlClient.lookupProfileByPersonName(first_name, company_domain, location, title, last_name, options);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; // Return object

        } catch (error) {
          safeLog('error', `DEBUG lookup_profile_by_person_name error: ${error.stack || error.message}`);
          throw new MCPError(ErrorCode.INTERNAL, `Failed to lookup profile by person name: ${error.message}`);
        }
        
      case "search_employees":
        // Pass the entire args object to support all options (page_size, country, etc.)
        result = await proxycurlClient.searchEmployees(args.url, args);
        break;
        
      case 'search_people':
        // Pass all args, the method itself will check for 'get_next_page'
        result = await proxycurlClient.search_people(args);
        break;
        
      case 'advanced_search_companies':
        result = await proxycurlClient.advancedSearchCompanies(args);
        break;
        
      case 'reset_search_state':
        result = await proxycurlClient.reset_search_state();
        break;
        
      default:
        throw new MCPError(ErrorCode.NOT_FOUND, `Tool '${name}' not found.`);
    }
    
    // Log successful tool execution result
    safeLog('info', `Tool '${name}' executed successfully. Result length: ${JSON.stringify(result).length}`);
    // safeLog('info', `DEBUG Full result for '${name}': ${JSON.stringify(result, null, 2)}`); // Uncomment for detailed result logging

    // Wrap the successful result object into the expected Claude structure
    // The result from the client methods should be an object or primitive
    const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return { content: [{ type: "text", text: resultText }] }; 

  } catch (error) {
    safeLog('error', 'Error in CallToolRequestSchema handler:', error);

    if (error instanceof MCPError) {
      // Re-throw MCPError so the SDK's Server can handle it and format it correctly
      throw error;
    }
    
    // Handle Zod validation errors (if you were using Zod for arg validation, e.g., schema.parse(args))
    // This is a generic check; actual ZodError might have a more specific name or structure.
    if (error.name === 'ZodError' && error.errors && Array.isArray(error.errors)) { 
      const validationMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new MCPError(ErrorCode.INVALID_ARGUMENT, `Invalid arguments: ${validationMessages}`);
    }
    
    // Catch all for other errors, convert to MCPError and throw
    // This ensures any unexpected error is also formatted correctly by the SDK Server.
    throw new MCPError(ErrorCode.INTERNAL, error.message || 'An unexpected internal server error occurred.');
  }
});

// Start server
async function runServer() {
  safeLog('info', "Starting Proxycurl MCP server...");
  
  // Use stdio transport
  const transport = new StdioServerTransport();
  // The correct way to start the server is to use the server.connect method
  // which matches the implementation in the official examples
  await server.connect(transport);
  safeLog('info', "Proxycurl MCP Server running on stdio");
}

// Run server
runServer().catch((error) => {
  safeLog('error', "Fatal error running server:", error);
  process.exit(1);
});
