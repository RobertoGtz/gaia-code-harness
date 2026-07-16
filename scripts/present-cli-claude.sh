#!/bin/bash

# GAIA Code Harness — DemoAnalyticsRepository CLI + .claude Demo Presentation
# Run: ./scripts/present-cli-claude.sh

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

slides=()

slides+=("${BLUE}${BOLD}
  ╔══════════════════════════════════════════════════════════╗
  ║     GAIA CODE HARNESS                                    ║
  ║     Demo: DemoAnalyticsRepository (bre_b core)           ║
  ║     CLI + .claude modes                                  ║
  ╚══════════════════════════════════════════════════════════╝
${NC}
Repo:   rpp-co/rpp-cashflow-multiplatform-pyme
Module: bre_b
Goal:   same job, two ways to run it

Tip: Press ${YELLOW}q${NC} at any slide to skip to the live demo launcher.

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 1] What we will see today${NC}

1. Start with a real-ish Flutter Web repo and a small feature request.
2. Show how GAIA turns that request into a TechnicalSpec + Gherkin scenarios.
3. Pause at the human approval gate.
4. Let the Implementer write code and the Reviewer open a Pull Request.
5. Run the same flow two ways:
   ${CYAN}CLI${NC}     -> one terminal command
   ${MAGENTA}.claude${NC} -> conversational approval inside Claude Code

Why this matters:
  ${GREEN}*${NC} The pipeline is always the same.
  ${GREEN}*${NC} The interface changes how much control the human keeps.

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 2] The demo job${NC}

Input file: ${CYAN}/tmp/demo-cashflow-job.json${NC}

{
  \"initiativeId\": \"demo\",
  \"title\": \"Demo: add DemoAnalytics feature\",
  \"platform\": \"flutter_web\",
  \"repo\": \"rpp-co/rpp-cashflow-multiplatform-pyme\",
  \"targetBranch\": \"master\",
  \"module\": \"bre_b\",
  \"description\": \"Add DemoAnalyticsEvent model and DemoAnalyticsRepository\",
  \"acceptanceCriteria\": [
    \"WHEN DemoAnalyticsEvent is constructed THEN it has name, timestamp and payload fields\",
    \"WHEN DemoAnalyticsRepository.logEvent is called THEN it stores the event in an internal list\",
    \"WHEN both are exported from bre_b_core.dart THEN they are reachable from the core library\"
  ],
  \"maxFilesToTouch\": 4,
  \"requireTests\": false,
  \"tddMode\": false
}

What each field does:
  ${CYAN}platform${NC}        -> load flutter_web skill
  ${CYAN}module${NC}          -> restrict context to bre_b
  ${CYAN}maxFilesToTouch${NC}  -> safety guard on scope
  ${CYAN}requireTests${NC}     -> false only to keep the demo fast

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 3] Harness Engineering in one picture${NC}

Requirement
     │
     ▼
┌─────────────┐
│  SpecAuthor │  reads repo, writes TechnicalSpec + .feature
└─────────────┘
     │
     ▼
┌─────────────┐
│   Human     │  approves/rejects the spec
└─────────────┘
     │
     ▼
┌─────────────┐
│  Implementer│  writes code in a feature branch
└─────────────┘
     │
     ▼
┌─────────────┐
│   Reviewer  │  validates scope, opens PR
└─────────────┘
     │
     ▼
┌─────────────┐
│ MutationTester│ measures test quality
└─────────────┘

Key rules:
  ${GREEN}*${NC} No code before spec.
  ${GREEN}*${NC} No repo changes before human approval.
  ${GREEN}*${NC} No direct push to master; always a feature branch.

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 4] The agents${NC}

${CYAN}CLI / HTTP pipeline (TypeScript agents)${NC}
  ${BOLD}SpecAuthorAgent${NC}
    - explores the repo
    - derives technical requirements from ACs
    - outputs spec.json + scenarios.feature

  ${BOLD}ImplementerAgent${NC}
    - reads the spec
    - creates/modifies only authorized files
    - runs tests when requireTests is true

  ${BOLD}ReviewerAgent${NC}
    - file-count guard
    - static checks
    - creates the GitHub PR

  ${BOLD}MutationTesterAgent${NC}
    - mutates code (true->false, +->-, etc.)
    - fails if tests do not catch the change

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 5] The agents in .claude mode${NC}

${MAGENTA}.claude pipeline (conversational subagents)${NC}
  ${BOLD}craftsman_lead${NC}
    - conductor; reads AGENTS.md, feature_list.json, progress/current.md
    - runs ./init.sh and picks the next pending feature

  ${BOLD}spec_partner${NC}
    - talks to the human to clarify the feature
    - writes project-spec.md

  ${BOLD}gherkin_author${NC}
    - turns ACs into features/<name>.feature

  ${BOLD}tdd_craftsman${NC}
    - implements the code; Red-Green-Refactor if tddMode=true

  ${BOLD}judge${NC}
    - reviews code quality

  ${BOLD}mutation_tester${NC}
    - runs mutation testing and reports score

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 6] Mode A: CLI step by step${NC}

${CYAN}Step 1 - generate the spec (it stops at spec_ready)${NC}
  cd ~/Desktop/gaia-code-harness
  npm run gaia -- /tmp/demo-cashflow-job.json

What to say while it runs:
  \"SpecAuthor is reading the repo and building a plan. No code is written yet.\"

${CYAN}Step 2 - inspect the spec${NC}
  JOB_ID=<id>
  cat /tmp/gaia-workspace/$JOB_ID/specs/$JOB_ID/spec.json | jq '.requirements, .design'
  cat /tmp/gaia-workspace/$JOB_ID/specs/$JOB_ID/scenarios.feature

${CYAN}Step 3 - approve and run the rest${NC}
  npm run gaia -- --id $JOB_ID --approve

Key phrase:
  \"CLI is speed and reproducibility: same pipeline, one command.\"

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 7] Mode B: .claude step by step${NC}

${MAGENTA}Option 1 - one shot${NC}
  /review_gaia_code_generator --job /tmp/demo-cashflow-job.json --approve

${MAGENTA}Option 2 - human-in-the-loop${NC}
  Implementa la siguiente feature pendiente

What happens in Option 2:
  1. craftsman_lead reads AGENTS.md + feature_list.json + progress/current.md
  2. spec_partner writes project-spec.md
  3. gherkin_author writes features/<name>.feature
  4. ${YELLOW}Human reads the .feature and approves${NC}
  5. tdd_craftsman writes code
  6. judge reviews quality
  7. mutation_tester validates robustness

Key phrase:
  \".claude is transparency: AI proposes, human approves each scenario.\"

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 8] CLI vs .claude side by side${NC}

| Aspect            | CLI                           | .claude                         |
| ----------------- | ----------------------------- | ------------------------------- |
| How you start     | npm run gaia -- <job.json>    | /review_gaia_code_generator or chat message            |
| Orchestrator      | src/cli/run.ts + leader.ts    | craftsman_lead + subagents      |
| Spec approval     | --approve flag (auto)          | Pause on Gherkin (human)        |
| Best for          | demos, fast iterations, CI    | ambiguous features, TDD, teaching |
| Conversation      | None                          | Full, turn-by-turn                |
| Same agents?      | Yes                           | Yes                               |
| Same output?      | PR + spec + progress log      | PR + spec + progress log        |

Visual to show:
  Claude Code -> /review_gaia_code_generator --job job.json --approve
                     │
                     ▼
         src/cli/run.ts -> leader.ts -> Implementer -> Reviewer -> PR

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 9] What to show from the generated PR${NC}

${CYAN}In the workspace:${NC}
  cd /tmp/gaia-workspace/<JOB_ID>/repo
  git branch --show-current
  git log --oneline -3
  git show --stat HEAD

${CYAN}Files you should see:${NC}
  ${GREEN}*${NC} demo_analytics_event.dart      (model with typed fields)
  ${GREEN}*${NC} demo_analytics_repository.dart (repository with logEvent)
  ${GREEN}*${NC} bre_b_core.dart               (exports both)

${CYAN}Files you should NOT see:${NC}
  ${GREEN}*${NC} pubspec_overrides.yaml
  ${GREEN}*${NC} build/ or .dart_tool/
  ${GREEN}*${NC} CI/CD or secrets changes

${CYAN}In the browser:${NC}
  open <PR_URL>
  - title and description
  - files changed inside packages/features/bre_b/
  - link to progress/<JOB_ID>.md

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 10] Closing${NC}

The value is not \"AI writes code.\"
The value is \"AI writes code inside a process we control.\"

Pipeline recap:
  Spec -> Human approval -> Scope limits -> Code -> Review -> PR -> Mutation testing

Discussion questions:
  ${GREEN}*${NC} Which mode fits our team better: CLI or .claude?
  ${GREEN}*${NC} Which repo/feature should we pilot first?
  ${GREEN}*${NC} Do we need Jira/Slack/GitHub Checks integration?

Resources:
  docs/guides/demo-speaker-script.md
  scripts/present-cli-claude.sh
  docs/guides/claude-mode.md
  API.md

${BOLD}Press Enter to finish${NC}")

for slide in "${slides[@]}"; do
    clear
    echo -e "$slide"
    read -r INPUT
    if [ "$INPUT" = "q" ]; then
        break
    fi
done

# ── Optional live demo launcher ───────────────────────────────────────────────

if [ ! -f /tmp/demo-cashflow-job.json ]; then
  cat > /tmp/demo-cashflow-job.json <<'JSON'
{
  "initiativeId": "demo",
  "title": "Demo: add DemoAnalytics feature with event model and repository to bre_b core",
  "platform": "flutter_web",
  "repo": "rpp-co/rpp-cashflow-multiplatform-pyme",
  "targetBranch": "master",
  "module": "bre_b",
  "description": "Presentation-only demo change: add a DemoAnalyticsEvent model, a DemoAnalyticsRepository class with a logEvent method, and export both from bre_b_core.dart. No business logic changes and no unit tests are required for this demo-only feature.",
  "acceptanceCriteria": [
    "WHEN DemoAnalyticsEvent is constructed THEN it has name, timestamp and payload fields",
    "WHEN DemoAnalyticsRepository.logEvent is called THEN it stores the event in an internal list",
    "WHEN DemoAnalyticsEvent and DemoAnalyticsRepository are exported from bre_b_core.dart THEN they are reachable from the core library"
  ],
  "maxFilesToTouch": 4,
  "requireTests": false,
  "tddMode": false
}
JSON
  echo -e "${CYAN}Created /tmp/demo-cashflow-job.json${NC}"
fi

clear
echo -e "${BLUE}${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}  Run the live demo?${NC}"
echo -e "${BLUE}${BOLD}═══════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}1.${NC} Run CLI demo in one step (${BOLD}--approve${NC})"
echo -e "${YELLOW}2.${NC} Run CLI demo step by step (stop at spec, then approve)"
echo -e "${YELLOW}3.${NC} Show .claude instructions only"
echo -e "${YELLOW}4.${NC} Skip"
echo ""
echo -ne "${YELLOW}Choice [1]: ${NC}"
read -r CHOICE
CHOICE="${CHOICE:-1}"

case "$CHOICE" in
  1)
    echo ""
    echo -e "${CYAN}Running: npm run gaia -- /tmp/demo-cashflow-job.json --approve${NC}"
    npm run gaia -- /tmp/demo-cashflow-job.json --approve
    ;;
  2)
    echo ""
    echo -e "${CYAN}Running: npm run gaia -- /tmp/demo-cashflow-job.json${NC}"
    echo -e "${YELLOW}(it will stop at spec_ready)${NC}"
    npm run gaia -- /tmp/demo-cashflow-job.json
    JOB_ID=$(ls -t progress/*.md 2>/dev/null | head -1 | sed 's|.*/||;s|\.md||')
    if [ -z "$JOB_ID" ]; then
      echo -ne "${YELLOW}Paste JOB_ID: ${NC}"
      read -r JOB_ID
    fi
    echo ""
    echo -e "${CYAN}Latest job ID detected: $JOB_ID${NC}"
    echo -ne "${YELLOW}Approve and continue? (y/n): ${NC}"
    read -r CONFIRM
    if [ "$CONFIRM" = "y" ]; then
      npm run gaia -- --id "$JOB_ID" --approve
    else
      echo -e "${YELLOW}Skipped.${NC} Resume later with:"
      echo -e "  npm run gaia -- --id $JOB_ID --approve"
    fi
    ;;
  3)
    echo ""
    echo -e "${MAGENTA}.claude mode instructions:${NC}"
    echo -e "  /review_gaia_code_generator --job /tmp/demo-cashflow-job.json --approve"
    echo -e "  or (human-in-the-loop):"
    echo -e "  Implementa la siguiente feature pendiente"
    ;;
  4|*)
    echo -e "${YELLOW}Skipped.${NC}"
    ;;
esac

echo ""
echo -e "${BLUE}${BOLD}Done.${NC}"
