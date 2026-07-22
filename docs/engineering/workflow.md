# Pipeline and workflow — GAIA Code Harness

> Full harness pipeline: phases, agents, artifacts, and mapping across the three operating modes.

---

## The three modes and their pipeline

| Mode             | How it starts                | Backend    | Spec approval              | `tddMode` supported                |
| ---------------- | ---------------------------- | ---------- | -------------------------- | ---------------------------------- |
| **A — HTTP API** | `POST /jobs`                 | PostgreSQL | `POST /jobs/:id/approve`   | ✅ `"tddMode": true`               |
| **B — CLI**      | `npx ts-node src/cli/run.ts` | Disk JSON  | `--approve` / `--reject "feedback"` | ✅ `--tdd` flag                    |
| **C — Webhook**  | `POST /webhook/trigger`      | PostgreSQL | Pause at `spec_ready`; `POST /jobs/:id/approve` | ✅ `"tddMode": true` / label `tdd` |

All three modes share the same `leader.ts` (state machine) and the same agents.  
The difference is in how the job enters, where state persists, and whether spec approval is manual or automatic.

---

## Pipeline at a glance

> The diagram describes the full flow. The "Agent" column shows the Claude Code agent;
> the "TypeScript Equivalent" column shows the module that runs the same thing in Modes A, B, and C.

| Phase               | Agent (Claude Code)            | TypeScript equivalent             | Artifact                                        |
| ------------------- | ------------------------------ | --------------------------------- | ----------------------------------------------- |
| Spec                | `spec_partner`                 | `SpecAuthorAgent`                 | `project-spec.md` / `TechnicalSpec` JSON        |
| Gherkin             | `gherkin_author`               | `SpecAuthorAgent` (2nd LLM call) | `features/<name>.feature` / `scenarios.feature` |
| ⏸ **HUMAN GATE**    | `craftsman_lead`               | `POST /jobs/:id/approve`          | —                                               |
| Implementation      | `tdd_craftsman` (if `tddMode`) | `ImplementerAgent.executeTDD()`   | `src/` + `tests/` + `handoff.md`                |
| _(bulk)_            | _(bulk implementer)_           | `ImplementerAgent.execute()`      | `src/` + `tests/` + `handoff.md`                |
| Review              | `judge` + `LLM evaluator`      | `ReviewerAgent`                   | `progress/judge_<name>.md` + `review_report.md` |
| Mutation            | `mutation_tester`              | `MutationTesterAgent`             | `progress/mutation_<name>.md` + `handoff.md`    |

One feature at a time. One human approval gate: over the Gherkin scenarios,
**before** writing production code.

---

## Why this order

### 1. The spec is born from conversation, not dictation

The human does not hand over a closed document. They debate with `spec_partner`:
edge cases, exit contracts, discarded alternatives. The result,
`project-spec.md`, is the reasoned agreement — including the **decisions**
and their rationale.

### 2. Gherkin turns prose into an executable contract

Every behavior becomes a `Scenario` with verifiable `Given/When/Then`.
This is what the human signs. From here on, ambiguity is a contract bug,
not a code bug. See `docs/engineering/gherkin.md`.

### 3. The human gate is on the contract, not the code

Approving late (when code already exists) is expensive. Approving the `.feature` is
cheap and is the point of maximum leverage: a poorly defined scenario
drags down all of TDD. The `craftsman_lead` **stops** here and waits.

### 4. Strict TDD: one test at a time

Not all tests are written up front. You live the small cycle:
red test → minimum green → refactor on green. The Three Laws in
`docs/engineering/tdd.md`. Code that no test asked for does not exist.

### 5. Review is the whole game

> "Agents draft, judgment prunes."

Generating drafts is cheap. The scarce value is the **judgment** that decides
what survives. The `judge` does not edit: it prunes. If a scenario has no test, or
there is code nobody asked for, it rejects.

In Modes A/B/C, `ReviewerAgent` adds an LLM evaluator with few-shot
examples trained to be skeptical: it returns a 0-100 score and concrete issues
(not generic ones like "improve quality"). If the score is low, the
pipeline closes the loop: feedback is saved in `reviewFeedback` and the
`Leader` returns the job to `ImplementerAgent` to iterate.

### 6. Validation is compute-bound

> "Raw computer power is the limiting factor." / "Mutation testing is
> resource-heavy, but the ROI on code correctness is worth every cycle."

A green suite only says the code does not blow up. Mutation testing
introduces defects and demands that some test fail. It is expensive in CPU but is the
real measure of whether the net catches fish. See `docs/engineering/mutation-testing.md`.

---

## Artifact map

| File                                    | Written by                                    | Contains                                                          |
| --------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| `project-spec.md`                       | `spec_partner`                                | Conversational spec: purpose, contract, decisions                 |
| `features/<name>.feature`               | `gherkin_author` (Claude Code)                | Gherkin scenarios `@s1..@sn` (the signed contract)                |
| `specs/{jobId}/scenarios.feature`         | `SpecAuthorAgent` (Modes A/B/C — 2nd LLM call) | Automatically generated Gherkin scenarios, non-blocking           |
| `specs/{jobId}/design-figma-context.md` | `SpecAuthorAgent` (if `job.figmaUrl`)         | Textual summary of Figma frame/node (layout, texts, colors)       |
| `src/` (job workspace)                  | `tdd_craftsman` / `ImplementerAgent`          | Code carved by TDD or generated in bulk                           |
| `progress/tdd_<name>.md`                | `tdd_craftsman`                               | Cycle log + `@s → test` map                                       |
| `progress/judge_<name>.md`              | `judge`                                       | Verdict + checkpoints                                             |
| `progress/mutation_<name>.md`             | `mutation_tester`                             | Score + surviving mutants                                         |
| `handoff.md`                            | Each agent                                    | State summary for the next agent                                  |
| `review_report.md`                      | `ReviewerAgent` (Modes A/B/C)                 | LLM review score and issues                                       |
| `feature_list.json`                     | `craftsman_lead` / `tdd_craftsman`            | `pending → spec_ready → in_progress → done`                       |

**Anti-broken-telephone rule:** subagents write to disk and
return a reference line. Content does not circulate through chat.
