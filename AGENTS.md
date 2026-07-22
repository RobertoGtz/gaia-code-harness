# AGENTS.md — Navigation Map for AI Agents

> Entry point for any agent working in this repository.
> NOT a bible of rules: it is a **map**. Read only what you need
> when you need it (progressive disclosure).
>
> **GAIA Code Harness** — supports three orchestration modes simultaneously:
>
> - **Mode A — HTTP + Postgres** (production/demo): `npm run dev` → `POST /jobs`
> - **Mode B — CLI + disk** (artisan/local): `npx ts-node src/cli/run.ts --job job.json`
> - **Mode B (from Claude Code)**: `.claude/commands/gaia_code_generator.md` → slash command `/gaia_code_generator` with the same pipeline and agents
> - **Mode C — Webhook + Postgres** (CI integration): `POST /webhook/trigger`

---

## 1. Before you start (mandatory)

1. Run `./init.sh` and verify it finishes without errors. If it fails, **stop**
   and fix the environment before touching code.
2. Read `progress/current.md` to understand the state left by the last session.
3. Read `feature_list.json`. Every new feature (`"sdd": true`) goes through the
   five-phase pipeline — see `docs/engineering/workflow.md` and §4.
4. Read `docs/engineering/workflow.md` before coordinating anything.

---

## 2. Repository map

### Orchestration files (Claude Code mode)

| File / folder                                  | What it contains                                                                                            | When to read it                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `feature_list.json`                          | Task list with status (`pending / spec_ready / in_progress / done / blocked`)                              | Always, at the start                      |
| `progress/current.md`                        | Current session state                                                                                       | Always, at the start                      |
| `progress/history.md`                        | Append-only log of previous sessions                                                                      | If you need historical context            |
| `project-spec.md`                            | Conversational spec: purpose, contract, and decisions per feature                                         | Before distilling Gherkin or implementing |
| `features/<name>.feature`                    | Gherkin scenarios (the executable contract the human approves)                                             | Before starting the TDD cycle           |
| `docs/engineering/workflow.md`               | Full pipeline and insights for each phase                                                                 | Before coordinating                       |
| `docs/engineering/tdd.md`                    | The Three Laws of TDD; the Red-Green-Refactor cycle                                                         | Before writing code                       |
| `docs/engineering/gherkin.md`                | How to write `.feature`; from Gherkin to test                                                               | Before drafting/reading scenarios         |
| `docs/engineering/mutation-testing.md`       | Why and how; threshold; using `tools/mutate.py`                                                           | Before validating the suite               |
| `CHECKPOINTS.md`                             | Objective "final state correct" criteria                                                                  | For self-evaluation                       |
| `tools/mutate.py`                            | Dependency-free deterministic mutator (Python, TS, Swift, Kotlin)                                         | Mutation phase                            |
| `.claude/identity.json`                      | Style preferences and technical domains for Claude Code                                                   | When starting Claude Code                 |
| `.claude/package-manager.json`               | Project package manager (`npm`)                                                                           | When installing/updating dependencies     |
| `.claude/agents/`                            | `craftsman_lead`, `spec_partner`, `gherkin_author`, `tdd_craftsman`, `judge`, `mutation_tester`           | If you orchestrate work                   |
| `.claude/commands/gaia_code_generator.md`    | `/gaia_code_generator` slash command to launch Mode B (CLI) from Claude Code with the same agents         | If you want to run GAIA without typing CLI |
| `.claude/rules/security-and-conventions.md`  | Project security guardrails and conventions                                                               | Always, before acting                     |
| `.claude/skills/gaia/SKILL.md`               | GAIA project knowledge base for Claude Code                                                               | When you need deep context                |
| `.claude/team/gaia-team-config.json`         | Shared config: skills, commands, rules, and active agents                                                   | When configuring the team                 |
| `.claude/workflows/`                         | Multi-step procedures (security review, release, add platform)                                          | When the workflow applies                 |
| `.claude/research/gaia-research-playbook.md` | Structured research guide before writing specs                                                            | Before ambiguous specs                    |
| `docs/guides/claude-mode.md`                 | How to use GAIA in `.claude` mode (Claude Code)                                                           | To learn the manual/chat mode             |
| `docs/guides/claude-vs-gaia-agents.md`       | When to use GAIA agents vs `.claude/agents`                                                               | To decide execution mode                  |

### TypeScript harness files (HTTP mode)

| File / folder                      | What it contains                                                                                 | When to read it                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `src/agents/`                      | `SpecAuthorAgent`, `ImplementerAgent` (+ `executeTDD()`), `ReviewerAgent`, `MutationTesterAgent` | If you modify TS agents             |
| `src/tools/`                       | `jira.ts`, `figma.ts`, `llm.ts`, `repo.ts`, `git.ts`, test runners                               | If you modify external integrations |
| `src/state/`                       | `StateBackend` interface + `PostgresBackend` + `DiskBackend`                                     | If you modify persistence           |
| `src/harness/leader.ts`            | State machine — orchestrates the 4 TS agents                                                     | If you modify the HTTP flow         |
| `src/api/routes/jobs.ts`           | `POST /jobs` with `tddMode` flag                                                                 | If you modify the REST API          |
| `src/cli/run.ts`                   | CLI entry point for Claude Code mode with DiskBackend                                            | If you modify the TS CLI            |
| `src/db/index.ts`                  | Postgres schema + `tdd_mode` column                                                              | If you modify the DB                |
| `src/types/index.ts`               | `CodeGenerationJob`, `CreateJobRequest` with `tddMode`                                         | If you modify types                 |
| `docs/engineering/architecture.md` | Deep technical architecture (dual-mode, agents, state machine)                                   | Before structural changes           |
| `API.md`                           | Complete REST API reference                                                                      | Before integrating HTTP mode        |

---

## 3. Hard rules (non-negotiable)

- **One feature at a time.** Do not mix changes from multiple tasks.
- **Do not declare a task `done`** without green tests AND mutation threshold
  met (`tools/mutate.py` or `MutationTesterAgent.ts`).
- **Do not skip the spec conversation or Gherkin distillation.** Every
  feature with `"sdd": true` goes through `spec_partner` and `gherkin_author`.
- **Do not skip the human approval gate** over `.feature` files. The
  `craftsman_lead` stops the flow at `spec_ready` and waits.
- **Strict TDD: one test at a time.** No production without a red test
  asking for it (`docs/engineering/tdd.md`).
- **Document what you do** in `progress/current.md` while you work.
- **Leave the repository clean** before closing the session (see §5).
- **If you don't know something, search `docs/`** before inventing it.
- **Do not touch `src/` or `tests/` directly** — delegate to `tdd_craftsman`.

---

## 4. Workflow — Claude Code mode (pipeline)

```
pending
  → [spec_partner]    conversation → project-spec.md
  → [gherkin_author]  project-spec.md → features/<name>.feature   (status: spec_ready)
  → ⏸ HUMAN APPROVES the scenarios  ← only approval gate
  → in_progress
  → [tdd_craftsman]   Red → Green → Refactor (one test at a time, if tddMode=true)
                      or bulk implementer (tddMode=false)
  → [judge]           full review
  → [mutation_tester] python3 tools/mutate.py; validate ≥80% kill rate
  → done
```

### Claude Code ↔ HTTP mode mapping (TypeScript)

| Claude Code agent | TypeScript equivalent                                          | Key difference                                                                         |
| ----------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `spec_partner`    | `SpecAuthorAgent` (+ `src/tools/figma.ts` if `job.figmaUrl`)   | Conversational (Claude) vs bulk (TS); TS mode reads Figma design automatically          |
| `gherkin_author`  | _(part of SpecAuthorAgent)_                                    | Separated in Claude mode                                                               |
| `tdd_craftsman`   | `ImplementerAgent.executeTDD()`                                | Active when `tddMode: true`                                                            |
| _(bulk)_          | `ImplementerAgent.execute()`                                   | `tddMode: false` (default)                                                             |
| `judge`           | `ReviewerAgent`                                                | Judge blocks; reviewer does not block lint                                             |
| `mutation_tester` | `MutationTesterAgent.ts`                                         | Claude mode blocks; HTTP/Webhook closed-loop feedback → ImplementerAgent (≤ 5×)        |

---

## 5. Session close (lifecycle)

Before finishing:

1. Run `./init.sh` — everything green.
2. Run `python3 tools/mutate.py <touched_file>` — meet the threshold.
3. If the task is done: mark `status: "done"` in `feature_list.json`.
4. Move the summary from `progress/current.md` to the end of `progress/history.md`.
5. Empty `progress/current.md` leaving only the base template.
6. Do not leave temporary files, debug prints, or TODOs without context.

---

## 6. If you get stuck

- Re-read the relevant section of `docs/`.
- If something does not compile or the test does not run as expected, **do not invent a workaround**:
  document the blocker in `progress/current.md` and stop the session.
- For environment issues (missing SDK, Node version, Postgres down): `./init.sh` shows them.
