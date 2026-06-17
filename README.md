<h1 align="center">GAIA Code Harness</h1>

<p align="center">
  <strong>AI-powered code generation orchestrator with human oversight for Flutter, Flutter Web, iOS, and Android.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square&logo=node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.3-blue?style=flat-square&logo=typescript" />
  <img src="https://img.shields.io/badge/Fastify-4.x-black?style=flat-square&logo=fastify" />
  <img src="https://img.shields.io/badge/PostgreSQL-15-336791?style=flat-square&logo=postgresql" />
  <img src="https://img.shields.io/badge/platforms-Flutter%20%7C%20Flutter%20Web%20%7C%20iOS%20%7C%20Android-orange?style=flat-square" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
</p>

---

## Overview

**GAIA Code Harness** bridges the gap between product requirements and production-ready code. A Product Manager defines acceptance criteria — the system autonomously generates a technical specification, implements the code across the target mobile platform, runs tests, and opens a Pull Request. A human approves the plan before a single line of code is written.

```
 PM writes acceptance criteria
         │
         ▼
 ┌────────────────────┐
 │    Spec Author     │  Analyses repo, generates TechnicalSpec + Gherkin
 └─────────┬──────────┘
           │  ← Human approves spec  (Tech Lead checkpoint)
           ▼
 ┌────────────────────┐
 │    Implementer     │  Normal mode: bulk code → tests
 │   (TDD mode)       │  Red-Green-Refactor one scenario at a time
 └─────────┬──────────┘
           ▼
 ┌────────────────────┐
 │     Reviewer       │  Lints, tests, opens GitHub PR
 └─────────┬──────────┘
           ▼
 ┌────────────────────┐
 │  Mutation Tester   │  Validates tests actually bite (≥80% kill rate)
 └─────────┬──────────┘
           ▼
 Pull Request ready for review  (~35–90 seconds end-to-end)
```

---

## Key Features

- **Spec-Driven Development** — generates a structured `TechnicalSpec` (requirements, tasks, design decisions, risks) before writing any code
- **Human-in-the-Loop** — mandatory approval checkpoint after spec generation; the system never touches code without explicit sign-off
- **Multi-Platform** — Flutter (mobile), Flutter Web, iOS/Swift, and Android/Kotlin supported via platform **Skills** — no per-platform agent duplication
- **Dual Orchestration Mode** — HTTP + PostgreSQL server mode _and_ Claude Code local mode (disk state, no DB required)
- **TDD Craftsman** — optional `tddMode: true` flag switches Implementer to Red-Green-Refactor, one failing test at a time
- **Mutation Tester** — automatically runs after every review; validates that tests detect real defects (≥80% kill rate required)
- **State Machine Orchestration** — 10-state lifecycle with full audit trail persisted in PostgreSQL or on-disk JSON
- **Rich Terminal Output** — color-coded, emoji-enhanced logs per agent with a detailed end-of-job summary box
- **Pluggable Agents** — repos can override default agents via a `.gaia/` directory
- **LLM-Agnostic** — supports OpenAI and Anthropic; model selection is configurable per-agent

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│               Orchestration Mode A — HTTP Server                 │
│  POST /jobs  ·  GET /jobs/:id  ·  POST /jobs/:id/approve         │
└──────────────────────┬───────────────────────────────────────────┘
                       │
              ┌────────┴────────┐
              │                 │
              ▼                 ▼
   ┌──────────────────┐  ┌──────────────────────────────────────┐
   │  Leader (state   │  │  Orchestration Mode B — Claude Code  │
   │  machine)        │  │  npx ts-node src/cli/run.ts          │
   └────────┬─────────┘  └──────────────┬───────────────────────┘
            │                           │
            └─────────────┬─────────────┘
                          ▼
             ┌────────────────────────────┐
             │      State Backend         │
             │  (interface: StateBackend) │
             ├────────────┬───────────────┤
             │ Postgres   │   Disk JSON   │
             │ (HTTP mode)│ (Claude mode) │
             └────────────┴───────────────┘
                          │
                          ▼
  SpecAuthorAgent  ImplementerAgent   ReviewerAgent  MutationTesterAgent
  (generic)        execute() / executeTDD()  (generic)  (auto, post-review)
                          │
                    loadSkill(platform)
                          │
                          ▼
          ┌───────────────────────────────┐
          │       Platform Skills         │
          │    src/skills/{platform}/     │
          ├──────────┬────────┬───────────┤
          │ flutter  │  ios   │ android   │
          │ pub get  │ spm    │ gradle    │
          │ dart ana │ swift  │ ktlint    │
          │ prompts  │ prompts│ prompts   │
          └──────────┴────────┴───────────┘
```

### Job Lifecycle

#### Normal flow

| Status            | Description                                         |
| ----------------- | --------------------------------------------------- |
| `pending`         | Job received, queued for processing                 |
| `fetching_jira`   | Fetching additional context from Jira               |
| `spec_generating` | SpecAuthor analysing repo and generating plan       |
| `spec_ready`      | **⏸ Awaiting human approval**                       |
| `spec_approved`   | Tech lead approved — implementation begins          |
| `implementing`    | Implementer writing code, running tests, committing |
| `reviewing`       | Reviewer running lint, tests, creating PR           |
| `pr_created`      | Pull Request created on GitHub                      |
| `done`            | Job complete ✅                                     |

#### Error states

When a job fails, it transitions to a **granular error state** instead of a generic `failed` status. Each state carries a structured `errorContext` object with the cause, stage, stderr detail, and retry count.

| Status         | Cause                                                       | Retryable?         |
| -------------- | ----------------------------------------------------------- | ------------------ |
| `env_error`    | Platform toolchain missing (Flutter SDK, Xcode, JDK)        | Manual fix + retry |
| `repo_error`   | Repository clone, branch creation, or push failed           | Manual fix + retry |
| `build_error`  | Dependency resolution failed (pub get, gradle sync, spm)    | Manual fix + retry |
| `test_error`   | Tests or lint failed after implementation                   | Auto (up to 3×)    |
| `review_error` | Reviewer validation failed (file count, spec missing, etc.) | Auto (up to 2×)    |
| `spec_error`   | LLM could not produce a valid spec                          | Manual fix + retry |
| `failed`       | Unknown / unexpected error                                  | Auto (up to 3×)    |

---

## Project Structure

```
gaia-code-harness/
├── src/
│   ├── agents/
│   │   ├── base.ts                  # BaseAgent — shared logging, ANSI colors
│   │   ├── spec-author.ts           # Generic SpecAuthor (all platforms)
│   │   ├── implementer.ts           # Implementer: execute() + executeTDD()
│   │   ├── reviewer.ts              # Generic Reviewer (all platforms)
│   │   ├── mutation-tester.ts       # MutationTesterAgent (auto, post-review)
│   │   └── registry.ts              # getAgentsForPlatform()
│   ├── skills/
│   │   ├── index.ts                 # PlatformSkill interface + loadSkill()
│   │   ├── flutter/index.ts         # Flutter mobile skill
│   │   ├── flutter_web/index.ts     # Flutter Web skill
│   │   ├── ios/index.ts             # iOS / Swift skill
│   │   └── android/index.ts         # Android / Kotlin skill
│   ├── state/
│   │   ├── index.ts                 # StateBackend interface + singleton
│   │   ├── postgres-backend.ts      # Adapter: Postgres (HTTP mode)
│   │   └── disk-backend.ts          # Adapter: JSON files (Claude Code mode)
│   ├── api/
│   │   ├── server.ts                # Fastify setup — registers PostgresBackend
│   │   └── routes/
│   │       └── jobs.ts              # REST endpoints
│   ├── cli/
│   │   └── run.ts                   # Claude Code CLI entry point
│   ├── db/
│   │   └── index.ts                 # PostgreSQL pool + CRUD
│   ├── harness/
│   │   └── leader.ts                # State machine orchestrator
│   ├── tools/
│   │   ├── git.ts                   # Clone, branch, commit, push
│   │   ├── llm.ts                   # OpenAI / Anthropic wrappers
│   │   ├── test-runner.ts           # Flutter toolchain (flutter test, dart analyze)
│   │   ├── xcode-runner.ts          # iOS toolchain (swift, xcodebuild, swiftlint)
│   │   └── gradle-runner.ts         # Android toolchain (gradle, ktlint)
│   ├── types/
│   │   └── index.ts                 # All TypeScript interfaces
│   ├── errors.ts                    # Typed error classes (GaiaEnvError, GaiaRepoError…)
│   └── index.ts                     # HTTP server entry point
├── .claude/
│   └── agents/                      # Claude Code subagent definitions
│       ├── craftsman_lead.md
│       ├── spec_partner.md
│       ├── gherkin_author.md
│       ├── tdd_craftsman.md
│       ├── judge.md
│       └── mutation_tester.md
├── AGENTS.md                        # Navigation map for all agents (both modes)
├── CLAUDE.md                        # craftsman_lead entry point for Claude Code
├── CHECKPOINTS.md                   # Objective done criteria C1-C7
├── feature_list.json                # Feature backlog for Claude Code mode
├── project-spec.md                  # Living spec document (maintained by spec_partner)
├── docs/
│   ├── ARCHITECTURE.md              # Deep-dive technical architecture
│   └── DEMO_GUIDE.md                # Step-by-step demo guide
├── .env.example
└── package.json
```

---

## Prerequisites

| Requirement       | Version  | Notes                       |
| ----------------- | -------- | --------------------------- |
| Node.js           | ≥ 18.0.0 | Always required             |
| PostgreSQL        | 15+      | Via Docker or local install |
| Flutter SDK       | ≥ 3.x    | For Flutter jobs            |
| Xcode + Swift     | ≥ 5.9    | For iOS jobs (macOS only)   |
| Java JDK + Gradle | JDK 17+  | For Android jobs            |

> You only need the SDK for the platform you intend to run. Node.js and PostgreSQL are always required.

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/RobertoGtz/gaia-code-harness.git
cd gaia-code-harness
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Database
DATABASE_URL=postgresql://gaia:gaia@localhost:5432/gaia_harness

# GitHub — required for real PR creation
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=your-org-or-user

# Jira — optional
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=...

# LLM — at least one required for real code generation
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Paths
LOCAL_REPOS_PATH=/path/to/local/repos   # optional: faster cloning in demo
REPOS_BASE_PATH=/tmp/gaia-workspace

PORT=3000
```

### 3. Start PostgreSQL

```bash
docker run -d \
  --name gaia-postgres \
  -e POSTGRES_DB=gaia_harness \
  -e POSTGRES_USER=gaia \
  -e POSTGRES_PASSWORD=gaia \
  -p 5432:5432 \
  postgres:15
```

### 4. Start the server

```bash
npm run dev
```

```
──────────────────────────────────────────────────
  GAIA Code Harness  —  ready on :3000
──────────────────────────────────────────────────
```

---

## Running a Demo

### 1. Create a job — capture the job ID

```bash
JOB=$(curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "flutter",
    "title": "Add dark mode toggle to settings screen",
    "jiraTicketId": "DEMO-100",
    "repo": "demo-repo",
    "targetBranch": "develop",
    "acceptanceCriteria": [
      { "id": "ac-1", "text": "Settings screen shows a dark mode toggle switch" },
      { "id": "ac-2", "text": "Toggle persists the preference using SharedPreferences" },
      { "id": "ac-3", "text": "App applies dark theme immediately without restart" }
    ]
  }')

# Extract the job ID (requires jq)
JOB_ID=$(echo $JOB | jq -r '.job.id')
echo "Job ID: $JOB_ID"
```

The response is a `201` with the full job object:

```json
{
  "job": {
    "id": "3f2a1b4c-8d9e-4f0a-b1c2-d3e4f5a6b7c8",
    "status": "pending",
    "title": "Add dark mode toggle to settings screen",
    "platform": "flutter",
    "repo": "demo-repo"
  }
}
```

> Change `"platform"` to `"ios"`, `"android"`, or `"flutter_web"` to target those platforms.

### 2. Poll until spec is ready

```bash
curl -s http://localhost:3000/jobs/$JOB_ID | jq '{status: .job.status}'
```

Run this every few seconds. The `status` field progresses through:

```
pending → fetching_jira → spec_generating → spec_ready
```

When `status` is `spec_ready`, the full `TechnicalSpec` is available:

```bash
curl -s http://localhost:3000/jobs/$JOB_ID | jq '.job.spec'
```

### 3. Approve the spec

```bash
curl -s -X POST http://localhost:3000/jobs/$JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'
```

Reject with feedback:

```bash
curl -s -X POST http://localhost:3000/jobs/$JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved": false, "feedback": "Needs analytics tracking"}'
```

### 4. Poll to completion

```bash
curl -s http://localhost:3000/jobs/$JOB_ID | jq '{status: .job.status, pr: .job.prUrl}'
```

After approval, status progresses:

```
spec_approved → implementing → reviewing → pr_created → done
```

Full polling loop example (bash):

```bash
while true; do
  STATUS=$(curl -s http://localhost:3000/jobs/$JOB_ID | jq -r '.job.status')
  echo "$(date +%T)  status: $STATUS"
  case $STATUS in
    done)         echo "✅ Done!"; break ;;
    pr_created)   echo "🔗 PR: $(curl -s http://localhost:3000/jobs/$JOB_ID | jq -r '.job.prUrl')"; break ;;
    *_error|failed) echo "❌ Error — check errorContext below"
                  curl -s http://localhost:3000/jobs/$JOB_ID | jq '.job.errorContext'
                  break ;;
  esac
  sleep 5
done
```

### End-of-job summary box

When the job completes, a detailed summary is printed to the terminal:

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║ ✅  GAIA — JOB COMPLETED SUCCESSFULLY                             ║
║ 13/06/2026, 11:25:38  ·  35.2s total                             ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║ JOB DETAILS                                                      ║
║  ──────────────────────────────────────────────────────────────  ║
║ Ticket          DEMO-100                                         ║
║ Title           Add dark mode toggle to settings screen          ║
║ Platform        Flutter                                          ║
║ Repository      demo-repo                                        ║
║ Branch          feature/DEMO-100-add-dark-mode-toggle-to-setti…  ║
║ Base branch     develop                                          ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║ ACCEPTANCE CRITERIA  (3)                                         ║
║  ──────────────────────────────────────────────────────────────  ║
║ ✔  [ac-1] Settings screen shows a dark mode toggle switch        ║
║ ✔  [ac-2] Toggle persists the preference using SharedPreferences ║
║ ✔  [ac-3] App applies dark theme immediately without restart     ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║ IMPLEMENTED TASKS  (4)                                           ║
║  ──────────────────────────────────────────────────────────────  ║
║ +  [create ]  lib/src/presentation/screens/settings_screen.dart  ║
║ ~  [modify ]  lib/main.dart                                      ║
║ ~  [modify ]  lib/src/presentation/screens/home_screen.dart      ║
║ T  [test   ]  test/settings_screen_test.dart                     ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║ PULL REQUEST                                                     ║
║  ──────────────────────────────────────────────────────────────  ║
║ https://github.com/your-org/demo-repo/pull/42                    ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## REST API Reference

### `POST /jobs`

Create a new code generation job.

**Flat body (recommended):**

```json
{
  "platform": "flutter",
  "title": "Add dark mode toggle",
  "jiraTicketId": "DEMO-100",
  "repo": "demo-repo",
  "targetBranch": "develop",
  "description": "Optional longer description",
  "figmaUrl": "https://figma.com/...",
  "tddMode": false,
  "acceptanceCriteria": [
    { "id": "ac-1", "text": "User sees toggle in settings", "priority": "high" }
  ]
}
```

Set `"tddMode": true` to use the Red-Green-Refactor cycle (one test per scenario).

````

**`fullContext` wrapper (legacy):**

```json
{
  "jiraTicketId": "DEMO-100",
  "fullContext": {
    "title": "Add dark mode toggle",
    "platform": "flutter",
    "repo": "demo-repo",
    "acceptanceCriteria": ["User sees toggle in settings"]
  }
}
````

**Response `201`:**

```json
{
  "job": {
    "id": "uuid",
    "status": "pending",
    "title": "...",
    "platform": "flutter"
  }
}
```

---

### `GET /jobs/:id`

Returns full job details: spec, progress logs, branch name, PR URL.

---

### `POST /jobs/:id/approve`

Approve or reject the generated spec.

```json
{ "approved": true }
{ "approved": false, "feedback": "Missing analytics tracking" }
```

---

### `POST /jobs/:id/retry`

Retry a job from any error state. Resets to `pending` and restarts orchestration.

Accepted statuses: `failed`, `env_error`, `repo_error`, `build_error`, `test_error`, `review_error`, `spec_error`.

**Error response (400) if not in an error state:**

```json
{
  "error": "Cannot retry job in status 'implementing'. Only error states can be retried.",
  "retryableStatuses": [
    "failed",
    "env_error",
    "repo_error",
    "build_error",
    "test_error",
    "review_error",
    "spec_error"
  ]
}
```

---

### Error response shape (`GET /jobs/:id` when job has failed)

When a job enters any error state, `errorContext` is populated:

```json
{
  "job": {
    "id": "3f2a1b4c-...",
    "status": "build_error",
    "errorContext": {
      "code": "BUILD_ERROR",
      "stage": "implementing",
      "message": "[Flutter] `flutter pub get` failed — dependency resolution error in my-repo",
      "detail": "Because my_package >=2.0.0 requires sdk >=3.0.0 …\n… (truncated)",
      "timestamp": "2026-06-16T19:00:00.000Z",
      "retryCount": 0
    },
    "progressLogs": [
      "[19:00:00] Failed [BUILD_ERROR]: [Flutter] `flutter pub get` failed…"
    ]
  }
}
```

| Field        | Description                                                     |
| ------------ | --------------------------------------------------------------- |
| `code`       | Machine-readable error code (`ENV_ERROR`, `REPO_ERROR`, etc.)   |
| `stage`      | Job status at the time of failure (`implementing`, `reviewing`) |
| `message`    | Human-readable summary including platform and command           |
| `detail`     | Trimmed stderr output (max 1 500 chars)                         |
| `timestamp`  | ISO 8601 timestamp of the failure                               |
| `retryCount` | Number of automatic retries attempted before giving up          |

---

### `GET /jobs`

List all jobs. Optional query param: `?initiativeId=init-123`

---

## Platform Toolchains

All toolchain logic lives in `src/skills/{platform}/index.ts`. Each skill implements the `PlatformSkill` interface (`verifyEnvironment`, `build`, `test`, `analyze`, `getPromptContext`).

### Flutter (mobile) — `src/skills/flutter/`

| Tool                                  | Purpose               |
| ------------------------------------- | --------------------- |
| `flutter pub get` / `melos bootstrap` | Dependency resolution |
| `flutter test`                        | Unit and widget tests |
| `dart analyze`                        | Static analysis       |

### Flutter Web — `src/skills/flutter_web/`

| Tool              | Purpose               |
| ----------------- | --------------------- |
| `flutter pub get` | Dependency resolution |
| `flutter test`    | Unit and widget tests |
| `dart analyze`    | Static analysis       |

**Additional skill-level checks:**

| Check                  | Description                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Forbidden package scan | Blocks `camera`, `geolocator`, `local_auth`, `image_picker`, and other mobile-only plugins |
| Responsive breakpoints | Warns if new page files lack `LayoutBuilder` or `MediaQuery`                               |
| go_router enforcement  | LLM prompts explicitly forbid `Navigator.push` / `MaterialPageRoute`                       |
| File path conventions  | Pages → `lib/src/web/pages/`, components → `lib/src/web/components/`                       |

### iOS / Swift — `src/skills/ios/`

| Tool                             | Purpose                    |
| -------------------------------- | -------------------------- |
| `swift package resolve`          | SPM dependency resolution  |
| `swift test` / `xcodebuild test` | Unit tests                 |
| `swiftlint`                      | Lint and style enforcement |
| `xcodebuild build`               | Full project build         |

### Android / Kotlin — `src/skills/android/`

| Tool                          | Purpose                  |
| ----------------------------- | ------------------------ |
| `./gradlew dependencies`      | Dependency sync          |
| `./gradlew testDebugUnitTest` | Unit tests               |
| `./gradlew lintDebug`         | Android lint             |
| `./gradlew ktlintCheck`       | Kotlin style enforcement |
| `./gradlew assembleDebug`     | Debug build              |

---

## Security & Control

### Human Checkpoints

| Checkpoint    | Who       | Decision                                |
| ------------- | --------- | --------------------------------------- |
| Spec approval | Tech Lead | Is the technical plan correct and safe? |
| PR review     | Dev Team  | Does the code meet quality standards?   |

### Automatic Safeguards

- **`maxFilesToTouch`** — caps the number of files an agent may modify per job (default: 5)
- **`requireTests`** — enforces test coverage for every implementation
- **Mandatory lint** — `dart analyze` / `swiftlint` / `lintDebug` always runs before PR creation
- **Branch isolation** — every job gets a dedicated feature branch; nothing commits directly to the base branch
- **Full audit trail** — every state transition, agent log, and generated spec is persisted in PostgreSQL with timestamps

---

## Adding a New Platform

Because agents are generic, **you only need to add a new Skill** — no agent code required:

1. Create `src/skills/{platform}/index.ts` implementing the `PlatformSkill` interface
2. Add a `case '{platform}'` in `loadSkill()` inside `src/skills/index.ts`
3. Add the platform string to the `Platform` type in `src/types/index.ts`
4. The three generic agents pick it up automatically — no changes to agents or registry

**Currently supported platforms:**

| Platform         | Value         | Skill directory           |
| ---------------- | ------------- | ------------------------- |
| Flutter (mobile) | `flutter`     | `src/skills/flutter/`     |
| Flutter Web      | `flutter_web` | `src/skills/flutter_web/` |
| iOS / Swift      | `ios`         | `src/skills/ios/`         |
| Android / Kotlin | `android`     | `src/skills/android/`     |

---

## Plugin System

Any repo can provide project-specific rules and configuration by adding a `.gaia/` directory at its root. The harness loads these files automatically before running any agent.

```
your-repo/
└── .gaia/
    ├── gaia.json       ← structured config (paths, limits, forbidden files)
    ├── RULES.md        ← prose rules injected directly into every LLM prompt
    └── agents/         ← optional: override default agents with custom implementations
        ├── flutter-spec-author.ts
        └── flutter-implementer.ts
```

### `gaia.json` — structured configuration

Controls the agent's behavior: how many files it can touch, where to put new files, and what it must never modify.

```json
{
  "name": "my-flutter-app",
  "platform": "flutter",
  "version": "1.0.0",
  "config": {
    "maxFilesToTouch": 6,
    "requireTests": true,
    "targetBranch": "develop",
    "architecture": "clean_mvvm",
    "patterns": {
      "screen": "lib/src/presentation/screens/{name}_screen.dart",
      "viewmodel": "lib/src/presentation/viewmodels/{name}_viewmodel.dart",
      "test": "test/{feature}/{name}_test.dart"
    },
    "naming": {
      "classes": "PascalCase",
      "files": "snake_case",
      "variables": "camelCase"
    },
    "forbidden": ["lib/main.dart", "pubspec.yaml", "android/", "ios/"]
  }
}
```

### `RULES.md` — prose rules for the LLM

Written in plain Markdown. The harness injects the full content of this file into the system prompt of every agent (SpecAuthor, Implementer, Reviewer). This is the best place to define architecture decisions, coding conventions, and test requirements in human-readable form.

```markdown
# Gaia Agent Rules — my-flutter-app

## Architecture

This project follows Clean Architecture with MVVM...

## Code Rules

- Use Riverpod for state management — never setState at screen level
- No hardcoded strings — use AppStrings constants
  ...

## Test Rules

- Every screen must have a widget test
- Tests must cover: happy path, empty state, error state
  ...

## What NOT to do

- Do not modify lib/main.dart
- Do not add packages to pubspec.yaml without explicit task
```

> **Tip:** `RULES.md` is rendered beautifully on GitHub, making it easy for the team to read and maintain without touching JSON.

### Agent override (optional)

To fully replace a default agent with a custom implementation, place a TypeScript file in `.gaia/agents/`:

| File                        | Overrides                          |
| --------------------------- | ---------------------------------- |
| `{platform}-spec-author.ts` | SpecAuthor for that platform       |
| `{platform}-implementer.ts` | Implementer for that platform      |
| `{platform}-reviewer.ts`    | Reviewer for that platform         |
| `spec-author.ts`            | Generic SpecAuthor (all platforms) |

The loader checks for platform-specific files first, then generic, then falls back to the built-in default.

---

## Development

```bash
npm run dev          # Start with ts-node (watch-friendly)
npx tsc --noEmit     # Type check only
npm run lint         # ESLint
npm test             # Jest
npm run build        # Compile to dist/
npm start            # Run compiled build
```

---

## Deployment (Docker)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t gaia-code-harness .
docker run -p 3000:3000 --env-file .env gaia-code-harness
```

---

## Environment Variables Reference

| Variable            | Required | Description                                           |
| ------------------- | -------- | ----------------------------------------------------- |
| `DATABASE_URL`      | ✅       | PostgreSQL connection string                          |
| `GITHUB_TOKEN`      | ✅       | GitHub PAT with `repo` scope                          |
| `GITHUB_OWNER`      | ✅       | GitHub org or user name                               |
| `OPENAI_API_KEY`    | ⚠️       | Required for OpenAI-based agents                      |
| `ANTHROPIC_API_KEY` | ⚠️       | Required for Claude-based agents                      |
| `JIRA_BASE_URL`     | Optional | e.g. `https://your-org.atlassian.net`                 |
| `JIRA_EMAIL`        | Optional | Jira user email                                       |
| `JIRA_API_TOKEN`    | Optional | Jira API token                                        |
| `LOCAL_REPOS_PATH`  | Optional | Local path to repos for faster cloning in demo        |
| `REPOS_BASE_PATH`   | Optional | Workspace scratch dir (default `/tmp/gaia-workspace`) |
| `PORT`              | Optional | Server port (default `3000`)                          |

---

## Tech Stack

| Layer          | Technology                   |
| -------------- | ---------------------------- |
| Runtime        | Node.js 18+ / TypeScript 5.3 |
| HTTP Server    | Fastify 4                    |
| Database       | PostgreSQL 15 via `pg`       |
| Git operations | simple-git                   |
| LLM            | OpenAI SDK · Anthropic SDK   |
| Validation     | Zod                          |
| HTTP client    | Axios                        |

---

## Further Reading

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — deep-dive into the state machine, agent design, and data model
- [`docs/DEMO_GUIDE.md`](docs/DEMO_GUIDE.md) — step-by-step demo guide for non-technical stakeholders
- [`CLAUDE.md`](CLAUDE.md) — craftsman_lead instructions for Claude Code orchestration mode
- [`API.md`](API.md) — full REST API reference

---

## License

MIT © Rappi Engineering
