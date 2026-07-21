# When to use GAIA agents vs `.claude/agents`

> Quick guide to decide whether to use GAIA's automated pipeline (TypeScript) or Claude Code's manual agents (`.claude/agents/`).

---

## TL;DR

They are not mutually exclusive. **GAIA agents** (`src/agents/` + `src/harness/leader.ts`) are best for repeatable, automatic, and traceable work. **`.claude/agents/`** are best for exploration, ambiguous specs, and step-by-step human control.

The most practical way to combine them is the `/gaia_code_generator` slash command (`.claude/commands/gaia_code_generator.md`), which launches the GAIA pipeline from Claude Code.

---

## Direct comparison

| Criterion | **GAIA agents (TypeScript)** | **`.claude/agents/` (prompts)** |
|---|---|---|
| **Orchestration** | Automatic via `src/harness/leader.ts` | Manual; the human acts as `craftsman_lead` |
| **State backend** | `DiskBackend` / `PostgresBackend` | No structured backend; only `feature_list.json` + markdown |
| **Persistence** | Job survives restarts and crashes | State lives in the chat and loose files |
| **Human approval** | `--approve` / `--reject "feedback"` can skip or regenerate the gate | The pause after Gherkin is always respected |
| **Retry / closed loop** | Automatic in all modes: `ReviewerAgent` → `ImplementerAgent` | Manual; the human relaunches agents |
| **Repeatability** | High: same `job.json` → same result | Low; depends on the conversation thread |
| **Quality control** | Integrated mutation testing, score ≥ 80% | Depends on the human asking for it |
| **Ambiguity** | Needs a clear spec to avoid failure | Excellent for exploring and pivoting |
| **Cost and speed** | Cheaper and faster in CI / batch | Slower due to chat cycles |
| **Observability** | Logs, statuses, and structured progress files | Scattered chat |
| **Testability** | Unit-testable (`tests/*.test.ts`) | Only empirical validation |
| **Maintenance** | Typed code, easy refactoring | Edit markdowns and test manually |
| **LLM context control** | System prompts + `handoff.md` | Conversational; risk of “broken telephone” |

---

## Agent mapping

Both worlds use **the same roles**, but one runs them as TypeScript classes and the other as prompt instructions:

| Phase | `.claude/agents/` | GAIA TypeScript | Artifact |
|---|---|---|---|
| Spec | `spec_partner` | `SpecAuthorAgent` | `project-spec.md` / `TechnicalSpec` |
| Gherkin | `gherkin_author` | `SpecAuthorAgent` (2nd LLM call) | `features/<name>.feature` |
| Approval | `craftsman_lead` | `--approve` / `POST /jobs/:id/approve` | — |
| Implementation | `tdd_craftsman` | `ImplementerAgent.executeTDD()` | `src/` + `tests/` of the workspace |
| Review | `judge` | `ReviewerAgent` | `progress/judge_<name>.md` |
| Mutation | `mutation_tester` | `MutationTesterAgent` | `progress/mutation_<name>.md` |

---

## When to use GAIA?

- The spec is already clear or can be obtained from Jira/GitHub.
- You want to run many jobs without supervising every step.
- You need CI/CD or webhook integration.
- You want automatic retry, traceability, and mandatory mutation testing.
- The change is repeatable and of controlled size (`maxFilesToTouch`).

## When to use `.claude/agents/`?

- The feature is ambiguous and requires conversation to understand it.
- You want to manually decide when to approve Gherkin scenarios.
- You are debugging GAIA, tuning prompts, or testing new agents.
- You prefer artisan control over automation.

---

## Recommendation: combine them

The ideal setup is hybrid:

1. **Explore and define** with `.claude/agents/` (`spec_partner` + `gherkin_author`) when the feature is confusing.
2. **Automate** with GAIA agents once the Gherkin contract is firm.
3. **Launch GAIA from Claude Code** with the `/gaia_code_generator` slash command (`.claude/commands/gaia_code_generator.md`) so you do not have to switch windows.

This way you get the best of both worlds: conversation to understand the problem and a state machine to execute it without errors.

---

## How to test each mode

### GAIA CLI (TypeScript agents)

```bash
npx ts-node src/cli/run.ts --job job.json --approve
```

### Manual Claude Code (prompts)

```
@craftsman_lead, implement the next pending feature
```

### From Claude Code using GAIA agents

```
/gaia_code_generator --job job.json --approve
```
