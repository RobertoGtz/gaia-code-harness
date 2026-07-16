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
Repo: rpp-co/rpp-cashflow-multiplatform-pyme
Module: bre_b

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 1] The Job${NC}

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

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 2] Harness Engineering${NC}

Spec-first -> Human approval -> Code -> Review -> PR

${GREEN}*${NC} SpecAuthor creates the plan
${GREEN}*${NC} Human approves before code is written
${GREEN}*${NC} Implementer writes only authorized files
${GREEN}*${NC} Reviewer validates and opens the PR

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 3] The Agents${NC}

${CYAN}CLI mode (TypeScript)${NC}
  SpecAuthor      -> TechnicalSpec + Gherkin
  Implementer     -> code in feature branch
  Reviewer        -> validate + PR
  MutationTester  -> test quality

${MAGENTA}.claude mode (conversational)${NC}
  craftsman_lead  -> orchestrates
  spec_partner    -> project-spec.md
  gherkin_author  -> features/<name>.feature
  tdd_craftsman   -> implements
  judge           -> reviews
  mutation_tester -> measures robustness

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 4] CLI mode${NC}

Generate spec (stops for approval):
  npx ts-node src/cli/run.ts --job /tmp/demo-cashflow-job.json

Review spec:
  cat /tmp/gaia-workspace/<JOB_ID>/specs/<JOB_ID>/spec.json | jq .
  cat /tmp/gaia-workspace/<JOB_ID>/specs/<JOB_ID>/scenarios.feature

Approve and run:
  npx ts-node src/cli/run.ts --id <JOB_ID> --approve

What to say:
  \"CLI is speed and reproducibility: same pipeline, one command.\"

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 5] .claude mode${NC}

One-shot:
  /run --job /tmp/demo-cashflow-job.json --approve

Human-in-the-loop (from .claude/commands/run.md):
  Implementa la siguiente feature pendiente

What happens:
  craftsman_lead reads AGENTS.md + feature_list.json + progress/current.md
  spec_partner  -> project-spec.md
  gherkin_author -> features/<name>.feature
  Human approves
  tdd_craftsman -> code
  judge         -> review
  mutation_tester -> quality gate

What to say:
  \".claude is transparency: AI proposes, human approves each scenario.\"

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 6] CLI vs .claude${NC}

| Aspect          | CLI                         | .claude                       |
| --------------- | --------------------------- | ----------------------------- |
| Start           | npx ts-node src/cli/run.ts  | Chat or /run                  |
| Orchestrator    | src/cli/run.ts + leader.ts  | craftsman_lead + subagents    |
| Spec approval   | --approve flag              | Pause on Gherkin              |
| Speed           | Faster                      | Slower, more conversation     |
| Best for        | Demos, defined tasks        | Ambiguous features, TDD       |
| Same pipeline?  | Yes                         | Yes                           |

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 7] What to show in the generated PR${NC}

  cd /tmp/gaia-workspace/<JOB_ID>/repo
  git branch --show-current
  git log --oneline -3
  git show --stat HEAD

Highlight:
  ${GREEN}*${NC} demo_analytics_event.dart (model)
  ${GREEN}*${NC} demo_analytics_repository.dart (repository)
  ${GREEN}*${NC} bre_b_core.dart (exports)
  ${GREEN}*${NC} No CI/CD, secrets or build files touched

Press Enter to continue...")

slides+=("${YELLOW}[SLIDE 8] Closing${NC}

The value is not \"AI writes code.\"
The value is \"AI writes code inside a process we control.\"

Discussion questions:
  * Which mode fits us best: CLI or .claude?
  * Which repo/feature should we pilot first?
  * Do we need Jira/Slack/GitHub Checks integration?

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

clear
echo -e "${BLUE}${BOLD}Done.${NC}"
