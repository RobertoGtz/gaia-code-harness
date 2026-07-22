# Architecture — GAIA Code Harness

> Internal technical documentation: state machine, agents, skills, notifiers, and backends.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT / CI / JIRA WEBHOOK                          │
│  (Postman, cURL, CI pipeline, or automatic webhook)                          │
└─────────────────────────────┬─────────────────────────────────────────────────┘
                              │ POST /jobs
                              │ { acceptanceCriteria, repo, module }
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REST API (Fastify)                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ POST /jobs  │  │GET /jobs/:id│  │POST /approve│  │ POST /retry         │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────┬─────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LEADER / ORCHESTRATOR                                │
│                                                                              │
│  State machine:                                                              │
│                                                                              │
│  pending ──► fetching_jira ──► spec_generating ──► spec_ready              │
│                                                          │                   │
│  done ◄── pr_created ◄── reviewing ◄── implementing ◄── spec_approved       │
│       │          │              │                │                           │
│       │          │              │                └─ reviewFeedback           │
│       │          │              │                   (closed-loop)            │
│       │          │              │                                            │
│       │          │              └─ REVIEW_ERROR / TEST_ERROR → retry        │
│       │          │                 (max 5 attempts)                          │
│       │          │                                                          │
│       │          └─ Mutation TEST_ERROR → retry                             │
│       │             (max 5 attempts)                                       │
│       │                                                                    │
│       └── Mutation pass → done                                              │
│                                                                              │
│  Error states: env_error, repo_error, build_error, spec_error, failed        │
│  (all accept POST /retry → pending)                                          │
│                                                                              │
│  All error states accept POST /retry → return to pending                     │
└──────────┬─────────────────┬─────────────────┬──────────────────────────────┘
           │                 │                 │
           ▼                 ▼                 ▼
┌──────────────────────────────────────────────────────────────┐
│                   AGENT REGISTRY                             │
│            getAgentsForPlatform(job.platform)                 │
│                                                              │
│  SpecAuthorAgent  ImplementerAgent  ReviewerAgent  MutationTesterAgent │
│  (generic)     execute()/executeTDD() (generic)  (auto, post-review)  │
│            │                  │                  │           │
│            └──────────────────┴──────────────────┘           │
│                  loadSkill(platform, repoPath)               │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    PLATFORM PLUGINS                          │
│                   src/plugins/{platform}/                    │
├──────────────┬──────────────────┬────────────────────────────┤
│  flutter     │      ios         │     android / flutter_web  │
├──────────────┼──────────────────┼────────────────────────────┤
│ flutter test │  swift test      │ gradle test                │
│ dart analyze │  swiftlint       │ lintDebug                  │
│ melos / pub  │  swift pkg res.  │ gradleSync                 │
│ prompt ctx   │  prompt ctx      │ prompt ctx                 │
└──────────────┴──────────────────┴────────────────────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
  Generate spec        Write code          Validate + Create PR
  (JSON files)         (Git commits)       (GitHub API)
        │                  │                  │
        └──────────────────┴──────────────────┘
                           │
                           ▼
              ┌──────────────────────┐
              │   PostgreSQL DB        │
              │   code_generation_jobs │
              └──────────────────────┘
```

---

## Data Flow

### 0. Orchestration Mode

The harness supports three modes; all use the same internal state machine:

| Mode                      | Entry point                        | State backend        | Use cases                         |
| ------------------------- | ---------------------------------- | -------------------- | --------------------------------- |
| **A — HTTP API**          | `npm run dev` → `POST /jobs`       | `PostgresBackend`    | CI/CD, Postman, integrations      |
| **B — CLI**               | `npx ts-node src/cli/run.ts --job` | `DiskBackend` (JSON) | Local development, demos, no DB   |
| **C — Webhook**           | `POST /webhook/trigger`            | `PostgresBackend`    | Jira, Slack, full automation      |
| **Claude Code (agents)**  | `.claude/agents/craftsman_lead`    | Disk files           | Conversational SDD cycle          |

`StateBackend` is an interface in `src/state/index.ts`; the Leader and HTTP routes import from `state/` — never directly from `db/`.

### 1. Job creation

The entry point varies by mode, but all reach the same `orchestrateJob()`:

```
Mode A  POST /jobs              → PostgresBackend.createJob() → orchestrateJob() [async]
Mode B  src/cli/run.ts --job    → DiskBackend.createJob()     → orchestrateJob() [blocking]
Mode C  POST /webhook/trigger   → PostgresBackend.createJob() → orchestrateJob() [async]
```

> All optional fields (`figmaUrl`, `jiraEpicId`, `description`, `module`) are
> supported in all three modes. The Jira webhook enriches them automatically from the ticket.

### 2. Spec Generation

```
Leader → SpecAuthorAgent.execute()
           ↓
    1. Explore repo structure
    2. Identify relevant files
    3. If job.figmaUrl: fetch Figma design context via src/tools/figma.ts
       → injected into the spec prompt + saved as design-figma-context.md
    4. LLM → TechnicalSpec JSON
    5. LLM → scenarios.feature (Gherkin, non-blocking)
           ↓
    DB: status='spec_ready'
    Waits: POST /approve
```

### 3. Human Approval

The mechanism varies by mode:

```
Mode A  Tech Lead → POST /jobs/:id/approve   [manual, blocks until called]
Mode B  CLI flag --approve                   [automatic on startup]
Mode C  Automatic                            [no pause; webhook triggers full pipeline]
```

In all three cases, once the spec is approved:

```
DB/Disk: status='spec_approved'
Leader.continue() → ImplementerAgent.execute()
```

### 4. Implementation

```
ImplementerAgent:
  job.tddMode=false → execute() [bulk mode]
    1. Setup repo → GaiaRepoError if clone fails
    2. skill.verifyEnvironment() → GaiaEnvError if SDK missing
    3. Create branch → GaiaRepoError if branch creation fails
    4. skill.build() → GaiaBuildError if dependency resolution fails
    5. For each task (bulk): generate/modify code with LLM
    6. skill.test() → GaiaTestError if tests fail (up to 5 fix loops)
    7. commit & push → GaiaRepoError if push fails

  job.tddMode=true → executeTDD() [Red-Green-Refactor]
    1-4. Same setup as execute()
    5. Write all impl files (non-test) first
    6. Verify impl compiles
    7. For each test task (one at a time):
       RED   → write test → confirm it fails
       GREEN → fixAllFiles() with LLM → confirm it passes
    8. Final fix loop (up to 5) to cover any remaining failures
    9. commit & push

  → success: DB status='reviewing'
  → catch GaiaError: return { success:false, errorCode }
  Leader → ERROR_STATUS[errorCode] → granular error state
```

### 5. Review and Mutation Testing

```
ReviewerAgent:
  0. Read handoff.md from ImplementerAgent (state context)
  1. Lint: dart analyze / swiftlint / lintDebug + ktlintCheck
  2. Tests: flutter test / swift test / gradle testDebugUnitTest
  3. Verify changes vs spec (file count, traceability)
  4. LLM review: few-shot evaluator scores the diff 0-100
     → issues are concrete and actionable
     → if passed=false, return REVIEW_ERROR with feedback
  5. Create GitHub PR
  6. Comment on Jira (optional)
  7. Write handoff.md for MutationTesterAgent
  → DB: status='pr_created'

MutationTesterAgent (automatic, post-review):
  0. Read handoff.md from ReviewerAgent
  For each modified production file:
    1. Prefer deterministic mutator (tools/mutate.py); fallback to LLM mutations
    2. Apply mutation → run tests → revert
    3. KILLED = tests failed (good) / SURVIVED = tests missed defect (bad)
  Score = killed/total × 100
  ≥ 80% → PASS
  < 80% → return TEST_ERROR with survived mutant details
  Report: progress/mutation_{jobId}.md
  → DB: status='done' if pass
  → Closed-loop: feedback to ImplementerAgent (max 5 retries) if fail
```

### Closed-loop feedback

When `ImplementerAgent` returns `test_error` during implementation, when `ReviewerAgent` returns `REVIEW_ERROR` or `TEST_ERROR`, or when `MutationTesterAgent` detects surviving mutants, the `Leader` does not simply mark the job as failed: it persists the feedback in the job's `reviewFeedback` and returns to `implementing`. `ImplementerAgent` injects that feedback into its system prompt on the next iteration. Each loop allows up to 5 retries (implementation, `REVIEW_ERROR` / `TEST_ERROR`, and `MutationTester`) before entering a granular error state (`review_error` / `test_error`).

---

## Data Structure

### PostgreSQL Schema

```sql
CREATE TABLE code_generation_jobs (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jira_ticket_id TEXT,
  jira_epic_id TEXT,
  initiative_id TEXT NOT NULL,

  -- Requirements
  title TEXT NOT NULL,
  platform TEXT NOT NULL,  -- flutter | flutter_web | ios | android
  repo TEXT NOT NULL,
  module TEXT,             -- e.g. home_screen, checkout (optional)
  target_branch TEXT NOT NULL DEFAULT 'develop',

  -- Context
  description TEXT,
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  figma_url TEXT,
  technical_constraints JSONB DEFAULT '[]',

  -- Limits and modes
  max_files_to_touch INTEGER DEFAULT 5,
  require_tests BOOLEAN DEFAULT true,
  tdd_mode BOOLEAN DEFAULT false,   -- Red-Green-Refactor cycle when true

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',
  current_agent TEXT,
  progress_logs JSONB NOT NULL DEFAULT '[]',

  -- Outputs
  spec JSONB,              -- generated TechnicalSpec
  branch_name TEXT,
  pr_url TEXT,
  pr_id TEXT,

  -- Error handling
  error_context JSONB,     -- ErrorContext set when the job enters an error state

  -- Closed-loop review feedback
  review_feedback TEXT,    -- Issues from ReviewerAgent/MutationTesterAgent for retry

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_jobs_status ON code_generation_jobs(status);
CREATE INDEX idx_jobs_initiative ON code_generation_jobs(initiative_id);
```

### ErrorContext (`error_context` JSONB column)

When a job fails, the Leader persists a structured object with all diagnostic information:

```json
{
  "code": "BUILD_ERROR",
  "stage": "implementing",
  "message": "[Flutter] `flutter pub get` failed — dependency resolution error in my-org/my-repo",
  "detail": "Because dependency_x >=2.0.0 requires sdk >=3.0.0…\n… (truncated at 1500 chars)",
  "timestamp": "2026-06-16T19:00:00.000Z",
  "retryCount": 1
}
```

| Field        | Type        | Description                                                    |
| ------------ | ----------- | -------------------------------------------------------------- |
| `code`       | `ErrorCode` | Machine-readable category (`ENV_ERROR`, `REPO_ERROR`, etc.)    |
| `stage`      | `JobStatus` | Status in which the job failed                                 |
| `message`    | `string`    | Human-readable summary with platform and failed command        |
| `detail`     | `string?`   | Trimmed stderr (max 1 500 chars) via `trim()` in `errors.ts`   |
| `timestamp`  | `string`    | ISO 8601                                                       |
| `retryCount` | `number`    | Automatic retries before entering an error state               |

---

## Error Handling

### Granular error states

Instead of a generic `failed` state, the Leader transitions to specific states according to the error type reported by the agent:

| State          | `ErrorCode`    | Cause                                                        | Auto retry                               |
| -------------- | -------------- | ------------------------------------------------------------ | ---------------------------------------- |
| `env_error`    | `ENV_ERROR`    | SDK not installed (Flutter, Xcode, JDK/Android SDK)        | No                                       |
| `repo_error`   | `REPO_ERROR`   | Clone, branch creation or push failed                        | No                                       |
| `build_error`  | `BUILD_ERROR`  | `pub get` / `gradle sync` / `swift package resolve` failed | No                                       |
| `test_error`   | `TEST_ERROR`   | Tests or lint failed after implementation or mutation      | Yes (up to 5× closed-loop)               |
| `review_error` | `REVIEW_ERROR` | LLM review, file count or spec traceability failed           | Yes (up to 5×) closed-loop → implementing |
| `spec_error`   | `SPEC_ERROR`   | LLM could not generate a valid spec                          | No                                       |
| `failed`       | `UNKNOWN`      | Unexpected error                                             | Yes (up to 5×)                           |

### Error flow

```
Skill throws GaiaError (typed subclass)
  ↓
Agent.execute() — catch block
  return { success: false, error: err.message, errorCode: err.code }
  ↓
Leader.handleImplementing() / handleReviewing()
  1. Read result.errorCode
  2. ERROR_STATUS[errorCode] → granular JobStatus
  3. setErrorContext(jobId, ctx)  ← persisted in DB
  4. If retryable && retryCount < max → retry automatically
  5. Otherwise → updateJobStatus(jobId, errorStatus)
  6. printErrorBox(job, ctx)  ← error box in terminal
```

### Error classes (`src/errors.ts`)

| Class             | `ErrorCode`    | Thrown from                                     |
| ----------------- | -------------- | ----------------------------------------------- |
| `GaiaEnvError`    | `ENV_ERROR`    | `skill.verifyEnvironment()`                     |
| `GaiaRepoError`   | `REPO_ERROR`   | `setupRepository()`, `createBranch()`, `push()` |
| `GaiaBuildError`  | `BUILD_ERROR`  | `skill.build()`                                 |
| `GaiaTestError`   | `TEST_ERROR`   | `skill.test()`, `skill.analyze()`               |
| `GaiaReviewError` | `REVIEW_ERROR` | File count guard, traceability check            |
| `GaiaSpecError`   | `SPEC_ERROR`   | `SpecAuthorAgent` (LLM failures)                |

All inherit from `GaiaError` which exposes `code: ErrorCode`, `message`, and `detail?`.

### Terminal error box

When a job enters an error state, this is printed:

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║ ✖  GAIA — JOB FAILED                                            ║
║ 16/06/2026, 19:00:00                                            ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║ ERROR DETAILS                                                    ║
║  ────────────────────────────────────────────────────────────  ║
║ 📦  BUILD ERROR  — Dependency resolution failed                  ║
║ Stage:   implementing                                           ║
║ Message: [Flutter] `flutter pub get` failed — my-org/my-repo    ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║ JOB                                                              ║
║ ID:       3f2a1b4c-...                                          ║
║ Platform: flutter                                               ║
║ Repo:     my-org/my-repo                                        ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║ NEXT STEP                                                        ║
║ Fix pubspec.yaml / build.gradle / Package.swift,                ║
║ then POST /jobs/:id/retry                                        ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Agents and Plugins

### Generic Architecture + Plugins

All jobs share **three generic agents**. Platform-specific logic lives in `src/plugins/{platform}/`. Agents load the right plugin at runtime with `loadSkill(job.platform, repoPath)`:

```
src/
├── agents/
│   ├── spec-author.ts      ← unique for all platforms
│   ├── implementer.ts      ← execute() + executeTDD()
│   ├── reviewer.ts         ← unique for all platforms
│   ├── mutation-tester.ts  ← runs automatically post-review
│   └── registry.ts         ← PlatformAgents: specAuthor, implementer, reviewer, mutationTester
├── state/
│   ├── index.ts            ← StateBackend interface + setStateBackend()/getStateBackend()
│   ├── postgres-backend.ts ← Adapter — Modes A and C (HTTP/Webhook + Postgres)
│   └── disk-backend.ts     ← Adapter — Mode B (CLI + disk)
├── cli/
│   └── run.ts              ← CLI entry point: --list, --job, --id
└── plugins/
    ├── index.ts            ← loadSkill() with override logic
    ├── flutter/index.ts    ← built-in PlatformSkill
    ├── flutter_web/index.ts
    ├── ios/index.ts
    └── android/index.ts
```

**Execution flow:**

```typescript
const agents = getAgentsForPlatform(job.platform);
// agents = { specAuthor, implementer, reviewer, mutationTester }

await agents.specAuthor.execute(context);
// internally: const skill = await loadSkill(job.platform)
//             const ctx = skill.getPromptContext(job)

// Normal mode:
await agents.implementer.execute(context);
// TDD mode (job.tddMode === true):
await agents.implementer.executeTDD(context);
// Leader picks automatically based on job.tddMode

// MutationTester always runs after the reviewer:
await agents.mutationTester.execute(context);
// score ≥ 80% → PASS | < 80% → warn (non-blocking)
```

**To add a new platform:**

1. Create `src/plugins/{new_platform}/index.ts` implementing `PlatformSkill`
2. Add the `case` in `loadSkill()` inside `src/plugins/index.ts`
3. All generic agents use it automatically — no agent changes needed

---

### PlatformSkill Interface

Defines the contract every plugin must fulfill (`src/plugins/index.ts`):

| Method                        | Responsibility                                               |
| ----------------------------- | ------------------------------------------------------------ |
| `verifyEnvironment(repoPath)` | Verify toolchain is available                                |
| `build(repoPath, module?)`    | Resolve dependencies (pub get, gradle sync, spm resolve…)    |
| `test(repoPath, module?)`     | Run the full test suite                                      |
| `analyze(repoPath, module?)`  | Lint / static analysis (module-aware for monorepos)          |
| `getPromptContext(job)`       | Return system prompts + file patterns + forbidden packages     |

---

### SpecAuthorAgent (generic)

**Process:**

1. `loadSkill(platform, repoPath)` → get `promptCtx` (with override if `<repo>/.gaia/plugins/<platform>/index.js` exists)
2. Setup repo via `setupRepository`
3. Explore repo structure
4. Identify relevant files
5. `createPluginLoader(repoPath)` → reads cloned repo's `docs/RULES.md` + `docs/UNIT_TESTS.md` + `docs/gaia.json`
6. LLM call → `TechnicalSpec` JSON (requirements, design, tasks)
7. LLM call → `scenarios.feature` (Gherkin) — **non-blocking**: if it fails, logged as warning and pipeline continues
8. Save to disk: `requirements.json`, `design.json`, `tasks.json`, `scenarios.feature`
9. Write `handoff.md` for `ImplementerAgent`

### ImplementerAgent (generic)

**`execute()` — bulk mode:**

1. `loadSkill(platform, repoPath)` → `verifyEnvironment`, `build`, `getPromptContext`
2. Setup repo + create branch
3. `skill.build()` → resolve deps
4. Read `handoff.md` from previous agent and `reviewFeedback` from prior reviewer/mutation loop
5. Inject into `implementerSystem`: `[reviewFeedback +] [handoff +] [gherkinScenarios +] [repoRules +] promptCtx.implementerSystem`
6. For each task: generate/modify code with LLM (bulk)
7. `skill.test()` → up to 5 LLM fix loops if tests fail
8. Commit & push
9. Write `handoff.md` for `ReviewerAgent`

**`executeTDD()` — Red-Green-Refactor mode (same PluginLoader applied):**

1–3. Same setup as `execute()`.  
4. Read `handoff.md` and `reviewFeedback` (same as bulk).  
5. Write all impl files (non-test) to establish compile baseline.  
6. For each test task, in order:

- **RED**: write test → confirm it fails for the right reason
- **GREEN**: `fixAllFiles()` with LLM → confirm it passes

7. Final fix loop (up to 5) to cover any remaining failures
8. Commit & push
9. Write `handoff.md` for `ReviewerAgent`

### MutationTesterAgent (automatic)

**Process:**

1. Read `handoff.md` from previous agent
2. Collect modified production files in the job (excludes tests)
3. For each file: ask LLM for 3-5 simple mutations
4. Apply mutation → `skill.test()` → revert
5. `KILLED` = tests failed (good); `SURVIVED` = tests passed with broken code (bad)
6. Score ≥ 80% → PASS; < 80% → return `TEST_ERROR` with survived mutant details
7. Leader persists feedback in `reviewFeedback` and re-runs `ImplementerAgent` (≤ 5 retries)
8. Write `progress/mutation_{jobId}.md`
9. Write final `handoff.md` (end of pipeline)

### ReviewerAgent (generic)

**Process:**

1. Read `handoff.md` from previous agent
2. `loadSkill(platform, repoPath)` → `verifyEnvironment`, `analyze`, `test`
3. `skill.analyze()` → lint (non-blocking, warnings only)
4. `skill.test()` → tests must pass (blocking)
5. Verify `modifiedFiles ≤ maxFilesToTouch`
6. Traceability: spec must exist
7. LLM review (few-shot evaluator): score 0-100; return `REVIEW_ERROR` with concrete issues if not passed
8. Create GitHub PR with body from `generatePRBody()`
9. Comment on Jira (optional)
10. Write `handoff.md` for `MutationTesterAgent`
11. Write `review_report.md` with score and issues

**Dry-run mode:** If `GITHUB_TOKEN` is not set, returns a mock PR.

---

### Toolchains by platform

| Platform      | build                                                                | test                        | analyze                              | Tool file          |
| ------------- | -------------------------------------------------------------------- | --------------------------- | ------------------------------------ | ------------------ |
| `flutter`     | `flutter pub get` / `melos bootstrap`                                | `flutter test`              | `dart analyze`                       | `test-runner.ts`   |
| `flutter_web` | `flutter pub get`                                                    | `flutter test`              | `dart analyze` + forbidden pkg check | `test-runner.ts`   |
| `ios`         | `swift package resolve` (default), `tuist build`, `xcodebuild build` | `xcodebuild test`           | `swiftlint` (module-aware)           | `xcode-runner.ts`  |
| `android`     | `gradlew dependencies`                                               | `gradlew testDebugUnitTest` | `lintDebug`                          | `gradle-runner.ts` |

---

### iOS Plugin (`src/plugins/ios/index.ts`)

The iOS skill is calibrated for a large-scale monorepo based on **Tuist + Swift Package Manager**. Its responsibilities:

1. **Detect project type**
   - If the root directory contains `.xcodeproj`, `.xcworkspace`, `Tuist.swift` or `Workspace.swift`, assume a Tuist monorepo.
   - If only `Package.swift` exists, fall back to a flat SPM project.

2. **Build strategy (`buildStrategy` in job: `resolve` | `xcodebuild` | `tuist` | `auto`)**
   - `resolve` (recommended default for large Tuist monorepos): only runs `swift package resolve`. Fast, does not compile the module; leaves compilation validation for CI.
   - `tuist`: runs `tuist build [scheme]` (with prior `tuist generate` if needed). Choose this when you want full local validation and the repo supports a simulator.
   - `xcodebuild`: runs `xcodebuild build` with the `module` (or `App`) scheme.
   - `auto` (default): tries `tuist build`, then `xcodebuild build`, and finally falls back to `swift package resolve` if everything fails.
   - `xcode-runner.ts` discovers the correct flag (root `-workspace` if it exists, then module `-project`) and picks an available iOS simulator with `xcrun simctl list devices`.

3. **Test**
   - `skill.test(repoPath, module)` runs `xcodebuild test` with the same workspace/project and scheme discovery.
   - For flat SPM it uses `swift build` as a test proxy (there is no cross-platform test command without Xcode).

4. **Analyze (lint)**
   - `skill.analyze(repoPath, module)` runs `swiftlint lint`.
   - If `module` is provided and a `.swiftlint.yml` exists inside the module folder (`features/{Module}/{Module}Feature/.swiftlint.yml`), the linter runs from that directory to apply the module's local configuration. Otherwise it lints from root.

5. **Prompt context (`getPromptContext`)**
   - Includes monorepo-specific architectural rules: MVVM + Coordinator, VIPER, SwiftUI Feature, `Feature` / `FeatureInterface` modules, `@Inject` + `MainComponent.resolve`, Design System, and prohibitions (no force unwrap, no UIKit in business logic, etc.).
   - Path placeholders use the convention `{Module}Feature/Sources/...` and `{Module}FeatureInterface/Sources/...`.

The Xcode runner is tested in `tests/xcode-runner.test.ts` and the plugin in `tests/ios-skill.test.ts`, both with mocks of `child_process` and `fs/promises`.

---

## Plugin System

### How it works

Each agent calls `loadSkill(platform, repoPath)` **after** cloning the repo. The function follows this precedence:

```
1. <repo>/.gaia/plugins/<platform>/index.js   ← complete skill override (build, test, analyze, prompts)
2. src/plugins/<platform>                      ← harness built-in (fallback)
```

In addition, if the repo contains files in `docs/`, the `PluginLoader` injects them as extra context in LLM prompts:

```
3. <repo>/docs/RULES.md        ← free-form code rules in markdown
4. <repo>/docs/UNIT_TESTS.md   ← testing conventions
5. <repo>/docs/gaia.json       ← structured config (patterns, naming, rules)
```

### Structure in the project repo

```
my-repo/
├── .gaia/
│   └── plugins/
│       └── ios/
│           └── index.js     ← complete override (optional)
└── docs/
    ├── gaia.json            ← manifest + config (optional)
    ├── RULES.md             ← code rules (optional)
    └── UNIT_TESTS.md        ← testing conventions (optional)
```

### Files the harness reads in the project repo

| File                                | Required | For what                                                              |
| ----------------------------------- | --------- | --------------------------------------------------------------------- |
| `.gaia/plugins/<platform>/index.js` | No        | Complete skill override: build, test, analyze, getPromptContext       |
| `docs/gaia.json`                    | No        | Manifest: name, version, config (patterns, naming, codeRules...)     |
| `docs/RULES.md`                     | No        | Free-form code/test rules — injected as LLM context                    |
| `docs/UNIT_TESTS.md`                | No        | Specific testing rules — injected as LLM context                       |

> If `docs/RULES.md` exists, the `codeRules`, `testRules`, and `forbidden` fields in `gaia.json` are omitted to avoid duplication. `RULES.md` takes priority.

### No files in the repo

If the repo has none of these files, the harness uses the built-in `src/plugins/<platform>` with its default prompt context. **Behavior is identical to before**.

### Complete gaia.json example

```json
{
  "name": "my-flutter-project",
  "platform": "flutter",
  "version": "1.0.0",
  "agents": {
    "specAuthor": "flutter-spec-author.ts",
    "implementer": "flutter-implementer.ts",
    "reviewer": "flutter-reviewer.ts"
  },
  "config": {
    "maxFilesToTouch": 10,
    "requireTests": true,
    "targetBranch": "develop",
    "architecture": "clean",
    "patterns": {
      "widget": "lib/src/presentation/widgets/{Name}.dart",
      "repository": "lib/src/data/repositories/{Name}Repository.dart",
      "test": "test/{name}_test.dart"
    },
    "naming": {
      "widget": "PascalCase",
      "test": "snake_case_test"
    },
    "codeRules": [
      "Use BLoC for state management",
      "No business logic in widgets"
    ],
    "testRules": [
      "Every widget has a golden test",
      "Mocks with mocktail, not mockito"
    ],
    "forbidden": ["lib/src/core/di/injection.dart", "pubspec.yaml"]
  }
}
```

---

## Security and Control

### Human-in-the-Loop

| Checkpoint    | Who       | What they decide                |
| ------------- | --------- | ------------------------------- |
| Spec approval | Tech Lead | Is the technical spec correct?  |
| PR review     | Dev Team  | Does the code meet standards?  |

### Automatic Limits

- `maxFilesToTouch`: Prevents massive, unreviewable changes
- `requireTests`: Enforces tests for each feature
- `tddMode`: Activates Red-Green-Refactor (one test at a time)
- Mandatory lint: dart analyze (Flutter) / swiftlint (iOS) / lintDebug (Android)
- Mandatory tests: flutter test / swift test / gradle test
- **Mutation Tester**: automatically validates that tests catch real defects (≥80% kill rate)

### Audit

Everything is saved in DB:

- Every status change
- Every progress log
- Generated spec
- Modified files
- Created PR

---

## Scalability

### Vertical (more resources)

- PostgreSQL can scale vertically
- Leader processes one job at a time (by design)
- Each job is independent

### Horizontal (more instances)

- Multiple API server instances
- Load balancer distributes requests
- All read/write to the same DB

### Async Processing

- Leader runs async after POST /jobs
- Immediate response to client
- Polling for status updates

---

## Configuration

### Critical Environment Variables

```bash
# Server
PORT=3000

# Database
DATABASE_URL=postgresql://...

# GitHub (to create PRs)
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=your-org

# Jira (optional)
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=...
JIRA_API_TOKEN=...

# LLM (for real code generation)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Workspace
REPOS_BASE_PATH=/tmp/gaia-workspace

# Mode B (CLI) — no DB required
LOCAL_REPOS_PATH=/path/to/repos   # local repos instead of cloning from GitHub

# Mode C (Webhook)
WEBHOOK_SECRET=...                # HMAC-SHA256 to verify X-GAIA-Signature
DEFAULT_REPO=your-org/your-repo   # default repo if Jira ticket has no repo label
DEFAULT_PLATFORM=flutter          # default platform if ticket has no label
```

---

## Deployment

### Local Development

```bash
npm install
npm run db:init
npm run dev
```

### Production (Docker)

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

### AWS ECS + RDS

- ECS task with `DATABASE_URL` pointing to RDS PostgreSQL
- Secrets in AWS Secrets Manager, not plain environment variables
- See `docs/guides/production.md` for the full checklist

---

## Metrics

| Metric            | Current Value  | Target       |
| ----------------- | -------------- | ------------ |
| Jobs/hour         | 10 (estimated) | 50+          |
| Success rate      | 80% (estimated)| 95%+         |
| Avg time          | 5 min          | 2 min        |
| Human checkpoints | 2              | 2 (keep)     |

---

## Design Decisions

### Why PostgreSQL instead of SQLite?

- Real persistence between restarts
- Better concurrency handling
- Horizontal scalability
- Standard backups

### Why Fastify instead of Express?

- Better performance
- Native async/await
- Integrated schema validation
- Less overhead

### Why explicit state machine?

- Easier debugging
- Clear error recovery
- Process visibility
- Simpler testing

### Why three modes?

- **Mode A** (HTTP): integrable into any CI/CD, allows remote monitoring and approval.
- **Mode B** (CLI): zero infrastructure, ideal for local development and quick demos.
- **Mode C** (Webhook): fully automatic; external systems (Jira, Slack) trigger the pipeline without manual intervention.

All three share the same `leader.ts` and agents — the difference is only the input adapter and state backend.

### Why human-in-the-loop?

- Quality > Speed
- Human accountability
- Reduces risk of errors
- Process compliance

---

**Related documentation:**

- [`API.md`](../API.md) — Complete REST + Webhook endpoint reference
- [`docs/guides/setup.md`](../guides/setup.md) — Installation and configuration per platform
- [`docs/guides/production.md`](../guides/production.md) — Pre-production checklist
