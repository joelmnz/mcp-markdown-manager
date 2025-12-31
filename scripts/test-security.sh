#!/bin/bash
# Test script for rate limiting and request size validation

# Load environment variables from .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Configuration
PORT="${PORT:-5000}"
BASE_URL="http://localhost:$PORT"

if [ -z "$AUTH_TOKEN" ]; then
  echo "ERROR: AUTH_TOKEN not found in .env file or environment"
  exit 1
fi

echo "======================================"
echo "Security Middleware Testing"
echo "======================================"
echo "Server: $BASE_URL"
echo ""

# Check if server is running
echo "Checking server connectivity..."
if ! curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" | grep -q "200\|503"; then
  echo "ERROR: Cannot connect to server at $BASE_URL"
  echo "Please make sure the server is running first."
  exit 1
fi
echo "✓ Server is reachable"
echo ""

# Test 1: Request Size Validation (run FIRST before rate limits are hit)
echo "Test 1: Request Size Validation (should get 413 for >10MB payload)"
echo "--------------------------------------"

# Create a temporary file with large content (11MB)
TEMP_FILE=$(mktemp)
dd if=/dev/zero of="$TEMP_FILE" bs=1M count=11 2>/dev/null

# Test by sending the file with Content-Length header
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "@$TEMP_FILE" \
  "$BASE_URL/api/articles")

# Clean up temp file
rm -f "$TEMP_FILE"

if [ "$STATUS" == "413" ]; then
  echo "  ✓ Request size validation works! (413 Payload Too Large)"
else
  echo "  ✗ Request size validation failed - got status $STATUS instead of 413"
  echo "  Note: Make sure the server is running and AUTH_TOKEN is correct"
fi
echo ""

# Test 2: Expensive Operation Rate Limiting (5 req/min - run before exhausting general rate limit)
echo "Test 2: Expensive Operation Rate Limiting (/api/rag/reindex - should get 429 after 5 requests)"
echo "--------------------------------------"
SUCCESS_COUNT=0
RATE_LIMITED=0

for i in {1..8}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    "$BASE_URL/api/rag/reindex")

  if [ "$STATUS" == "200" ] || [ "$STATUS" == "400" ]; then
    # 400 is ok if semantic search is not enabled
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  elif [ "$STATUS" == "429" ]; then
    RATE_LIMITED=$((RATE_LIMITED + 1))
    echo "  Request #$i: Rate limited (429) ✓"
    break
  fi
done

echo "  Successful requests: $SUCCESS_COUNT"
echo "  Rate limited at request: $((SUCCESS_COUNT + 1))"
if [ $RATE_LIMITED -gt 0 ]; then
  echo "  ✓ Expensive operation rate limiting works!"
else
  echo "  ✗ Expensive operation rate limiting failed - no 429 response"
fi
echo ""

# Test 3: API Rate Limiting (60 req/min)
echo "Test 3: API Rate Limiting (should get 429 after 60 requests)"
echo "--------------------------------------"
SUCCESS_COUNT=0
RATE_LIMITED=0

for i in {1..65}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    "$BASE_URL/api/articles")

  if [ "$STATUS" == "200" ]; then
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  elif [ "$STATUS" == "429" ]; then
    RATE_LIMITED=$((RATE_LIMITED + 1))
    echo "  Request #$i: Rate limited (429) ✓"
    break
  fi
done

echo "  Successful requests: $SUCCESS_COUNT"
echo "  Rate limited at request: $((SUCCESS_COUNT + 1))"
if [ $RATE_LIMITED -gt 0 ]; then
  echo "  ✓ API rate limiting works!"
else
  echo "  ✗ API rate limiting failed - no 429 response"
fi
echo ""

echo "Waiting 60 seconds for rate limit window to reset..."
sleep 60
echo ""

# Test 4: Public Endpoint Rate Limiting (30 req/min)
echo "Test 4: Public Endpoint Rate Limiting (/health - should get 429 after 30 requests)"
echo "--------------------------------------"
SUCCESS_COUNT=0
RATE_LIMITED=0

for i in {1..35}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")

  if [ "$STATUS" == "200" ]; then
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  elif [ "$STATUS" == "429" ]; then
    RATE_LIMITED=$((RATE_LIMITED + 1))
    echo "  Request #$i: Rate limited (429) ✓"
    break
  fi
done

echo "  Successful requests: $SUCCESS_COUNT"
echo "  Rate limited at request: $((SUCCESS_COUNT + 1))"
if [ $RATE_LIMITED -gt 0 ]; then
  echo "  ✓ Public endpoint rate limiting works!"
else
  echo "  ✗ Public endpoint rate limiting failed - no 429 response"
fi
echo ""

echo "======================================"
echo "Testing Complete"
echo "======================================"
