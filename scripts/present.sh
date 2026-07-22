#!/bin/bash

# Gaia Code Harness - Presentation Script
# Interactive presentation covering all 3 orchestration modes

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

# ── Slides ────────────────────────────────────────────────────────────────────
slides=()

slides+=("${BLUE}${BOLD}
  ╔══════════════════════════════════════════╗
  ║       GAIA CODE HARNESS                 ║
  ║       Controlled AI Code Generation     ║
  ╚══════════════════════════════════════════╝
${NC}
What if AI could generate production-ready code
with the same control and quality we expect
from a senior developer?

It's not magic. It's ${BOLD}Harness Engineering${NC}.

Platforms: Flutter · iOS (Swift) · Android (Kotlin)
Modes    : HTTP API · CLI · Webhook

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 1] The Problem${NC}

Three main pain points:

1. ${RED}AI generates code that doesn't match requirements${NC}
   → Hallucinations, wrong assumptions, missing context

2. ${RED}No visibility into what changed${NC}
   → Magic black box, hard to review, quality concerns

3. ${RED}No integration with existing tools${NC}
   → Manual copy-paste, no Jira/GitHub link, context switching

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 2] The Solution: Harness Engineering${NC}

Instead of letting AI run wild, we ${BOLD}constrain${NC} it:

${GREEN}✓${NC} Spec-first — AI must articulate a plan before coding
${GREEN}✓${NC} Human approval gate — you sign off the spec
${GREEN}✓${NC} File change limits — no surprise rewrites
${GREEN}✓${NC} Tests required — every feature has green tests
${GREEN}✓${NC} Traceability — every PR links back to its spec
${GREEN}✓${NC} Notifications — Jira / Slack / GitHub Checks

Three specialized agents:
  1. ${CYAN}SpecAuthor${NC}  — creates technical spec from requirements
  2. ${CYAN}Implementer${NC} — writes code following the spec
  3. ${CYAN}Reviewer${NC}    — validates tests + creates the GitHub PR

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 3] Spec-Driven Development (SDD)${NC}

The specification is the ${BOLD}contract${NC}:

  ${CYAN}Feature title${NC}       — what to build
  ${CYAN}Acceptance Criteria${NC} — EARS format: WHEN/THEN
  ${CYAN}Tasks${NC}               — file-level implementation plan
  ${CYAN}Risks${NC}               — identified edge cases
  ${CYAN}Affected files${NC}      — scope boundary

Example AC:
  ${GREEN}WHEN${NC} user opens home screen
  ${GREEN}THEN${NC} display promotional banner carousel

  ${GREEN}WHEN${NC} there are more than 3 promotions
  ${GREEN}THEN${NC} show pagination dots

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 4] The Workflow (all modes)${NC}

${GREEN}1. Trigger a job${NC} ← mode-specific (A / B / C)
   ↓
${GREEN}2. SpecAuthor generates TechnicalSpec${NC} (JSON)
   ↓
${GREEN}2b. SpecAuthor generates Gherkin scenarios${NC} (.feature) — non-blocking
   ↓
${CYAN}3. HUMAN REVIEWS and APPROVES spec${NC} ⭐
   ↓
${GREEN}4. Implementer writes code${NC} (Gherkin injected into prompts)
   ↓
${GREEN}5. Reviewer validates + creates GitHub PR${NC}
   ↓
${GREEN}6. MutationTester validates test quality${NC} (≥ 80% kill rate)
   ↓
${CYAN}7. Normal code review by team${NC}

Two human checkpoints: spec approval + PR review.

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 5] Three Orchestration Modes${NC}

${MAGENTA}Mode A — HTTP API${NC}  (production / Gaia Platform)
  POST /jobs   →   full JSON job payload
  Best for: PM tools, internal dashboards, CI integration
  ${CYAN}./scripts/demo.sh flutter a${NC}

${MAGENTA}Mode B — CLI${NC}  (artisan / Claude Code / local)
  npx ts-node src/cli/run.ts --job job.json
  No server, no Postgres — runs entirely on disk
  Best for: developers, code reviews, debugging
  ${CYAN}./scripts/demo.sh ios b${NC}

${MAGENTA}Mode C — Webhook${NC}  (CI/CD, Jira, Slack)
  POST /webhook/trigger  ← Jira issue / Slack slash / generic
  Inbound trigger from any external system
  Best for: automated pipelines, Jira automation
  ${CYAN}./scripts/demo.sh android c${NC}

${MAGENTA}Mode D — Jira-only HTTP${NC}
  POST /jobs with only a jiraTicketId
  System fetches title, description, ACs from Jira
  Best for: product managers who already write tickets in Jira
  ${CYAN}./scripts/demo.sh flutter jira PROJ-123${NC}

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 5b] Mode B — CLI Deep Dive${NC}

No server. No Docker. No Postgres. Just a terminal.

${CYAN}npx ts-node src/cli/run.ts --job demo.json --approve${NC}

What happens internally:

  ${GREEN}1.${NC} SpecAuthor    → TechnicalSpec JSON
  ${GREEN}2.${NC} SpecAuthor    → scenarios.feature  (Gherkin, 2nd LLM call)
  ${CYAN}  ⏸ --approve skips the manual gate${NC}
  ${GREEN}3.${NC} Implementer   → reads Gherkin + writes code
  ${GREEN}4.${NC} Reviewer      → creates GitHub PR
  ${GREEN}5.${NC} MutationTester → validates test quality

State persists to disk (progress/.state/)
Progress log: progress/<JOB_ID>.md
Gherkin file: specs/<JOB_ID>/scenarios.feature

${CYAN}Full script: docs/guides/demo-speaker-script.md${NC}

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 6] Plugin System${NC}

Every target repo can customize agent behavior
by placing files in ${CYAN}docs/${NC}:

  ${CYAN}docs/gaia.json${NC}         — manifest: platform, config, agents
  ${CYAN}docs/RULES.md${NC}          — injected into every agent prompt
  ${CYAN}docs/UNIT_TESTS.md${NC}     — test patterns for the Implementer
  ${CYAN}docs/agents/${NC}           — custom agent overrides per platform

Custom agents for demo repos (already committed):
  ${GREEN}flutter-spec-author.ts${NC}  ios-spec-author.ts  android-spec-author.ts
  ${GREEN}flutter-implementer.ts${NC}  ios-implementer.ts  android-implementer.ts
  ${GREEN}flutter-reviewer.ts${NC}     ios-reviewer.ts     android-reviewer.ts

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 7] Notifications${NC}

Every job event triggers outbound notifications:

  ${CYAN}job.started${NC}   → Jira comment: 'Spec generation started'
  ${CYAN}job.spec_ready${NC} → Jira comment: 'Spec ready for review'
  ${CYAN}job.done${NC}      → Jira transition to DONE + PR link comment
  ${CYAN}job.failed${NC}    → Jira comment: error details

Supported notifiers:
  ${GREEN}✓${NC} Jira REST API  (JIRA_BASE_URL + JIRA_API_TOKEN)
  ${GREEN}✓${NC} Slack          (SLACK_WEBHOOK_URL)
  ${GREEN}✓${NC} GitHub Checks  (GITHUB_TOKEN)
  ${GREEN}✓${NC} Generic HTTP   (NOTIFIER_WEBHOOK_URL)

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 8] Live Demo${NC}

Choose your platform and mode:

  Platform: ${CYAN}flutter${NC} | ${CYAN}ios${NC} | ${CYAN}android${NC}
  Mode:     ${MAGENTA}a${NC} (HTTP) | ${MAGENTA}b${NC} (CLI) | ${MAGENTA}c${NC} (Webhook) | ${MAGENTA}jira${NC} (Jira-only)

Prerequisites for Mode A / C / Jira:
  ${CYAN}npm run dev${NC}    ← starts Fastify + Postgres

Example commands:
  ${CYAN}./scripts/demo.sh flutter a${NC}         # HTTP API, Flutter
  ${CYAN}./scripts/demo.sh ios b${NC}             # CLI, no server needed
  ${CYAN}./scripts/demo.sh android c${NC}       # Webhook trigger, Android
  ${CYAN}./scripts/demo.sh flutter jira PROJ-123${NC}  # Jira-only HTTP, fetch from Jira

Press Enter to choose and run the demo (or 'q' to skip)...")

# ── Show slides ───────────────────────────────────────────────────────────────
for slide in "${slides[@]}"; do
    clear
    echo -e "$slide"
    read -r INPUT
    if [ "$INPUT" = "q" ]; then
        break
    fi
done

# ── Interactive demo launcher ─────────────────────────────────────────────────
clear
echo -e "${BLUE}${BOLD}════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}  Run Live Demo${NC}"
echo -e "${BLUE}${BOLD}════════════════════════════════════════════${NC}"
echo ""
echo -e "Platform: ${CYAN}flutter${NC} | ${CYAN}ios${NC} | ${CYAN}android${NC}"
echo -e "Mode:     ${MAGENTA}a${NC} (HTTP API) | ${MAGENTA}b${NC} (CLI) | ${MAGENTA}c${NC} (Webhook) | ${MAGENTA}jira${NC} (Jira-only HTTP)"
echo ""
echo -ne "${YELLOW}Platform [flutter]: ${NC}"
read -r DEMO_PLATFORM
DEMO_PLATFORM="${DEMO_PLATFORM:-flutter}"

echo -ne "${YELLOW}Mode [a]: ${NC}"
read -r DEMO_MODE
DEMO_MODE="${DEMO_MODE:-a}"

if [ "$DEMO_MODE" = "jira" ]; then
  echo -ne "${YELLOW}Jira ticket key [PROJ-123]: ${NC}"
  read -r JIRA_KEY
  JIRA_KEY="${JIRA_KEY:-PROJ-123}"
  echo ""
  echo -e "${YELLOW}Would you like to run: ${CYAN}./scripts/demo.sh $DEMO_PLATFORM jira $JIRA_KEY${NC} ? (y/n)"
  read -r CONFIRM
  if [ "$CONFIRM" = "y" ]; then
      echo ""
      ./scripts/demo.sh "$DEMO_PLATFORM" jira "$JIRA_KEY"
  else
      echo -e "${YELLOW}Skipped.${NC}"
  fi
else
  echo ""
  echo -e "${YELLOW}Would you like to run: ${CYAN}./scripts/demo.sh $DEMO_PLATFORM $DEMO_MODE${NC} ? (y/n)"
  read -r CONFIRM
  if [ "$CONFIRM" = "y" ]; then
      echo ""
      ./scripts/demo.sh "$DEMO_PLATFORM" "$DEMO_MODE"
  else
      echo -e "${YELLOW}Skipped.${NC}"
  fi
fi

# ── Closing ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}${BOLD}════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}  Thank you!${NC}"
echo -e "${BLUE}${BOLD}════════════════════════════════════════════${NC}"
echo ""
echo "Discussion questions:"
echo "  → Which mode fits our team's workflow best?"
echo "  → Which repo should we pilot first?"
echo "  → Do we need any additional notifiers or platform skills?"
echo ""
echo "Full docs:"
echo "  README.md · docs/engineering/architecture.md · docs/guides/demo.md · API.md"
echo "  docs/guides/demo-speaker-script.md  ← step-by-step script for Mode B"
