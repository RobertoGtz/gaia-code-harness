#!/bin/bash

# Gaia Code Harness - Demo Script
# Demonstrates the full workflow of the harness

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Gaia Code Harness - Demo${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if server is running
echo -e "${YELLOW}[1/6] Checking server status...${NC}"
if curl -s http://localhost:3000/health > /dev/null; then
    echo -e "${GREEN}✓ Server is running${NC}"
else
    echo -e "${RED}✗ Server is not running${NC}"
    echo "Start the server with: npm run dev"
    exit 1
fi

echo ""
echo -e "${YELLOW}[2/6] Creating a new job...${NC}"

JOB_RESPONSE=$(curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "jiraTicketId": "DEMO-123",
    "fullContext": {
      "title": "Add promotional banner to home screen",
      "description": "Display a carousel of promotions on the home screen",
      "acceptanceCriteria": [
        "WHEN user opens home screen THEN display promotional banner carousel",
        "WHEN there are more than 3 promotions THEN show pagination dots",
        "WHEN user taps a banner THEN navigate to promotion details"
      ],
      "platform": "flutter",
      "repo": "demo-repo",
      "targetBranch": "develop"
    }
  }')

JOB_ID=$(echo $JOB_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$JOB_ID" ]; then
    echo -e "${RED}✗ Failed to create job${NC}"
    echo "Response: $JOB_RESPONSE"
    exit 1
fi

echo -e "${GREEN}✓ Job created: $JOB_ID${NC}"

echo ""
echo -e "${YELLOW}[3/6] Waiting for spec generation...${NC}"

# Wait for spec_ready
for i in {1..10}; do
    STATUS=$(curl -s http://localhost:3000/jobs/$JOB_ID | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    echo "  Status: $STATUS"
    
    if [ "$STATUS" = "spec_ready" ]; then
        echo -e "${GREEN}✓ Spec is ready for review${NC}"
        break
    elif [ "$STATUS" = "failed" ]; then
        echo -e "${RED}✗ Job failed${NC}"
        exit 1
    fi
    
    sleep 2
done

# Get and display the spec
echo ""
echo -e "${BLUE}Generated Specification:${NC}"
curl -s http://localhost:3000/jobs/$JOB_ID | grep -o '"spec":{[^}]*}' | head -1

echo ""
echo -e "${YELLOW}[4/6] Approving the spec...${NC}"

APPROVE_RESPONSE=$(curl -s -X POST http://localhost:3000/jobs/$JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}')

if echo "$APPROVE_RESPONSE" | grep -q '"approved"'; then
    echo -e "${GREEN}✓ Spec approved${NC}"
else
    echo -e "${YELLOW}Note: Approval may have auto-proceeded${NC}"
fi

echo ""
echo -e "${YELLOW}[5/6] Monitoring implementation progress...${NC}"

# Monitor progress
for i in {1..20}; do
    STATUS=$(curl -s http://localhost:3000/jobs/$JOB_ID | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    if [ "$STATUS" != "$PREV_STATUS" ]; then
        echo "  Status: $STATUS"
        PREV_STATUS=$STATUS
    fi
    
    if [ "$STATUS" = "done" ]; then
        echo -e "${GREEN}✓ Implementation completed!${NC}"
        break
    elif [ "$STATUS" = "failed" ]; then
        echo -e "${RED}✗ Implementation failed${NC}"
        break
    fi
    
    sleep 2
done

echo ""
echo -e "${YELLOW}[6/6] Final result:${NC}"

FINAL_RESULT=$(curl -s http://localhost:3000/jobs/$JOB_ID)
PR_URL=$(echo $FINAL_RESULT | grep -o '"prUrl":"[^"]*"' | cut -d'"' -f4)

if [ -n "$PR_URL" ] && [ "$PR_URL" != "null" ]; then
    echo -e "${GREEN}✓ PR created: $PR_URL${NC}"
else
    echo "Final status: $(echo $FINAL_RESULT | grep -o '"status":"[^"]*"' | cut -d'"' -f4)"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Demo completed!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Job ID for reference: $JOB_ID"
echo ""
echo "To view job details:"
echo "  curl http://localhost:3000/jobs/$JOB_ID | jq ."
