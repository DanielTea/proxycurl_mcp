# Proxycurl MCP Server

This is a Node.js-based Model Context Protocol (MCP) server that exposes Proxycurl's LinkedIn data API. It can be used with any MCP-compatible client (e.g., Claude Desktop) to access LinkedIn profile data, company information, and search for employees.

## Features

- Look up LinkedIn profiles by URL
- Look up LinkedIn companies by URL
- Find people by name and company
- Search for employees at a company by role or keyword

## Prerequisites

- Node.js (v14 or higher)
- A Proxycurl API key (get one at https://nubela.co/proxycurl/)
- An MCP-compatible client (e.g., Claude Desktop)

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/dbogardus/proxycurl-mcp-server.git
   cd proxycurl-mcp-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install the MCP server globally:
   ```bash
   npm install -g .
   ```

## API Key Configuration

There are two ways to configure your Proxycurl API key:

### Option 1: Environment Variable (for CLI usage)

Set the `PROXYCURL_API_KEY` environment variable:

```bash
export PROXYCURL_API_KEY=your_api_key_here
```

This is useful for development or when running the CLI directly.

### Option 2: Example: Claude Desktop Configuration (recommended for Claude Desktop users)

To configure Claude Desktop to use this MCP server:

1. Open Claude Desktop
2. Click the settings (⚙️) icon in the top right
3. Select the "Model Context Protocol" tab
4. Click "Add MCP Configuration"
5. Enter the following information:
   - **Name**: `Proxycurl LinkedIn API`
   - **Command**: `npx`
   - **Args**: `["proxycurl-mcp", "--api-key", "YOUR_ACTUAL_API_KEY"]`

   Example configuration in claude_desktop_config.json:
   ```json
   {
     "mcpServers": [
       {
         "name": "Proxycurl LinkedIn API",
         "command": "npx",
         "args": ["proxycurl-mcp", "--api-key", "YOUR_ACTUAL_API_KEY"]
       }
     ]
   }
   ```

6. Replace `YOUR_ACTUAL_API_KEY` with your Proxycurl API key (get one at https://nubela.co/proxycurl/)
7. Click "Save"
8. Restart Claude Desktop to apply changes

## Usage

Once configured, your MCP client will be able to access LinkedIn data through the following tools:

- `get_person_profile`: Get a person's LinkedIn profile by URL
  - **Example**: `linkedinUrl: "https://www.linkedin.com/in/williamhgates"`
  - Returns comprehensive profile data including experience, education, skills, certifications

- `get_company_profile`: Get a company's LinkedIn profile by URL
  - **Example**: `linkedinUrl: "https://www.linkedin.com/company/microsoft"`
  - Returns detailed company data including description, size, industry, and specialties

- `lookup_person`: Find a person's LinkedIn profile by name and company
  - **Important**: Requires both name and company parameters for best results
  - **Example**: `name: "Bill Gates", company: "microsoft.com"` 
  - Returns LinkedIn URL for the person if found

- `search_employees`: Search for employees at a company with role and keyword filters
  - **Example**: `linkedinUrl: "https://www.linkedin.com/company/microsoft", role: "Software Engineer"`
  - Returns list of employees with basic profile information

- `search_companies`: Search for companies by name or domain
  - **Example**: `query: "Microsoft"` or `query: "microsoft.com", limit: 5`
  - Use this to find LinkedIn company URLs when you only have the company name

- `search_people`: Search for people on LinkedIn by keywords, title, company, and location
  - **Example**: `query: "data science", title: "Lead", companyDomain: "microsoft.com", location: "Seattle"`
  - Use this for finding professionals based on skills, job titles, or industries

- `advanced_search_companies`: Advanced search for companies with detailed filtering options
  - **Example**: `country: "US", industry: "technology", employee_count_min: 1000, founded_after_year: 2010`
  - Much more powerful than basic company search with many filtering options
  - Supports Boolean search expressions (AND, OR, NOT) in name and description fields
  - Can return up to 10,000,000 results per search

## Development

To modify the server or add new features:

1. Edit `server.js` to add or modify API endpoints
2. Run `npm install -g .` to install your changes globally

### Local Test Environment (`test.env`)

For local development and running test scripts (e.g., those in the `tests/` directory) directly, you can use a `test.env` file in the project root to manage your API key and debug settings. This file is typically included in `.gitignore` and should not be committed to the repository.

Create a `test.env` file with the following content:

```bash
PROXYCURL_API_KEY=your_actual_proxycurl_api_key_here
```

Replace `your_actual_proxycurl_api_key_here` with your Proxycurl API key. The test scripts are often configured to load environment variables from this file if it exists.

## License

MIT
