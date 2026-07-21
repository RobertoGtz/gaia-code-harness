# `.claude` Mode — User Guide

> How to use GAIA from Claude Code: conversational agents, human approval, and the `/gaia_code_generator` slash command.

---

## What is `.claude` mode?

**`.claude` mode** is the way to work with GAIA directly inside Claude Code. Instead of running a terminal command or calling an API, you ask Claude to coordinate the pipeline using the files in `.claude/agents/`.

It is the most **artisan** mode and offers the most human control.

## How does it compare to the other modes?

| Mode          | How it starts                               | Orchestrator                   | Spec approval                        |
| ------------- | ------------------------------------------- | ------------------------------ | ------------------------------------ |
| **HTTP API**  | `POST /jobs`                                | Server + `leader.ts`           | `POST /jobs/:id/approve`             |
| **CLI**       | `npx ts-node src/cli/run.ts --job job.json` | `src/cli/run.ts` + `leader.ts` | `--approve` or `--reject "feedback"` |
| **Webhook**   | `POST /webhook/trigger`                     | Server + `leader.ts`           | Pause at `spec_ready`; `POST /jobs/:id/approve` |
| **`.claude`** | Conversation with Claude Code               | `craftsman_lead` + subagents   | Always pauses after Gherkin          |

## When should I use `.claude`?

- The feature is ambiguous and needs conversation to understand it.
- You want to review and approve each Gherkin scenario before code is written.
- You are debugging GAIA, tuning prompts, or testing new agents.
- You prefer manual step-by-step control over full automation.

## `.claude/` structure

```
.claude/
├── identity.json              ← Claude Code style and technical domains
├── package-manager.json       ← Project package manager
├── agents/                    ← Instructions for the 6 subagents
│   ├── craftsman_lead.md
│   ├── spec_partner.md
│   ├── gherkin_author.md
│   ├── tdd_craftsman.md
│   ├── judge.md
│   └── mutation_tester.md
├── .claude/commands/
│   └── gaia_code_generator.md ← Slash command `/gaia_code_generator` to launch CLI Mode
├── .windsurf/commands/
│   └── gaia_code_generator.md ← Equivalent instructions for Windsurf
├── .kiro/commands/
│   └── gaia_code_generator.md ← Equivalent instructions for Kiro
├── rules/
│   └── security-and-conventions.md  ← Security guardrails + conventions
├── skills/gaia/
│   └── SKILL.md              ← Project knowledge base
├── team/
│   └── gaia-team-config.json ← Shared resource config
├── workflows/                ← Multi-step procedures
│   ├── security-review.md
│   ├── release-checklist.md
│   └── add-new-platform.md
└── research/
    └── gaia-research-playbook.md  ← Structured research before specs
```

## How to start

1. Open Claude Code in the `gaia-code-harness` repository.
2. `CLAUDE.md` loads automatically: Claude acts as `craftsman_lead`.
3. Ask for the next pending task, for example:

```
Implement the next pending feature
```

4. Claude will read `AGENTS.md`, `feature_list.json`, and `progress/current.md`, run `./init.sh`, and follow the pipeline.

## The `.claude` mode pipeline

```
pending
  → [spec_partner]     discusses and writes project-spec.md
  → [gherkin_author]   distills features/<name>.feature
  → ⏸ HUMAN APPROVES the Gherkin scenarios
  → in_progress
  → [tdd_craftsman]    implements with strict TDD (or bulk if tddMode=false)
  → [judge]            reviews quality
  → [mutation_tester]  validates mutation ≥ 80%
  → done
```

The **only human approval gate** is after the Gherkin scenarios. Before writing production code, the human must approve the `.feature`.

## Agents and their GAIA equivalents

| Phase           | `.claude` agent   | GAIA TypeScript equivalent             | Artifact                        |
| --------------- | ----------------- | -------------------------------------- | ------------------------------- |
| Spec            | `spec_partner`    | `SpecAuthorAgent`                      | `project-spec.md`               |
| Gherkin         | `gherkin_author`  | `SpecAuthorAgent` (2nd LLM call)       | `features/<name>.feature`       |
| Approval        | `craftsman_lead`  | `--approve` / `POST /jobs/:id/approve` | —                               |
| Implementation  | `tdd_craftsman`   | `ImplementerAgent.executeTDD()`        | `src/` + `tests/` of the workspace |
| Review          | `judge`           | `ReviewerAgent`                        | `progress/judge_<name>.md`      |
| Mutation        | `mutation_tester` | `MutationTesterAgent`                  | `progress/mutation_<name>.md`   |

## Slash command `/gaia_code_generator`

If you prefer the same pipeline to run automatically (like CLI Mode) but without leaving Claude Code, use the slash command:

```
/gaia_code_generator --job job.json --approve
```

or, for the next pending feature:

```
/gaia_code_generator
```

This command invokes `src/cli/run.ts`, so it **uses the same GAIA TypeScript agents** but from chat. It is the way to alternate between manual control and automatic execution without switching tools.

## Configuration, skills, and additional workflows

In addition to agents and commands, `.claude` mode has shared resources:

| Resource                                     | What it is                  | What it is for                                                        |
| -------------------------------------------- | --------------------------- | --------------------------------------------------------------------- |
| `.claude/identity.json`                      | Technical and style profile | Claude starts with the right context without asking.                  |
| `.claude/package-manager.json`               | Package manager (`npm`)     | Installing/updating dependencies.                                     |
| `.claude/rules/security-and-conventions.md`  | Guardrails + conventions    | Security, conventional commits, TDD, do not touch `src/` directly.     |
| `.claude/skills/gaia/SKILL.md`               | Project knowledge base      | Deep context on architecture, modes, and pipeline.                    |
| `.claude/team/gaia-team-config.json`         | Resource catalog            | Documents active skills, commands, rules, and agents.                 |
| `.claude/workflows/`                         | Multi-step procedures       | `security-review`, `release-checklist`, `add-new-platform`.           |
| `.claude/research/gaia-research-playbook.md` | Research guide              | Before writing specs for ambiguous features.                            |

## Hard rules of `.claude` mode

- **One feature at a time.** Do not mix changes from multiple tasks.
- **Do not declare `done`** without `judge` approval and mutation ≥ 80%.
- **Do not skip human approval** of `.feature` files.
- **Do not edit `src/` or `tests/` directly**; delegate to the corresponding agent.
- Each subagent must **write its results to disk** (`project-spec.md`, `.feature`, `progress/*.md`).

## Full flow example

```
User: Implement the next pending feature
Claude: The next feature is "Handle SummaryFormSuccess". Starting with spec_partner...
         → project-spec.md updated.
Claude: Now gherkin_author will distill the scenarios...
         → features/handle-summary-form-success.feature created.
Claude: Scenarios ready. Read them and say "approved" to continue.
User: approved
Claude: [tdd_craftsman] implementing...
Claude: [judge] reviewing...
Claude: [mutation_tester] running mutation...
Claude: Feature done. PR: https://github.com/...
```

## Relationship with other documents

- `CLAUDE.md` — instructions Claude reads on startup (entry point of `.claude` mode).
- `AGENTS.md` — complete map of files, rules, and pipeline.
- `docs/engineering/workflow.md` — 5-phase pipeline and mapping with HTTP/CLI/Webhook.
- `docs/guides/cli-mode-product.md` — CLI Mode product guide.
- `docs/guides/claude-vs-gaia-agents.md` — when to use `.claude/agents` vs GAIA agents.
- `.claude/research/gaia-research-playbook.md` — structured research before writing specs.
