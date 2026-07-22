# Documentation Map — GAIA Code Harness

> Read this if you don't know where to start.

---

## I want to use it right now

| Goal                                       | Document                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| Understand what the system does in 2 minutes | [`README.md`](../README.md)                                              |
| Setup + first job step by step             | [`docs/guides/quick-start.md`](../guides/quick-start.md)                 |
| Demo with ready-to-copy commands           | [`docs/guides/demo.md`](../guides/demo.md)                               |
| Speaker script for live demo               | [`docs/guides/demo-speaker-script.md`](../guides/demo-speaker-script.md) |
| Automatic demo in 1 command                | `./scripts/demo.sh flutter`                                              |

---

## Documentation by topic

### Usage and reference

| Document                                                                    | Description                                    | Audience               |
| --------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------- |
| [`docs/guides/quick-start.md`](../guides/quick-start.md)                     | Complete guide for the 3 modes with examples   | Anyone                 |
| [`docs/guides/demo.md`](../guides/demo.md)                                   | Step-by-step demo, ready-to-copy commands      | PM / Tech Lead         |
| [`API.md`](../API.md)                                                        | Complete REST + Webhook reference              | Dev / CI               |
| [`docs/guides/setup.md`](../guides/setup.md)                                 | Detailed installation per platform           | Dev                    |
| [`docs/guides/testing.md`](../guides/testing.md)                             | How to run tests locally                       | Dev                    |
| [`docs/guides/cli-mode-product.md`](../guides/cli-mode-product.md)           | How CLI Mode works (for product people)        | PM / Anyone            |
| [`docs/guides/claude-mode.md`](../guides/claude-mode.md)                     | How to use GAIA in `.claude` mode (Claude Code) | Anyone                 |
| [`docs/guides/claude-vs-gaia-agents.md`](../guides/claude-vs-gaia-agents.md) | When to use GAIA agents vs `.claude/agents`    | Dev / Tech Lead        |
| [`docs/guides/production.md`](../guides/production.md)                       | Checklist before going to production           | DevOps / Tech Lead     |

### Architecture and engineering

| Document                                                                    | Description                                                |
| --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`docs/engineering/architecture.md`](../engineering/architecture.md)         | Internal architecture, state machine, agents, plugins      |
| [`docs/engineering/workflow.md`](../engineering/workflow.md)                 | Full pipeline: the 5 lifecycle phases                      |
| [`docs/engineering/tdd.md`](../engineering/tdd.md)                           | The Three Laws of TDD + Red-Green-Refactor cycle           |
| [`docs/engineering/gherkin.md`](../engineering/gherkin.md)                   | Gherkin format, rules, AC examples                         |
| [`docs/engineering/mutation-testing.md`](../engineering/mutation-testing.md) | How mutate.py works, thresholds, platforms                |

### For AI agents (Claude Code mode)

| Document                                                                                     | Description                                                 |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`AGENTS.md`](../AGENTS.md)                                                                   | Navigation map — read first                                   |
| [`CLAUDE.md`](../CLAUDE.md)                                                                   | Entry point for `craftsman_lead`                            |
| [`CHECKPOINTS.md`](../CHECKPOINTS.md)                                                         | Objective "done" criteria (C1–C7)                            |
| [`feature_list.json`](../feature_list.json)                                                   | Feature backlog with statuses                               |
| [`.claude/identity.json`](../.claude/identity.json)                                           | Style preferences and technical domains for Claude Code     |
| [`.claude/package-manager.json`](../.claude/package-manager.json)                             | Project package manager (`npm`)                             |
| [`.claude/agents/`](../.claude/agents/)                                                       | Definitions of the 6 Claude subagents                       |
| [`.claude/commands/gaia_code_generator.md`](../.claude/commands/gaia_code_generator.md)       | `/gaia_code_generator` slash command to launch CLI Mode     |
| [`.claude/rules/security-and-conventions.md`](../.claude/rules/security-and-conventions.md)   | Security guardrails and conventions                       |
| [`.claude/skills/gaia/SKILL.md`](../.claude/skills/gaia/SKILL.md)                             | GAIA project knowledge base for Claude Code                 |
| [`.claude/team/gaia-team-config.json`](../.claude/team/gaia-team-config.json)                 | Shared config for skills, commands, rules, and agents      |
| [`.claude/workflows/`](../.claude/workflows/)                                                 | Multi-step procedures (security, release, add platform)   |
| [`.claude/research/gaia-research-playbook.md`](../.claude/research/gaia-research-playbook.md) | Research guide before writing specs                         |

---

## Repository structure

```
gaia-code-harness/
├── README.md          ← Entry point (concise)
├── API.md             ← Complete REST reference
├── AGENTS.md          ← AI agents map
├── CLAUDE.md          ← Claude Code entry point
├── CHECKPOINTS.md     ← Done criteria
├── .env.example       ← Documented environment variables
│
├── docs/
│   ├── INDEX.md       ← This file
│   ├── guides/        ← Documentation for USING the system
│   │   ├── quick-start.md   ← The 3 modes step by step
│   │   ├── demo.md                    ← Demo with ready commands
│   │   ├── demo-speaker-script.md     ← Speaker script for live demo
│   │   ├── setup.md              ← Detailed installation
│   │   ├── testing.md            ← Local testing
│   │   ├── cli-mode-product.md        ← How CLI Mode works (for product)
│   │   ├── claude-mode.md             ← How to use GAIA in `.claude` mode (Claude Code)
│   │   ├── claude-vs-gaia-agents.md ← When to use GAIA agents vs `.claude/agents`
│   │   └── production.md            ← Pre-production checklist
│   ├── engineering/   ← Engineering discipline (devs + AI agents)
│   │   ├── architecture.md  ← Internal architecture
│   │   ├── workflow.md      ← Pipeline + 3-mode mapping
│   │   ├── tdd.md           ← The Three Laws + R-G-R cycle
│   │   ├── gherkin.md       ← Gherkin format, rules
│   │   └── mutation-testing.md ← mutate.py, thresholds
│
├── scripts/
│   ├── demo.sh        ← Automatic multi-mode demo
│   └── present.sh     ← Presentation script
│
├── src/
│   ├── agents/        ← SpecAuthor, Implementer, Reviewer, MutationTester
│   ├── plugins/       ← flutter/, ios/, android/, flutter_web/ (with repo-local override)
│   ├── harness/       ← leader.ts (state machine)
│   ├── api/routes/    ← jobs.ts + webhook.ts
│   ├── notifiers/     ← Slack, GitHub Checks, Generic, Jira
│   ├── state/         ← PostgresBackend + DiskBackend
│   ├── tools/         ← git.ts, jira.ts, figma.ts, llm.ts, test runners
│   └── cli/run.ts     ← CLI entry point (Mode B)
│
├── tests/             ← Unit tests
├── tools/mutate.py    ← Python mutation tester
└── .claude/           ← Claude Code configuration
    ├── identity.json              ← Style and technical domains
    ├── package-manager.json       ← npm
    ├── agents/                    ← Subagents (craftsman_lead, spec_partner, ...)
    ├── commands/                  ← Slash commands (/gaia_code_generator)
    ├── rules/                     ← Security guardrails and conventions
    ├── skills/gaia/SKILL.md       ← Project knowledge base
    ├── team/gaia-team-config.json ← Shared resource config
    ├── workflows/                 ← Multi-step procedures
    └── research/                  ← Research playbook
```

---

## Key environment variables

| Variable                               | Required       | For what                                                    |
| -------------------------------------- | -------------- | ----------------------------------------------------------- |
| `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | ✅             | Code generation                                             |
| `GITHUB_TOKEN`                         | ✅             | Create real PRs                                             |
| `GITHUB_OWNER`                         | ✅             | GitHub org or user                                          |
| `DATABASE_URL`                         | ✅ Modes A & C | PostgreSQL connection                                       |
| `JIRA_BASE_URL`                        | If using Jira  | Exact tenant subdomain (e.g. `your-org.atlassian.net`)      |
| `JIRA_EMAIL`                           | If using Jira  | Jira account email                                          |
| `JIRA_API_TOKEN`                       | If using Jira  | Jira API token                                              |
| `DEFAULT_PLATFORM`                     | Optional       | Platform if ticket has no label (default: `flutter`)      |
| `DEFAULT_REPO`                         | Optional       | Repo if ticket has no `repo:...` label                    |
| `SLACK_WEBHOOK_URL`                    | Optional       | Slack notifications                                         |

See all values in [`.env.example`](../.env.example).

---

## Useful links

- **GitHub Token:** https://github.com/settings/tokens (scope: `repo`)
- **Jira API Token:** https://id.atlassian.com/manage-profile/security/api-tokens
- **OpenAI API Key:** https://platform.openai.com/api-keys
