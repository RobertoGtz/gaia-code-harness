# Speaker Script — GAIA Demo on a Sample Flutter Web Project (CLI + `.claude`)

> ~5 minute demo using **Mode B (CLI)** and **Mode `.claude`**. No server or Docker required.
> The goal is to show, with the same requirement, how GAIA generates a Pull Request in each mode.

---

## Preparation before going live

1. Open a terminal in `~/Desktop/gaia-code-harness`.
2. Verify that `GITHUB_TOKEN` is in `.env` (token for the sample repo).
3. Verify that `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` are configured.
4. Run `./init.sh` once to validate the environment.
5. Create the demo job at `/tmp/demo-job.json`:

```bash
cat > /tmp/demo-job.json <<'JSON'
{
  "initiativeId": "demo",
  "title": "Demo: add DemoAnalytics feature with event model and repository to core",
  "platform": "flutter_web",
  "repo": "sample-org/sample-flutter-web-app",
  "targetBranch": "main",
  "module": "core",
  "description": "Presentation-only demo change: add a DemoAnalyticsEvent model, a DemoAnalyticsRepository class with a logEvent method, and export both from core.dart. No business logic changes and no unit tests are required for this demo-only feature.",
  "acceptanceCriteria": [
    "WHEN DemoAnalyticsEvent is constructed THEN it has name, timestamp and payload fields",
    "WHEN DemoAnalyticsRepository.logEvent is called THEN it stores the event in an internal list",
    "WHEN DemoAnalyticsEvent and DemoAnalyticsRepository are exported from core.dart THEN they are reachable from the core library"
  ],
  "maxFilesToTouch": 4,
  "requireTests": false,
  "tddMode": false
}
JSON
```

> **Note:** `requireTests: false` makes the demo fast and predictable. In production use `true` and GAIA requires green tests before creating the PR.

6. Clean up demo PRs from previous runs if needed (optional).

---

## What is Harness Engineering?

**What to say (45 sec):**

> "Before showing the product, I want to explain the concept. We call this **Harness Engineering**. It is not about letting AI write code freely; it is putting AI inside a harness of processes, rules, and checkpoints."

**Show on screen (slide or terminal):**

```
┌─────────────────────────────────────────────────────────┐
│                  HARNESS ENGINEERING                     │
├─────────────────────────────────────────────────────────┤
│  1. Spec-first          → plan before code               │
│  2. Human-in-the-loop   → approval before touching repo  │
│  3. Scope limits        → maxFilesToTouch, allowed dirs  │
│  4. Automated validation→ lint + tests + mutation tests│
│  5. Traceability        → PR ↔ spec ↔ ACs ↔ job log      │
│  6. Notifications       → Jira / Slack / GitHub Checks │
└─────────────────────────────────────────────────────────┘
```

**Useful analogy:**

> "A safety harness does not stop you from climbing; it lets you climb higher knowing that, if you slip, you don't fall. Harness Engineering does the same with AI: you go faster, but within guardrails."

**Key points to mention:**

- No spec, no code.
- Without human approval, the repo is not touched.
- Scope limits prevent massive rewrites.
- Every PR is traceable to a spec and acceptance criteria.

---

## How to show the code during the demo

During the demo you will show **three things** that demonstrate traceability:

### 1. Job progress

```bash
# Get the most recent job ID and open it
ls -t progress/*.md | head -1
# or if you know the ID
open progress/<JOB_ID>.md
```

**What to show:** the `progress/<JOB_ID>.md` file contains status, spec, errors, and final summary. It is the auditable log.

### 2. The spec and Gherkin scenarios

```bash
# Show the generated technical spec
ls /tmp/gaia-workspace/<JOB_ID>/specs/<JOB_ID>
```

**What to show:**

- `spec.json` — requirements, tasks, affected files, risks.
- `scenarios.feature` — Gherkin scenarios that are the executable contract.

### 3. The code diff and PR

```bash
cd /tmp/gaia-workspace/<JOB_ID>/repo
# Summary of touched files
git show --stat HEAD
# Full diff
git show HEAD
```

**What to show:**

- Only files authorized by the spec.
- How `demo_analytics_event.dart` and `demo_analytics_repository.dart` are created.
- How `core.dart` exports the model and repository.
- No changes to CI/CD, secrets, or infrastructure files.

> **Tip:** If you want to highlight that the AI does not touch what it shouldn't, run `git show --stat HEAD` and show that modified files stay inside the `core` module.

---

## Intro 0 — Introduce the GAIA Code Harness project (1 min)

Before entering the target repo, briefly introduce the system itself so the audience understands what is running.

**What to say:**

> "What we have open here is the **GAIA Code Harness** repo: the harness that orchestrates several AI agents to generate code in a controlled way. It is not a chatbot writing blindly; it is a pipeline with states, persistence, and human approval checkpoints."

**Show on screen:**

```bash
# High-level project structure
tree -L 2 -I 'node_modules|.git' /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness
```

Or, if you don't have `tree`, use:

```bash
ls -1 /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness
```

**Key files to show and explain:**

```bash
# Pipeline agents
open /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness/src/agents/reviewer.ts
open /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness/src/agents/implementer.ts
open /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness/src/agents/spec-author.ts

# Orchestrator (state machine)
open /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness/src/harness/leader.ts

# Platform plugins
open /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness/src/plugins/index.ts

# Human documentation
open /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness/AGENTS.md
open /Users/robertogutierrezgonzalez/Desktop/gaia-code-harness/docs/engineering/workflow.md
```

**What to explain while viewing the files:**

- **`src/agents/`**: each agent has a defined role:
  - `SpecAuthorAgent` → generates the technical spec.
  - `ImplementerAgent` → writes code from the spec.
  - `ReviewerAgent` → validates and creates the PR.
  - `MutationTesterAgent` → evaluates test quality.
- **`src/harness/leader.ts`**: the state machine that moves the job through `pending → spec_ready → implementing → reviewing → done`.
- **`src/plugins/`**: platform skills (`flutter_web`, `ios`, `android`, `backend`) that inject repo-specific rules.
- **`src/state/`**: persistence in Postgres (Modes A/C) or on disk (Mode B).
- **`AGENTS.md`** and **`docs/engineering/workflow.md`**: map for AI agents and the full pipeline.
- **`scripts/present.sh`**: if you want, also show that a presentation script with slides already exists.

**Key points to mention:**

- GAIA is not one giant prompt; it is specialized agents calling each other in a chain.
- Each agent reads and writes handoffs in the workspace (`progress/`, `specs/`).
- The 3 modes (HTTP API, CLI, Webhook) use the same agents and the same state machine.

**Key phrase:**

> "The demo you are about to see is not a presentation trick: it is exactly the same code that would run in production."

---

## Intro — Present the target project, the code to change, and the explanation (1 min)

Before launching the pipeline, show the audience context so they understand what they will see changed.

**What to say:**

> "This is a sample Flutter Web project. Inside the repo there is a module called `core`. We will ask GAIA to add a small demo analytics feature in that module's core: a `DemoAnalyticsEvent` model, a `DemoAnalyticsRepository` with `logEvent`, and export both from `core.dart`. It is a small change, but it will let you see the whole pipeline: spec, approval, code, PR."

**Show on screen:**

```bash
# Repo URL on GitHub
open https://github.com/sample-org/sample-flutter-web-app

# Structure of the core module (from the cloned workspace or local repo)
ls packages/core/lib/src
```

Also show the file to be modified **before** the change:

```bash
# If you already have the repo cloned in a previous job workspace
cat /tmp/gaia-workspace/<JOB_ID>/repo/packages/core/lib/core.dart
# or open it in the IDE
open packages/core/lib/core.dart
```

**Key points to mention:**

- **Project:** a sample multi-platform Flutter Web app; GAIA treats it as a Flutter Web repo.
- **Code:** `core.dart` is the entry point of the core module; there we will export the new model and repository.
- **Explanation:** GAIA does not touch `main`; it will create a feature branch, commit, and open a PR.
- **Why this change:** it is small enough to finish in ~1 minute, yet represents the full flow.

**Key phrase:**

> "We are not doing magic: we are running a process on a real repo. In a minute you will see the exact diff GAIA proposes."

---

## Slide 1 — Intro and demo structure (45 sec)

**What to say:**

> "In the next 5 minutes we will: 1) ask GAIA for a small feature, 2) see how it generates a technical plan, 3) approve that plan, 4) let it write the code and open a real Pull Request on `sample-org/sample-flutter-web-app`."

**Show on screen:**

```
Demo flow
1. Job JSON  →  2. SpecAuthor  →  3. Approval  →  4. Implementer  →  5. Reviewer/PR
```

**Key points to mention:**

- Spec-first: the AI proposes a plan before touching code.
- Human approval: there is always a gate before implementing.
- File limit: `maxFilesToTouch` prevents surprise rewrites.
- Traceability: each PR can be traced to its spec and criteria.
- **Expected total time:** 50-90 seconds.
- **When to run the live demo:** after the explanatory slides, use the launcher in `scripts/present-cli-claude.sh`. Pressing `q` on any slide jumps straight to the launcher.

---

## Slide 2 — The demo job (45 sec)

**What to say:**

> "We will ask GAIA to add a small demo analytics feature in the `core` module's core: a `DemoAnalyticsEvent` model, a `DemoAnalyticsRepository` with `logEvent`, and export both from `core.dart`. It generates three files and is 100% demo code. The repo is real: `sample-org/sample-flutter-web-app`."

**Show on screen:**

```bash
cat /tmp/demo-job.json
```

**Highlight while viewing the JSON:**

- `"platform": "flutter_web"` — GAIA loads the Flutter Web skill and knows the repo structure.
- `"maxFilesToTouch": 4` — scope safety (two new files + export + margin).
- `"module": "core"` — further restricts context.
- `"requireTests": false` — disabled for the demo; in production green tests are required.

**Mention:**

> "If we wanted TDD, we would set `tddMode: true`. The Implementer would first write the failing test, then make it pass. For the demo we disable tests so it finishes with a PR predictably."

---

## Slide 3 — Launch the pipeline (30 sec)

**What to say:**

> "We run the CLI with `--approve` so that, after generating the spec, it continues automatically. In production that `--approve` would be a human reviewing the spec in Jira, Slack, or the dashboard."

**Show on screen:**

```bash
npm run gaia -- /tmp/demo-job.json --approve
```

> **Tip:** If you want something even shorter, add this alias to your shell (`~/.zshrc` or `~/.bashrc`):
>
> ```bash
> alias gaia='npm run gaia --'
> ```
>
> Then you can simply run `gaia /tmp/demo-job.json --approve`.

**It starts running.** As the output progresses, narrate each phase.

**Plan B:** If the command takes a while to start, say:

> "While it starts, remember that this runs locally: no server or Docker. All orchestration happens in this process."

---

## Slide 4 — Phase 1: SpecAuthor (1 min)

**What to say while watching the output:**

> "The first agent is `SpecAuthor`. It does not write code yet. It reads the repo, understands the structure, and produces a TechnicalSpec: requirements, tasks, affected files, and risks. It also generates Gherkin scenarios that serve as an executable contract."

**Show on screen (when SpecAuthor finishes):**

```bash
# Identify the job ID
ls -td /tmp/gaia-workspace/*/ | head -1
# or
ls -t progress/*.md | head -1
```

Then show the spec:

```bash
JOB_ID=<id>
cat /tmp/gaia-workspace/$JOB_ID/specs/$JOB_ID/spec.json | head -80
```

**Points to highlight:**

- `requirements` — derived from the ACs.
- `tasks` — file-level plan.
- `design.affectedFiles` — scope boundary.
- `gherkinScenarios` — executable contract.

**Key phrase:**

> "This is the magic of spec-first: before a single line of code exists, we have a plan that a human can approve or reject."

---

## Slide 5 — Phase 2: Human approval (30 sec)

**What to say when you see:**

```
[Leader] ⚠ Spec ready — waiting for human approval
Auto-approving spec...
```

> "Here is the human gate. Without approval, GAIA does not touch the code. In this demo we use `--approve`; in a real flow the team reviews the spec and clicks approve, or rejects it with feedback."

**Show on screen:**

If we had manual approval, the command would be:

```bash
curl -s -X POST http://localhost:3000/jobs/<JOB_ID>/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'
```

**Key points:**

- Two human checkpoints: spec approval + PR review.
- Rejection with feedback regenerates the spec.

---

## Slide 6 — Phase 3: Implementer (1 min)

**What to say while watching:**

> "The `Implementer` agent creates a new branch, writes the change, and commits. By design, GAIA never pushes to `main`; it always uses a feature branch."

**Show on screen (in a second terminal):**

```bash
JOB_ID=<id>
cd /tmp/gaia-workspace/$JOB_ID/repo
# Current branch and commits
git branch --show-current
git log --oneline -3
# Summary of touched files
git show --stat HEAD
```

**Points to highlight:**

- Feature branch created automatically.
- Descriptive commit message.
- The plan authorized 3 files: `demo_analytics_event.dart` (model), `demo_analytics_repository.dart` (repository), and `core.dart` (export).
- The model has typed fields and the repository stores events in an internal list.
- No widgets, navigation, or infrastructure were touched.

**Then show the diff:**

```bash
# New files
git show HEAD -- packages/core/lib/src/data/models/demo_analytics_event.dart
git show HEAD -- packages/core/lib/src/data/repositories/demo_analytics_repository.dart
# Export
git show HEAD -- packages/core/lib/core.dart
```

**Key phrase:**

> "There is no black box: we can see exactly what changed, why it changed, and on which branch it landed."

---

## Slide 7 — Phase 4: Reviewer and PR (1 min)

**What to say when you see:**

> "The `Reviewer` agent checks scope limits, runs static analysis, and, if everything looks good, creates the Pull Request. In production, after this the mutation tester steps in to ensure the tests are robust."

**Show on screen:**

```bash
# Copy the PR URL from the output and open it
open <PR_URL>
```

**In the browser, show:**

- PR title and description.
- Files changed: `demo_analytics_event.dart` (model) + `demo_analytics_repository.dart` (repository) + `core.dart` (export), all inside the `core` module.
- No changes to `pubspec_overrides.yaml`, `build/`, `.dart_tool/`, or CI/CD.

**If you have time, show traceability:**

```bash
# The job ID is in the PR body or in progress/<JOB_ID>.md
open progress/<JOB_ID>.md
```

**Key phrase:**

> "The PR is reviewed like any other. The difference is that it arrives with an approved spec, green tests in production, and a complete record of decisions."

---

## Slide 8 — Execution modes: CLI vs `.claude` (1 min)

**What to say:**

> "GAIA does not impose a single interface. Today we will see two modes: the **CLI** and **`.claude`**. Both run exactly the same pipeline and the same agents; what changes is where you put human control."

**Show on screen — quick comparison:**

```text
| Mode        | Starts with                  | Orchestrator                 | Spec approval                  |
| ----------- | ---------------------------- | ---------------------------- | ------------------------------- |
| CLI         | npm run gaia -- <job.json>   | src/cli/run.ts + leader.ts   | --approve flag                  |
| .claude     | Conversation or `/gaia_code_generator` | craftsman_lead + subagents | Human pause on Gherkin         |
```

### Block A — CLI mode (fast and predictable)

**What to say:**

> "The CLI is what we just used: you pass a `job.json` and, if you add `--approve`, the pipeline runs end to end without stopping. Behind it is `src/cli/run.ts`, which invokes the TypeScript agents in `src/agents/`. It is ideal for demos, CI/CD, or well-defined tasks."

**Show on screen:**

```bash
cat /tmp/demo-job.json | head -20
npm run gaia -- /tmp/demo-job.json --approve
```

**Harness files to show:**

- `src/cli/run.ts` — CLI entry point.
- `src/harness/leader.ts` — state machine that advances between agents.
- `src/agents/implementer.ts` — agent that writes the code.
- `src/agents/reviewer.ts` — agent that reviews and creates the PR.

**Key phrase:**

> "CLI is speed and reproducibility: same pipeline, single command."

### Block B — `.claude` mode (artisanal with human control)

**What to say:**

> "The `.claude` mode runs inside Claude Code. Instead of a command, Claude acts as `craftsman_lead` and coordinates subagents: `spec_partner`, `gherkin_author`, `tdd_craftsman`, `judge`, and `mutation_tester`. The big difference is that there is a mandatory human pause after the Gherkin scenarios."

**Show on screen:**

```text
/gaia_code_generator --job /tmp/demo-job.json --approve
```

or, step by step:

```text
Implement the following pending feature
```

**`.claude/` files to show:**

- `.claude/agents/craftsman_lead.md` — role of the pipeline conductor.
- `.claude/agents/spec_partner.md` — conversation and writes `project-spec.md`.
- `.claude/agents/gherkin_author.md` — distills `features/<name>.feature`.
- `.claude/commands/gaia_code_generator.md` — slash command `/gaia_code_generator` that uses the CLI behind the scenes.
- `CLAUDE.md` — context Claude reads on startup.

**Key phrase:**

> "`.claude` is transparency: the AI proposes, the human approves each scenario, and only then code is written."

### Block C — How to alternate between both

**What to say:**

> "Both modes do not compete; they complement each other. You start an idea in `.claude` to discuss it, approve scenarios, and validate TDD. When the task is repeatable and well defined, you send it via CLI."

**Show on screen:**

```text
Claude Code → /gaia_code_generator --job job.json --approve
                     │
                     ▼
         src/cli/run.ts → leader.ts → Implementer → Reviewer → PR
```

**Points to highlight:**

- The `.claude` `/gaia_code_generator` uses the **same TypeScript agents** as the CLI.
- Human approval in `.claude` is on the `.feature` files; in CLI it is skipped with `--approve`.
- In production use `--approve=false` or manual approval on the `.claude` Gherkin scenarios.

**Key phrase:**

> "CLI is for speed; `.claude` is for collaboration. Same harness, different way to drive."

---

## Slide 9 — Closing and questions (45 sec)

**What to say:**

> "In summary: we gave a requirement in natural language, GAIA proposed a plan, we approved it, and GAIA delivered code in a real Pull Request. The value is not 'that AI writes code'; it is that it does so inside a process with spec, human approval, scope limits, and traceability."

**Show on screen (visual summary):**

```
Product Manager  ──ACs──▶  SpecAuthor  ──spec──▶  Human (approve)
                                      │
                                      ▼
                           Implementer ──code──▶  Reviewer ──PR──▶  Team
                                      │
                                      ▼
                           MutationTester (production)
```

**Optional closing questions:**

- "How comfortable would you be approving AI-generated specs?"
- "Which repo or feature would we want to pilot first?"
- "Do you prefer Mode A (HTTP API), B (CLI), or C (webhook with Jira)?"
- "Would you need notifications in Slack/Jira or GitHub Checks?"

---

## Plan B — If something goes wrong live

### Spec takes longer than expected

> "As you can see, the spec requires reading the repo and calling the LLM. In large repos this can take a minute. Meanwhile, let's show the repo structure."

Emergency command:

```bash
# In another terminal, follow progress in real time
tail -f progress/<JOB_ID>.md
```

### Job fails with `test_error`

> "This is precisely one of the advantages of the harness: if tests fail, the pipeline stops. In production the Implementer retries up to 5 times with feedback; if it persists, it ends in `test_error` for human review."

**To save the demo instantly:**

```bash
# Re-launch with requireTests false
npm run gaia -- /tmp/demo-job.json --approve
```

### PR is not created

> "If `GITHUB_TOKEN` is not configured, the system does a dry-run: it generates all the code but creates a simulated PR. The value of the pipeline is still visible."

Verify the token:

```bash
grep GITHUB_TOKEN .env
```

### Unexpected files included in the commit

> "GAIA has a list of files it never commits: `pubspec_overrides.yaml`, `build/`, `.dart_tool/`, caches. If they appear, it is a bug and is fixed in `src/tools/git.ts`."

Quick check:

```bash
cd /tmp/gaia-workspace/<JOB_ID>/repo
git show --stat HEAD
```

---

## Extended presenter notes

- **Real timing:** The demo usually takes 50-90 seconds with `requireTests: false`. With `tddMode: true` it can take 3-5 minutes.
- **Demo repos:** The script uses `sample-org/sample-flutter-web-app`. If you prefer not to touch production, change `repo` to a demo repo.
- **Visible orchestration:** Everything is saved in `progress/<JOB_ID>.md`; it is your best ally if you need to improvise.
- **Platform skills:** The `flutter_web` skill injects repo-specific rules (`docs/RULES.md`, `docs/UNIT_TESTS.md`) into every agent prompt.
- **Reproducibility:** The job JSON is idempotent in intent; each execution creates a new branch and a new PR.
- **Post-demo cleanup:** Delete `feature/*-demo-*` branches and test PRs so you don't pollute the repo.
- **Never hardcode tokens:** `GITHUB_TOKEN` must come from `.env`, never from the script.

---

## FAQ for the audience

### Does this replace developers?

> No. GAIA automates the cycle of writing repetitive, well-scoped code. Architectural judgment, PR review, and product decisions remain human. It is an accelerator, not a replacement.

### How does it prevent the AI from touching critical files?

> There are several layers:
>
> 1. `maxFilesToTouch` limits how many files it can modify.
> 2. The spec defines `affectedFiles`; the Implementer restricts itself to that scope.
> 3. The Reviewer applies a file-count guard and rejects PRs that exceed the limit.
> 4. `unstageNeverCommitFiles` in `src/tools/git.ts` prevents build, override, and cache files from being committed.

### What if the AI generates insecure code or secrets?

> System prompts include security guardrails (`docs/engineering/security.md` and `.claude/rules/security-and-conventions.md`). In addition, the Reviewer runs static analysis and PRs go through human review. It never merges automatically.

### What happens if tests fail?

> The pipeline stops at `test_error`. The Implementer automatically retries up to 5 times using the error feedback. If it persists, it waits for a human. In all modes retry is automatic; `--retry` is used to force a manual attempt.

### Can it integrate with Jira?

> Yes. Mode C (`POST /webhook/trigger`) accepts Jira webhooks. You can also pass just `jiraTicketId` in Mode A and GAIA will fetch title, description, ACs, and Figma URL. Comments and state transitions are automatic.

### And Slack or GitHub Checks?

> Yes. By configuring `SLACK_WEBHOOK_URL`, `GITHUB_CHECKS_TOKEN`, or `NOTIFY_WEBHOOK_URL` in `.env`, each state change triggers notifications. If you don't configure anything, it uses `NullNotifier` with no overhead.

### Does it support TDD?

> Yes. By activating `tddMode: true`, the Implementer follows the **Red-Green-Refactor** cycle: first writes the failing test, then implements the minimum code to make it pass, repeating for each Gherkin scenario. It is slower but generates more robust tests.

### What is mutation testing?

> After the Reviewer creates the PR, the `MutationTester` introduces small mutations into the code (`true → false`, `+ → -`, `return null`, etc.) and verifies that the tests detect them. If the _mutation score_ is ≥ 80%, the job finishes. If not, in Mode A/C the feedback returns to the Implementer to strengthen the tests.

### Can it be used with private repos?

> Yes. The GitHub token (`GITHUB_TOKEN`) determines which repos GAIA can access. It is never hardcoded; it always comes from environment variables.

### What is the difference between Mode A, B, and C?

> - **Mode A (HTTP API):** Ideal for production, internal dashboards, and CI. Requires server + Postgres.
> - **Mode B (CLI):** Ideal for local development, debugging, and quick demos. No server.
> - **Mode C (Webhook):** Ideal for Jira Automation, Slack slash commands, or GitHub Actions.

### What if I don't approve the spec?

> You can reject it with feedback and the system regenerates the plan:

```bash
curl -s -X POST http://localhost:3000/jobs/<JOB_ID>/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": false, "feedback": "Needs to include analytics"}'
```

### Is the generated code good quality?

> It depends on the context you give it. If the repo has `docs/RULES.md`, `docs/UNIT_TESTS.md`, and specific plugins, GAIA injects them into every prompt. Quality improves with good local repo documentation.

### Can I run this without internet?

> No. GAIA requires access to the OpenAI or Anthropic API. The rest of the pipeline runs locally or on your infrastructure.

### Where is the record of each job kept?

> In Mode A/C: Postgres + logs. In Mode B: `progress/<JOB_ID>.md`, `progress/.state/`, and `specs/<JOB_ID>/`. Everything is auditable.

### How do I report a pipeline bug?

> Open an issue in the harness repo attaching `progress/<JOB_ID>.md` and, if applicable, the commit diff (`git show HEAD` from the job workspace).

### How much does it cost?

> The harness is open source. You pay for what the OpenAI/Anthropic API calls consume. On small repos and scoped features, a complete job usually costs a few cents. Jobs with `tddMode: true` or mutation testing make more calls, so they cost a bit more.

### Does it support languages other than Dart/Flutter?

> Yes. The architecture is extensible: each platform has a skill in `src/plugins/<platform>/`. Today there are skills for `flutter`, `flutter_web`, `ios`, `android`, and `backend`. Adding a new one means implementing `Skill` (clone, context, apply, test, analyze) and registering it in `src/plugins/index.ts`.

### What if the AI touches a file it shouldn't?

> There are three safeguards:
>
> 1. The spec lists `affectedFiles` and `newFiles`; the Implementer restricts itself to those paths.
> 2. `maxFilesToTouch` is a hard limit; if exceeded, the Reviewer rejects the PR.
> 3. The diff is visible in the PR; any deviation is caught in human review.

### Can it update an existing PR or redo a previous one?

> Yes. If a job fails at `test_error` or `review_error`, you can retry it with `npm run gaia -- --id <JOB_ID> --retry`. The Implementer uses the existing branch, applies fixes, and pushes. You can also submit a new job with the same `targetBranch` and related title.

### How do I see the spec the AI generated?

> In Mode B (CLI) it is saved in `specs/<JOB_ID>/spec.json` and the Gherkin scenarios in `specs/<JOB_ID>/scenarios.feature`. In addition, the PR body includes a link to `progress/<JOB_ID>.md` that summarizes the plan, the agents executed, and the result.

### Does it respect commit conventions and code style?

> Yes, if you ask the repo to. Each platform skill injects style guides (`docs/RULES.md`, `docs/UNIT_TESTS.md`, linters) into prompts. The Implementer generates descriptive commits and the Reviewer validates that forbidden files are not committed.

### Can it run in CI/CD?

> Yes. Mode C (`POST /webhook/trigger`) is designed for that: a GitHub Action, Jira Automation, or Slack slash command can trigger a job. You can also run the CLI in a runner if you export the required environment variables.

### How is it different from Copilot or Cursor?

> Copilot/Cursor assist while you write code. GAIA orchestrates a **process**: it receives a requirement, generates a spec, allows human approval, implements, reviews, creates a PR, and measures robustness with mutation testing. It is designed for complete tasks, not inline suggestions.

### What tasks are NOT suitable for GAIA?

> Tasks requiring deep product judgment, brand-new architecture design with no precedent in the repo, massive refactorings without backing tests, or changes to critical infrastructure (secrets, CI/CD, permissions). GAIA works best with well-scoped, documented changes.

---

## Data for generating slides with AI

Copy this brief into a slide generator (Gamma, Beautiful.ai, Canva Magic, ChatGPT, etc.) to create a visual presentation automatically.

### Suggested style

- **Tone:** technical but accessible; aimed at engineering and product.
- **Palette:** dark (blue `#0B1220`, cyan accent `#38BDF8`, green `#4ADE80`, magenta `#F472B6` for `.claude`).
- **Typography:** modern sans-serif (Inter, SF Pro, Roboto).
- **Visual elements:** flow diagrams, agent cards, comparison tables, stylized terminal screenshots.

### Brief per slide

```json
{
  "slides": [
    {
      "number": 1,
      "title": "GAIA Code Harness — Demo: DemoAnalyticsRepository",
      "subtitle": "CLI and .claude modes on the sample-flutter-web-app repo",
      "key_points": [
        "~5 minute demo",
        "No server or Docker required",
        "Job: add DemoAnalyticsEvent + DemoAnalyticsRepository in core"
      ],
      "visual": "Large title + concept logo + two badges: CLI and .claude"
    },
    {
      "number": 2,
      "title": "The demo job",
      "key_points": [
        "platform: flutter_web",
        "repo: sample-org/sample-flutter-web-app",
        "module: core",
        "maxFilesToTouch: 4",
        "requireTests: false for demo speed"
      ],
      "visual": "Card with highlighted job JSON; arrows pointing to each important field"
    },
    {
      "number": 3,
      "title": "Launch the pipeline (CLI)",
      "key_points": [
        "Command: npm run gaia -- job.json --approve",
        "Pipeline starts locally",
        "Can pause at spec_ready for manual approval"
      ],
      "visual": "Stylized terminal with the command and a state timeline below"
    },
    {
      "number": 4,
      "title": "Phase 1: SpecAuthor",
      "key_points": [
        "Reads the repo and understands conventions",
        "Generates TechnicalSpec: requirements, tasks, risks, affected files",
        "Produces Gherkin scenarios as executable contract"
      ],
      "visual": "Diagram: Repo -> SpecAuthor -> spec.json + scenarios.feature"
    },
    {
      "number": 5,
      "title": "Phase 2: Human approval",
      "key_points": [
        "Spec ready -> waiting for human approval",
        "Without approval no code is touched",
        "In production: POST /jobs/:id/approve or pause in .claude"
      ],
      "visual": "Hand/person icon stopping/advancing the flow between SpecAuthor and Implementer"
    },
    {
      "number": 6,
      "title": "Phase 3: Implementer",
      "key_points": [
        "Creates feature branch",
        "Writes only authorized files",
        "Descriptive commit"
      ],
      "visual": "File list: demo_analytics_event.dart, demo_analytics_repository.dart, core.dart"
    },
    {
      "number": 7,
      "title": "Phase 4: Reviewer and PR",
      "key_points": [
        "Validates scope and static analysis",
        "Creates the Pull Request on GitHub",
        "Full traceability: PR -> spec -> ACs -> job log"
      ],
      "visual": "Mockup of a GitHub PR with files changed and link to job"
    },
    {
      "number": 8,
      "title": "CLI vs .claude",
      "key_points": [
        "CLI: speed and reproducibility, automatic --approve",
        ".claude: human control on Gherkin, slash command /gaia_code_generator",
        "Both use the same TypeScript agents behind the scenes"
      ],
      "visual": "Two-column comparison table with terminal and chat icons"
    },
    {
      "number": 9,
      "title": "Closing",
      "key_points": [
        "The value is not 'AI writes code'",
        "The value is 'AI inside a controlled process'",
        "Spec -> Approval -> Scope -> Review -> Mutation testing -> PR"
      ],
      "visual": "Final flow diagram connecting all phases and a question to the audience"
    }
  ]
}
```

### Ready-to-copy prompt

> "Create a 9-slide technical presentation in dark mode using the following JSON brief. Each slide should have a title, 2-4 bullet points, and a visual suggestion. Use cyan and green accents. Keep the style clean and engineering-friendly."

---

## Quick commands

```bash
# View the most recent job
ls -t progress/*.md | head -1

# View the latest saved jobs
npm run gaia -- --list

# Follow a job in real time
tail -f progress/<JOB_ID>.md

# Retry a job from test_error/review_error
npm run gaia -- --id <JOB_ID> --retry

# View the generated commit diff
cd /tmp/gaia-workspace/<JOB_ID>/repo
git show --stat HEAD
git show HEAD
```
