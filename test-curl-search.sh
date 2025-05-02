#!/bin/bash

# Get API key from user input or environment variable
if [ -z "$1" ]; then
  if [ -z "$PROXYCURL_API_KEY" ]; then
    echo "Please provide your Proxycurl API key as the first argument or set the PROXYCURL_API_KEY environment variable"
    exit 1
  else
    API_KEY="$PROXYCURL_API_KEY"
  fi
else
  API_KEY="$1"
fi

echo "Using API Key: ${API_KEY:0:4}..."
echo "===================================================="

# Test 1: Basic search with 'headline' parameter (as we discovered)
echo "Test 1: Basic search with headline parameter"
curl -s -X GET "https://nubela.co/proxycurl/api/v2/search/person?headline=software%20engineer&region=California&page_size=3" \
  -H "Authorization: Bearer $API_KEY" | jq
echo "===================================================="

# Test 2: Original complex query 
echo "Test 2: Complex query with headline parameter"
curl -s -X GET "https://nubela.co/proxycurl/api/v2/search/person?headline=General%20Manager%20OR%20Plant%20Manager%20OR%20Operations%20Director%20aerospace&region=California&page_size=3" \
  -H "Authorization: Bearer $API_KEY" | jq
echo "===================================================="

# Test 3: Try with 'q' parameter instead of 'headline'
echo "Test 3: Basic search with q parameter"
curl -s -X GET "https://nubela.co/proxycurl/api/v2/search/person?q=software%20engineer&region=California&page_size=3" \
  -H "Authorization: Bearer $API_KEY" | jq
echo "===================================================="

# Test 4: Use explicit search term
echo "Test 4: Search using search_term parameter"
curl -s -X GET "https://nubela.co/proxycurl/api/v2/search/person?search_term=software%20engineer&region=California&page_size=3" \
  -H "Authorization: Bearer $API_KEY" | jq
echo "===================================================="

# Test 5: Simplify the region parameter
echo "Test 5: Search with simplified region (California instead of Southern California)"
curl -s -X GET "https://nubela.co/proxycurl/api/v2/search/person?headline=General%20Manager%20OR%20Plant%20Manager&region=California&page_size=3" \
  -H "Authorization: Bearer $API_KEY" | jq
echo "===================================================="
