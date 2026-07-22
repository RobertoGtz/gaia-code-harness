# Demo Speaker Script — Promotion Carousel (Flutter)

Script to present GAIA Code Harness with a realistic feature: **"Add promotion banner"** in a Flutter module. Includes execution in **CLI mode** and **`.claude` mode**, explanation of each agent, and talking points for each phase.

---

## Slide 1 — Title and hook (30 sec)

**What to say:**

> "Today we will see how GAIA Code Harness takes a product requirement — with Jira, Figma, and acceptance criteria — and turns it into a real Pull Request. The feature: a promotion carousel on the home screen of a Flutter app."

**Show on screen:**

```text
GAIA CODE HARNESS
Controlled AI Code Generation

Feature: Add promotion banner (Flutter)
Repo:    my-org/my-repo
Ticket:  PROJ-123
Figma:   https://figma.com/file/abc123/promo-banner
```

**Key phrase:**

> "It is not magic: it is a process with spec, human approval, controlled scope, and traceability."

---

## Slide 2 — What is Harness Engineering? (1 min)

**What to say:**

> "Instead of asking the AI to 'write code', we give it a harness: first it must propose a plan, then a human approves it, then it writes only what is authorized, and finally it goes through review. That is Harness Engineering."

**Show the diagram:**

```text
Requirement (Jira/Figma/ACs)
          │
          ▼
   ┌──────────────┐
   │  SpecAuthor   │  ← analyzes repo and proposes plan
   └──────────────┘
          │
          ▼
   ┌──────────────┐
   │   Human      │  ← approves/rejects the spec
   └──────────────┘
          │
          ▼
   ┌──────────────┐
   │  Implementer │  ← writes the code
   └──────────────┘
          │
          ▼
   ┌──────────────┐
   │   Reviewer   │  ← validates and creates PR
   └──────────────┘
          │
          ▼
   ┌──────────────┐
   │MutationTester│  ← validates test quality
   └──────────────┘
```

**Points to highlight:**

- Specification before code.
- Two human checkpoints: spec and PR.
- The AI never merges: it only opens the PR.
- Scope limited by `maxFilesToTouch` and the technical plan.

---

## Slide 3 — The agents and what each does (1 min)

**What to say:**

> "GAIA is not a single prompt. It is specialized agents chained together. In CLI/HTTP mode we use the TypeScript agents; in `.claude` mode we use conversational subagents, but the work is the same."

**CLI / HTTP mode agents (TypeScript):**

| Agent                 | Role                                                        | Output                                                 |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| `SpecAuthorAgent`     | Reads the repo, understands conventions, generates technical plan | `TechnicalSpec` JSON + Gherkin scenarios (`.feature`) |
| `ImplementerAgent`    | Writes/modifies files according to spec and ACs             | Code on a feature branch + commits                     |
| `ReviewerAgent`       | Validates scope, lint/tests, and creates the Pull Request  | PR on GitHub with description and traceability         |
| `MutationTesterAgent` | Mutates code to see if tests detect changes                 | Mutation score; if low, asks to strengthen tests       |

**`.claude` mode agents:**

| Agent             | Role                                                      | Output                            |
| ----------------- | --------------------------------------------------------- | --------------------------------- |
| `craftsman_lead`  | Coordinates the pipeline from chat                        | Progress messages and decisions |
| `spec_partner`    | Talks with you to understand the feature                  | `project-spec.md`                 |
| `gherkin_author`  | Distills acceptance criteria into Gherkin                | `features/<name>.feature`         |
| `tdd_craftsman`   | Implements code (Red-Green-Refactor if `tddMode=true`)   | Code + tests                      |
| `judge`           | Reviews code quality                                       | `progress/judge_<name>.md`        |
| `mutation_tester` | Measures test robustness                                   | `progress/mutation_<name>.md`     |

**Key phrase:**

> "Each agent has a single responsibility. That way we can debug, improve prompts, and audit what happened."

---

## Slide 4 — The example job (45 sec)

**What to say:**

> "This is the input we will give GAIA. It has a Jira ticket, Figma link, platform, target branch, and acceptance criteria in EARS format."

**Show the JSON:**

```bash
cat > /tmp/demo-promo-job.json <<'JSON'
{
  "platform": "flutter",
  "title": "Add promotion banner",
  "jiraTicketId": "PROJ-123",
  "repo": "my-org/my-repo",
  "module": "home_screen",
  "targetBranch": "develop",
  "description": "Display highlighted promotion carousel",
  "figmaUrl": "https://figma.com/file/abc123/promo-banner",
  "tddMode": false,
  "buildStrategy": "resolve",
  "requireTests": true,
  "maxFilesToTouch": 6,
  "acceptanceCriteria": [
    "WHEN user opens home screen THEN display promotional banner carousel",
    "WHEN there are more than 3 promotions THEN show pagination dots"
  ]
}
JSON
```

**Highlight while viewing the JSON:**

- `"platform": "flutter"` — GAIA loads the Flutter skill and knows the repo structure.
- `"module": "home_screen"` — restricts context to one module.
- `"maxFilesToTouch": 6` — scope safety limit.
- `"requireTests": true` — requires green tests before creating the PR.
- `"tddMode": false` — generates code all at once; with `true` it would Red-Green-Refactor test by test.
- `"buildStrategy": "resolve"` — for iOS/Tuist in large repos resolves dependencies without building everything; in Flutter it adjusts to the skill.

---

## Slide 5 — CLI mode: step-by-step demo (2 min)

**What to say:**

> "First we will run CLI mode. It is the fastest for demos: a single command, no server or Postgres needed."

### Step 1 — Run without approving (show the spec)

**Command:**

```bash
cd ~/Desktop/gaia-code-harness
npx ts-node src/cli/run.ts --job /tmp/demo-promo-job.json
```

**What to say while it runs:**

> "`SpecAuthor` is reading the repo, understanding conventions, and generating a technical plan. It does not write code yet."

**When it stops at `spec_ready`, show:**

```bash
# Job ID (copy from output)
JOB_ID=<id>

# Generated technical spec
cat /tmp/gaia-workspace/$JOB_ID/specs/$JOB_ID/spec.json | jq '.requirements, .design'

# Gherkin scenarios
cat /tmp/gaia-workspace/$JOB_ID/specs/$JOB_ID/scenarios.feature
```

**Key phrase:**

> "Here is the human gate: we see the plan before a single line of code is written."

### Step 2 — Approve and continue

**Command:**

```bash
npx ts-node src/cli/run.ts --id $JOB_ID --approve
```

**What to say while it runs:**

> "Now the `Implementer` writes the code on a new branch, the `Reviewer` validates and creates the PR. Everything is saved in `progress/$JOB_ID.md`."

**When it finishes, show:**

```bash
# Open the PR
open <PR_URL>

# Or view the summary
git -C /tmp/gaia-workspace/$JOB_ID/repo show --stat HEAD
```

**Points to highlight:**

- Feature branch created automatically.
- Only files authorized by the plan.
- The PR has traceability to the job and the spec.

---

## Slide 6 — `.claude` mode: step-by-step demo (2 min)

**What to say:**

> "Now let's look at `.claude` mode. Instead of a command, we chat with Claude Code. It is more artisanal and lets you see each step."

### Step 1 — Start from chat

**Option A: automatic (same as CLI, from chat)**

```text
/gaia_code_generator --job /tmp/demo-promo-job.json --approve
```

**Option B: step by step with human control (typical example from `.claude/commands/gaia_code_generator.md`)**

```text
Implement the following pending feature
```

**What to say while it runs:**

> "Claude acts as `craftsman_lead`. It reads `AGENTS.md`, `feature_list.json`, and `progress/current.md`, runs `./init.sh`, and picks the next pending feature. It first delegates to `spec_partner` to understand the feature and write `project-spec.md`."

### Step 2 — Show the spec artifacts

**Files to open in the IDE:**

```bash
open project-spec.md
open features/add-promotion-banner.feature
```

**What to say:**

> "Here Claude as `gherkin_author` turned the acceptance criteria into Gherkin scenarios. The human reads and approves them before continuing."

**Approval message:**

```text
Approved, continue with implementation.
```

### Step 3 — Implementation and review

**What to say while it runs:**

> "Now `tdd_craftsman` enters to write code. If `tddMode` is active, it will do Red-Green-Refactor: red test, minimal code, refactor. Then `judge` reviews quality and `mutation_tester` validates robustness."

**Artifacts to show:**

```bash
open progress/judge_add-promotion-banner.md
open progress/mutation_add-promotion-banner.md
```

**Key phrase:**

> "In `.claude` the AI proposes and the human approves each scenario. It is the same pipeline, but with conversation."

---

## Slide 7 — CLI vs `.claude` comparison (1 min)

**Show table:**

```text
| Aspect          | CLI mode                        | .claude mode                      |
| --------------- | ------------------------------- | --------------------------------- |
| How it starts   | `npx ts-node src/cli/run.ts ...`| Chat or `/gaia_code_generator`    |
| Orchestrator    | `src/cli/run.ts` + `leader.ts`  | `craftsman_lead` + subagents      |
| Spec approval   | `--approve` (auto)              | Human pause on Gherkin            |
| Speed           | Faster                          | Slower, more conversation         |
| Best for        | Demos, CI/CD, defined tasks     | Ambiguous features, debugging, TDD  |
| Same pipeline   | Yes                             | Yes                               |
```

**What to say:**

> "CLI is for speed and reproducibility. `.claude` is for when you want to discuss the feature, review each scenario, and show TDD. Both use the same TypeScript agents behind the scenes."

---

## Slide 8 — What to show from the resulting repo (1 min)

**What to say:**

> "Once the PR is generated, let's show exactly what changed. There is no black box."

**Commands:**

```bash
cd /tmp/gaia-workspace/<JOB_ID>/repo
git branch --show-current
git log --oneline -3
git show --stat HEAD
```

**What to highlight:**

- Expected files: carousel widget, promotion models, provider/StateNotifier, tests, exports.
- No CI/CD, secrets, or infrastructure files were touched.
- `pubspec_overrides.yaml`, `build/`, `.dart_tool/` are not in the commit.

**View the diff:**

```bash
git show HEAD -- packages/features/home_screen/lib/src/...
```

---

## Slide 9 — FAQ (1 min)

### Why `requireTests: true` in this example?

> "Because it is a real product feature. In quick demos we can set it to `false`, but in production we want green tests and a high mutation score."

### What if we don't have Figma?

> "`figmaUrl` is optional. Without it, the spec is based only on description and ACs. With Figma, the agent can reference design if integration is available."

### Can CLI mode read Jira?

> "Yes. You can pass `--jira PROJ-123` and GAIA fetches title, description, and ACs. You can also include `jiraTicketId` in job.json."

### Can it run in CI?

> "Yes. HTTP API or Webhook mode. A GitHub Action can `POST /webhook/trigger` with the ticket."

### What if I don't like the spec?

> "You reject it with feedback and it regenerates. In CLI: `curl -X POST .../approve -d '{"approved":false,"feedback":"..."}'`. In `.claude`: say 'rejected, missing ...'."

---

## Slide 10 — Closing and next steps (30 sec)

**What to say:**

> "The important thing is not that the AI writes code. It is that it does so inside a process we understand, control, and can audit: spec, approval, scope, review, mutation testing."

**Questions for the audience:**

- "Which mode interests you most to start with: CLI, HTTP API, or `.claude`?"
- "What feature in your backlog could we pilot first?"
- "Do you need integration with Jira, Slack, or GitHub Checks?"

**Resources:**

- `docs/guides/demo-speaker-script-promo.md` — this script.
- `scripts/present-promo.sh` — script to show the slides.
- `API.md` — REST API reference.
- `docs/guides/claude-mode.md` — guide for `.claude` mode.

---

## Quick commands

```bash
# Create job JSON
cat > /tmp/demo-promo-job.json <<'JSON'
{
  "platform": "flutter",
  "title": "Add promotion banner",
  "jiraTicketId": "PROJ-123",
  "repo": "my-org/my-repo",
  "module": "home_screen",
  "targetBranch": "develop",
  "description": "Display highlighted promotion carousel",
  "figmaUrl": "https://figma.com/file/abc123/promo-banner",
  "tddMode": false,
  "buildStrategy": "resolve",
  "requireTests": true,
  "maxFilesToTouch": 6,
  "acceptanceCriteria": [
    "WHEN user opens home screen THEN display promotional banner carousel",
    "WHEN there are more than 3 promotions THEN show pagination dots"
  ]
}
JSON

# CLI mode step by step
npx ts-node src/cli/run.ts --job /tmp/demo-promo-job.json
npx ts-node src/cli/run.ts --id <JOB_ID> --approve

# .claude mode
# In Claude Code write: /gaia_code_generator --job /tmp/demo-promo-job.json --approve
# Or step by step: "Implement feature PROJ-123: Add promotion banner"

# View generated diff
cd /tmp/gaia-workspace/<JOB_ID>/repo
git show --stat HEAD
git show HEAD
```
