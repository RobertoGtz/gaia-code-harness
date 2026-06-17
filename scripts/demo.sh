#!/bin/bash

# Gaia Code Harness - Multi-Platform, Multi-Mode Demo Script
#
# Three orchestration modes:
#   A — HTTP API    POST /jobs           (production/demo default)
#   B — CLI         npx ts-node run.ts   (artisan / Claude Code mode)
#   C — Webhook     POST /webhook/trigger (CI/CD / Jira / Slack trigger)
#
# Usage:
#   ./scripts/demo.sh                        # Mode A, Flutter
#   ./scripts/demo.sh [flutter|ios|android]  # Mode A, chosen platform
#   ./scripts/demo.sh flutter a              # Mode A explicit
#   ./scripts/demo.sh ios     b              # Mode B — CLI
#   ./scripts/demo.sh android c              # Mode C — Webhook

set -e

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# ── Args ──────────────────────────────────────────────────────────────────────
PLATFORM="${1:-flutter}"
MODE="${2:-a}"
MODE=$(echo "$MODE" | tr '[:upper:]' '[:lower:]')

# ── Platform config ───────────────────────────────────────────────────────────
case "$PLATFORM" in
  flutter)
    REPO="RobertoGtz/demo-repo"
    TICKET="DEMO-FLUTTER-001"
    PLATFORM_LABEL="Flutter/Dart"
    ;;
  ios)
    REPO="RobertoGtz/demo-repo-ios"
    TICKET="DEMO-IOS-001"
    PLATFORM_LABEL="iOS/Swift"
    ;;
  android)
    REPO="RobertoGtz/demo-repo-android"
    TICKET="DEMO-ANDROID-001"
    PLATFORM_LABEL="Android/Kotlin"
    ;;
  *)
    echo -e "${RED}Unknown platform: $PLATFORM${NC}"
    echo "Usage: $0 [flutter|ios|android] [a|b|c]"
    exit 1
    ;;
esac

# ── Shared job payload ────────────────────────────────────────────────────────
JOB_TITLE="Add promotional banner to home screen"
JOB_PAYLOAD=$(cat <<EOF
{
  "title": "$JOB_TITLE",
  "platform": "$PLATFORM",
  "repo": "$REPO",
  "targetBranch": "develop",
  "jiraTicketId": "$TICKET",
  "requireTests": true,
  "maxFilesToTouch": 6,
  "acceptanceCriteria": [
    { "id": "ac-1", "text": "WHEN user opens home screen THEN display promotional banner carousel", "testable": true },
    { "id": "ac-2", "text": "WHEN there are more than 3 promotions THEN show pagination dots",     "testable": true },
    { "id": "ac-3", "text": "WHEN user taps a banner THEN navigate to promotion details",          "testable": true }
  ]
}
EOF
)

# ── Mode labels ───────────────────────────────────────────────────────────────
case "$MODE" in
  a) MODE_LABEL="Mode A — HTTP API (POST /jobs)" ;;
  b) MODE_LABEL="Mode B — CLI (npx ts-node)" ;;
  c) MODE_LABEL="Mode C — Webhook (POST /webhook/trigger)" ;;
  *)
    echo -e "${RED}Unknown mode: $MODE${NC}"
    echo "Usage: $0 [flutter|ios|android] [a|b|c]"
    exit 1
    ;;
esac

# ── Header ────────────────────────────────────────────────────────────────────
echo -e "${BLUE}${BOLD}════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}  Gaia Code Harness — Demo${NC}"
echo -e "${CYAN}  Platform : $PLATFORM_LABEL${NC}"
echo -e "${MAGENTA}  $MODE_LABEL${NC}"
echo -e "${BLUE}${BOLD}════════════════════════════════════════════${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# Shared helpers
# ═══════════════════════════════════════════════════════════════════════════════

wait_for_status() {
  local JOB_ID=$1
  local TARGET_STATUS=$2
  local MAX_RETRIES=${3:-15}
  local PREV_STATUS=""

  for i in $(seq 1 $MAX_RETRIES); do
    STATUS=$(curl -s http://localhost:3000/jobs/$JOB_ID \
      | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ "$STATUS" != "$PREV_STATUS" ]; then
      echo "  → $STATUS"
      PREV_STATUS=$STATUS
    fi

    if [ "$STATUS" = "$TARGET_STATUS" ]; then
      return 0
    elif [[ "$STATUS" == *"error"* ]] || [ "$STATUS" = "failed" ]; then
      echo -e "${RED}✗ Job entered error state: $STATUS${NC}"
      return 1
    fi
    sleep 3
  done

  echo -e "${YELLOW}⚠ Timed out waiting for status: $TARGET_STATUS (current: $STATUS)${NC}"
  return 1
}

show_spec_summary() {
  local JOB_ID=$1
  curl -s http://localhost:3000/jobs/$JOB_ID \
    | python3 -c "
import sys, json
d = json.load(sys.stdin).get('job', {})
s = d.get('spec', {})
tasks = len(s.get('tasks', []))
risks = len(s.get('risks', []))
files = len(s.get('design', {}).get('affectedFiles', []))
print(f'  Tasks: {tasks}  |  Risks: {risks}  |  Affected files: {files}')
" 2>/dev/null || echo "  (spec details available via GET /jobs/$JOB_ID)"
}

approve_and_monitor() {
  local JOB_ID=$1

  echo ""
  echo -e "${YELLOW}[4] Approving the spec...${NC}"
  APPROVE=$(curl -s -X POST http://localhost:3000/jobs/$JOB_ID/approve \
    -H "Content-Type: application/json" \
    -d '{"approved": true}')
  echo -e "${GREEN}✓ Spec approved${NC}"

  echo ""
  echo -e "${YELLOW}[5] Monitoring implementation...${NC}"
  wait_for_status "$JOB_ID" "done" 30 || true

  echo ""
  echo -e "${YELLOW}[6] Final result:${NC}"
  FINAL=$(curl -s http://localhost:3000/jobs/$JOB_ID)
  PR_URL=$(echo "$FINAL" | grep -o '"prUrl":"[^"]*"' | cut -d'"' -f4)
  FINAL_STATUS=$(echo "$FINAL" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [ -n "$PR_URL" ] && [ "$PR_URL" != "null" ]; then
    echo -e "${GREEN}✓ PR created: $PR_URL${NC}"
  else
    echo "  Status: $FINAL_STATUS"
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# MODE A — HTTP API  (POST /jobs)
# ═══════════════════════════════════════════════════════════════════════════════
run_mode_a() {
  echo -e "${YELLOW}[1] Checking server...${NC}"
  if ! curl -s http://localhost:3000/health > /dev/null; then
    echo -e "${RED}✗ Server not running. Start with: npm run dev${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ Server is up${NC}"

  echo ""
  echo -e "${YELLOW}[2] Creating job via POST /jobs...${NC}"
  JOB_RESPONSE=$(curl -s -X POST http://localhost:3000/jobs \
    -H "Content-Type: application/json" \
    -d "$JOB_PAYLOAD")

  JOB_ID=$(echo "$JOB_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -z "$JOB_ID" ]; then
    echo -e "${RED}✗ Failed to create job${NC}"
    echo "$JOB_RESPONSE"
    exit 1
  fi
  echo -e "${GREEN}✓ Job created: $JOB_ID${NC}"

  echo ""
  echo -e "${YELLOW}[3] Waiting for spec generation...${NC}"
  wait_for_status "$JOB_ID" "spec_ready" 15
  echo -e "${GREEN}✓ Spec ready${NC}"
  show_spec_summary "$JOB_ID"

  approve_and_monitor "$JOB_ID"
}

# ═══════════════════════════════════════════════════════════════════════════════
# MODE B — CLI  (npx ts-node src/cli/run.ts)
# ═══════════════════════════════════════════════════════════════════════════════
run_mode_b() {
  echo -e "${YELLOW}[1] Checking environment...${NC}"
  if ! command -v npx &> /dev/null; then
    echo -e "${RED}✗ npx not found. Install Node.js first.${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ npx available${NC}"

  # Write job JSON to a temp file
  TMP_JOB=$(mktemp /tmp/gaia-job-XXXX.json)
  echo "$JOB_PAYLOAD" > "$TMP_JOB"
  echo -e "${CYAN}  Job file: $TMP_JOB${NC}"

  echo ""
  echo -e "${YELLOW}[2] Launching CLI job...${NC}"
  echo -e "${CYAN}  npx ts-node src/cli/run.ts --job $TMP_JOB${NC}"
  echo ""

  # Run CLI — it blocks until done (disk backend, no HTTP server needed)
  npx ts-node src/cli/run.ts --job "$TMP_JOB"

  echo ""
  echo -e "${YELLOW}[3] Listing completed jobs:${NC}"
  npx ts-node src/cli/run.ts --list 2>/dev/null | tail -10 || true

  rm -f "$TMP_JOB"
}

# ═══════════════════════════════════════════════════════════════════════════════
# MODE C — Webhook  (POST /webhook/trigger)
# ═══════════════════════════════════════════════════════════════════════════════
run_mode_c() {
  echo -e "${YELLOW}[1] Checking server...${NC}"
  if ! curl -s http://localhost:3000/health > /dev/null; then
    echo -e "${RED}✗ Server not running. Start with: npm run dev${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ Server is up${NC}"

  echo ""
  echo -e "${YELLOW}[2] Sending webhook payload (generic format)...${NC}"

  WEBHOOK_PAYLOAD=$(cat <<EOF
{
  "title": "$JOB_TITLE",
  "platform": "$PLATFORM",
  "repo": "$REPO",
  "targetBranch": "develop",
  "jiraTicketId": "$TICKET",
  "tddMode": false,
  "acceptanceCriteria": [
    { "id": "ac-1", "text": "WHEN user opens home screen THEN display promotional banner carousel" },
    { "id": "ac-2", "text": "WHEN there are more than 3 promotions THEN show pagination dots" },
    { "id": "ac-3", "text": "WHEN user taps a banner THEN navigate to promotion details" }
  ]
}
EOF
)

  WEBHOOK_RESPONSE=$(curl -s -X POST http://localhost:3000/webhook/trigger \
    -H "Content-Type: application/json" \
    -d "$WEBHOOK_PAYLOAD")

  JOB_ID=$(echo "$WEBHOOK_RESPONSE" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
  ACCEPTED=$(echo "$WEBHOOK_RESPONSE" | grep -o '"status":"accepted"')

  if [ -z "$JOB_ID" ] || [ -z "$ACCEPTED" ]; then
    echo -e "${RED}✗ Webhook rejected${NC}"
    echo "$WEBHOOK_RESPONSE"
    exit 1
  fi
  echo -e "${GREEN}✓ Webhook accepted — Job: $JOB_ID${NC}"

  echo ""
  echo -e "${CYAN}  Simulated trigger: Jira issue created → webhook → POST /webhook/trigger${NC}"
  echo -e "${CYAN}  The harness parsed the payload and created a job asynchronously.${NC}"

  echo ""
  echo -e "${YELLOW}[3] Waiting for spec generation...${NC}"
  wait_for_status "$JOB_ID" "spec_ready" 15
  echo -e "${GREEN}✓ Spec ready${NC}"
  show_spec_summary "$JOB_ID"

  approve_and_monitor "$JOB_ID"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Run selected mode
# ═══════════════════════════════════════════════════════════════════════════════
JOB_ID_FILE=$(mktemp /tmp/gaia-jobid-XXXX)

case "$MODE" in
  a) run_mode_a; echo "$JOB_ID" > "$JOB_ID_FILE" ;;
  b) run_mode_b; exit 0 ;;
  c) run_mode_c; echo "$JOB_ID" > "$JOB_ID_FILE" ;;
esac

JOB_ID=$(cat "$JOB_ID_FILE" 2>/dev/null | tail -1)
rm -f "$JOB_ID_FILE"

# ── Footer ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}${BOLD}════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}  Demo completed!${NC}"
echo -e "${CYAN}  Platform : $PLATFORM_LABEL${NC}"
echo -e "${MAGENTA}  $MODE_LABEL${NC}"
echo -e "${BLUE}${BOLD}════════════════════════════════════════════${NC}"
echo ""
echo "Job ID : $JOB_ID"
echo ""
echo "Inspect:"
echo "  curl http://localhost:3000/jobs/$JOB_ID | jq ."
echo ""
echo "Try other modes:"
echo "  ./scripts/demo.sh $PLATFORM a   # HTTP API"
echo "  ./scripts/demo.sh $PLATFORM b   # CLI (no server needed)"
echo "  ./scripts/demo.sh $PLATFORM c   # Webhook"
echo ""
echo "Try other platforms:"
echo "  ./scripts/demo.sh flutter $MODE"
echo "  ./scripts/demo.sh ios     $MODE"
echo "  ./scripts/demo.sh android $MODE"
