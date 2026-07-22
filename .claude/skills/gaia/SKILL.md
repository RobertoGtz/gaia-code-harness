---
name: gaia-code-harness
description: Knowledge base for the GAIA Code Harness project. Architecture, operation modes, agent pipeline, artifacts, and rules.
scope: project
createdAt: "2026-07-15T00:00:00.000Z"
---

# GAIA Code Harness

> LLM agent orchestration system for software development with TDD, Gherkin, review, and mutation testing.

---

## When to use this skill

Use this skill when working inside the `gaia-code-harness` repository or coordinating GAIA jobs in any of its three modes.

## Overview

GAIA supports **three orchestration modes** simultaneously:

| Mode | How it starts | Backend | Approval |
|---|---|---|---|
| **HTTP API** | `npm run dev` → `POST /jobs` | PostgreSQL | `POST /jobs/:id/approve` |
| **CLI** | `npx ts-node src/cli/run.ts --job job.json` | Disk JSON | `--approve` flag |
| **Webhook** | `POST /webhook/trigger` | PostgreSQL | Automatic |
| **`.claude`** | Conversation with Claude Code | Markdown + `feature_list.json` | Human gate on Gherkin |

## 5-phase pipeline

```
pending
  → [Spec] project-spec.md
  → [Gherkin] features/<name>.feature
  → ⏸ HUMAN APPROVES
  → in_progress
  → [Implementation] src/ + tests/ in the workspace
  → [Review] progress/judge_<name>.md
  → [Mutation] progress/mutation_<name>.md
  → done
```

The **only human approval gate** is after the Gherkin scenarios.

## Agent mapping

| Phase | `.claude/agents/` | GAIA TypeScript | Artifact |
|---|---|---|---|
| Spec | `spec_partner` | `SpecAuthorAgent` | `project-spec.md` |
| Gherkin | `gherkin_author` | `SpecAuthorAgent` (2nd LLM call) | `features/<name>.feature` |
| Approval | `craftsman_lead` | `--approve` / `POST /jobs/:id/approve` | — |
| Implementation | `tdd_craftsman` | `ImplementerAgent.executeTDD()` | `src/` + `tests/` |
| Bulk | — | `ImplementerAgent.execute()` | `src/` + `tests/` |
| Review | `judge` | `ReviewerAgent` | `progress/judge_<name>.md` |
| Mutation | `mutation_tester` | `MutationTesterAgent` | `progress/mutation_<name>.md` |

## Key architecture

- `src/harness/leader.ts` — state machine that orchestrates the 4 TS agents.
- `src/state/` — `StateBackend` with `PostgresBackend` and `DiskBackend`.
- `src/agents/` — `SpecAuthorAgent`, `ImplementerAgent`, `ReviewerAgent`, `MutationTesterAgent`.
- `src/plugins/` — `flutter_web/`, `ios/`, `android/`; each implements `PlatformSkill`.
- `src/tools/` — utilities for Git, GitHub, Jira, Slack, files, tests, mutation.
- `src/api/routes/` — REST endpoints (`jobs.ts`, `webhook.ts`).
- `src/cli/run.ts` — entry point for Mode B (CLI).

## Handoff artifacts

Every agent leaves a summary for the next:

- `project-spec.md`
- `features/<name>.feature`
- `progress/tdd_<name>.md`
- `progress/judge_<name>.md`
- `progress/mutation_<name>.md`
- `handoff.md`
- `review_report.md` (in TS modes)

## Hard rules

- One feature at a time.
- Do not declare `done` without judge approval and mutation ≥ 80%.
- Do not skip the human approval gate over the `.feature` files.
- Do not edit `src/` or `tests/` directly; delegate.
- Strict TDD: one test at a time.
- Run `./init.sh` at startup and `npx tsc --noEmit` after TS changes.

## Useful commands

```bash
./init.sh                                                       # verify environment
npx tsc --noEmit                                                # compile TS
npm test                                                        # run Jest tests
npx ts-node src/cli/run.ts --job job.json --approve             # CLI Mode
npx ts-node src/cli/run.ts --list                               # list jobs
python3 tools/mutate.py <file> --cmd "<runner>" --threshold 80 # manual mutation
```

## From Claude Code

- `/gaia_code_generator` — launches CLI Mode with the same TypeScript agents.
- `@craftsman_lead` — starts the pipeline manually step by step.

## Related files

- `AGENTS.md` — full map for AI agents.
- `CLAUDE.md` — startup instructions for Claude Code.
- `docs/engineering/workflow.md` — pipeline and mode mapping.
- `docs/engineering/tdd.md` — strict TDD.
- `docs/engineering/gherkin.md` — Gherkin syntax and rules.
- `docs/engineering/mutation-testing.md` — mutation and thresholds.
