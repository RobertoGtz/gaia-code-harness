#!/bin/bash

# GAIA Code Harness — Promo Banner Demo Presentation
# Run: ./scripts/present-promo.sh

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
  ╔════════════════════════════════════════════╗
  ║     GAIA CODE HARNESS                       ║
  ║     Demo: Promotion Banner (Flutter)        ║
  ╚════════════════════════════════════════════╝
${NC}
Feature: Add promotion banner
Repo:    my-org/my-repo
Ticket:  PROJ-123
Figma:   https://figma.com/file/abc123/promo-banner

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 1] What is Harness Engineering?${NC}

Instead of letting AI run wild, we constrain it:

${GREEN}*${NC} Spec-first — AI must propose a plan before coding.
${GREEN}*${NC} Human approval gate — you sign off the spec.
${GREEN}*${NC} File change limits — no surprise rewrites.
${GREEN}*${NC} Tests required — green tests before PR.
${GREEN}*${NC} Traceability — every PR links to its spec.

Process:
  Requirement -> SpecAuthor -> Human approve -> Implementer -> Reviewer -> PR

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 2] The Agents${NC}

${CYAN}CLI / HTTP mode (TypeScript agents)${NC}
  ${BOLD}SpecAuthor${NC}      reads repo and writes TechnicalSpec + Gherkin
  ${BOLD}Implementer${NC}   writes code in a feature branch
  ${BOLD}Reviewer${NC}      validates scope, tests, creates PR
  ${BOLD}MutationTester${NC} checks test quality with mutations

${MAGENTA}.claude mode (conversational subagents)${NC}
  ${BOLD}craftsman_lead${NC}  orchestrates from chat
  ${BOLD}spec_partner${NC}    writes project-spec.md
  ${BOLD}gherkin_author${NC}  distills features/<name>.feature
  ${BOLD}tdd_craftsman${NC}   implements code (Red-Green-Refactor if TDD)
  ${BOLD}judge${NC}           reviews code quality
  ${BOLD}mutation_tester${NC} measures test robustness

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 3] The Job JSON${NC}

{
  \"platform\": \"flutter\",
  \"title\": \"Add promotion banner\",
  \"jiraTicketId\": \"PROJ-123\",
  \"repo\": \"my-org/my-repo\",
  \"module\": \"home_screen\",
  \"targetBranch\": \"develop\",
  \"description\": \"Display highlighted promotion banner carousel\",
  \"figmaUrl\": \"https://figma.com/file/abc123/promo-banner\",
  \"tddMode\": false,
  \"buildStrategy\": \"resolve\",
  \"requireTests\": true,
  \"maxFilesToTouch\": 6,
  \"acceptanceCriteria\": [
    \"WHEN user opens home screen THEN display promotional banner carousel\",
    \"WHEN there are more than 3 promotions THEN show pagination dots\"
  ]
}

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 4] Mode B — CLI step by step${NC}

${CYAN}Step 1: generate spec (stops for approval)${NC}
  npx ts-node src/cli/run.ts --job /tmp/demo-promo-job.json

What to say:
  \"SpecAuthor is reading the repo and building a plan.
   No code is written yet.\"

${CYAN}Step 2: review spec${NC}
  cat /tmp/gaia-workspace/<JOB_ID>/specs/<JOB_ID>/spec.json | jq .
  cat /tmp/gaia-workspace/<JOB_ID>/specs/<JOB_ID>/scenarios.feature

${CYAN}Step 3: approve and implement${NC}
  npx ts-node src/cli/run.ts --id <JOB_ID> --approve

What to say:
  \"Implementer writes the branch, Reviewer validates and creates the PR.\"

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 5] Mode .claude step by step${NC}

${CYAN}Option A: one-shot via slash command${NC}
  /gaia_code_generator --job /tmp/demo-promo-job.json --approve

${CYAN}Option B: human-in-the-loop (canonical run_gaia.md example)${NC}
  Implement the next pending feature

What to say:
  \"Claude acts as craftsman_lead. It reads AGENTS.md, feature_list.json,
   progress/current.md, runs ./init.sh, and picks the next pending feature.
   spec_partner writes project-spec.md, gherkin_author writes the .feature file,
   then we approve before any code is written.\"

After approval:
  tdd_craftsman -> code
  judge         -> review
  mutation_tester -> quality gate

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 6] CLI vs .claude${NC}

| Aspect          | CLI                          | .claude                         |
| --------------- | ---------------------------- | ------------------------------- |
| How it starts   | npx ts-node src/cli/run.ts   | Chat or /gaia_code_generator                    |
| Orchestrator    | src/cli/run.ts + leader.ts   | craftsman_lead + subagents      |
| Spec approval   | --approve (auto)             | Pause on Gherkin (human)        |
| Speed           | Faster                       | Slower, more conversation       |
| Best for        | Demos, CI/CD, defined tasks  | Ambiguous features, TDD, debug  |
| Same pipeline?  | Yes                          | Yes                             |

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 7] What to show from the generated PR${NC}

Commands:
  cd /tmp/gaia-workspace/<JOB_ID>/repo
  git branch --show-current
  git log --oneline -3
  git show --stat HEAD
  git show HEAD -- packages/features/home_screen/lib/src/...

What to highlight:
  ${GREEN}*${NC} Only expected files changed (carousel widget, promo models, tests, exports).
  ${GREEN}*${NC} No CI/CD, secrets or infrastructure files touched.
  ${GREEN}*${NC} No pubspec_overrides.yaml, build/ or .dart_tool/ committed.

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 8] Closing${NC}

The value is not \"AI writes code.\"
The value is \"AI writes code inside a process we control.\"

  Spec -> Human approval -> Scope limits -> Review -> Mutation testing -> PR

Discussion questions:
  * Which mode fits our workflow best? CLI, HTTP API, Webhook, or .claude?
  * Which repo/feature should we pilot first?
  * Do we need Jira/Slack/GitHub Checks integration?

Full docs:
  docs/guides/demo-speaker-script-promo.md
  docs/guides/claude-mode.md
  API.md

${BOLD}Press Enter to finish${NC}")

# Show slides
for slide in "${slides[@]}"; do
    clear
    echo -e "$slide"
    read -r INPUT
    if [ "$INPUT" = "q" ]; then
        break
    fi
done

clear
echo -e "${BLUE}${BOLD}Done.${NC}"
