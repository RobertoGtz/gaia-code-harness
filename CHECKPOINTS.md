# CHECKPOINTS — Final State Evaluation

> In multi-agent systems the journey is not evaluated, the destination is.
> These are the objective checkpoints a judge (human or AI) can use
> to decide whether the project is healthy.
>
> The `judge` agent walks through C1–C6 and the `mutation_tester` validates C7.
> Session close is rejected if any boxes remain unchecked.

---

## C1 — The harness is complete

- [ ] Base files exist: `AGENTS.md`, `init.sh`, `feature_list.json`, `progress/current.md`.
- [ ] Discipline docs exist: `docs/engineering/tdd.md`, `docs/engineering/gherkin.md`, `docs/engineering/mutation-testing.md`, `docs/engineering/workflow.md`.
- [ ] `./init.sh` exits with code 0.
- [ ] `npx tsc --noEmit` finishes without errors.

## C2 — State is coherent

- [ ] At most one feature in `in_progress` in `feature_list.json`.
- [ ] Every `done` feature has passing tests (`./init.sh` verifies this).
- [ ] `progress/current.md` is empty or describes the active session
      (no leftover garbage from previous sessions).

## C3 — Code respects the architecture

- [ ] `src/` only contains the modules planned in `docs/engineering/architecture.md`.
- [ ] TypeScript agents (`src/agents/`) have no platform logic —
      that lives in `src/plugins/{platform}/`.
- [ ] No stray debug `console.log` statements or contextless TODOs.
- [ ] Leader (`src/harness/leader.ts`) imports from `state/`, never directly from `db/`.

## C4 — Verification is real

- [ ] `src/agents/` has integration or unit tests for the touched agent.
- [ ] Tests use real fixtures, not fragile filesystem mocks.
- [ ] `npm test` shows > 0 tests and all green (currently: 325 tests in 28 suites; verify after pausing CleanMyMac).

## C5 — Session closed properly

- [ ] No suspicious untracked files (`.tmp`, `dist/` without gitignore).
- [ ] `progress/history.md` has an entry for the last completed session.
- [ ] The last worked feature is in the correct state in `feature_list.json`.

## C6 — Gherkin contract (features with `"sdd": true`)

- [ ] Every feature with `"sdd": true` in state `spec_ready`, `in_progress`,
      or `done` has its `features/<name>.feature` and a section in `project-spec.md`.
- [ ] The `.feature` uses Gherkin with scenarios tagged `@s1`, `@s2`, …
      and every `Then` asserts something measurable (see `docs/engineering/gherkin.md`).
- [ ] Every `@s` scenario is covered by at least one concrete test
      (`@s → test` map in `progress/tdd_<name>.md`).
- [ ] No production code was written that a red test did not ask for
      (TDD discipline, see `docs/engineering/tdd.md`).

## C7 — Mutation testing

- [ ] The `done` feature passed mutation testing with score ≥ 80%:

  | Mode             | How to verify                                                                  |
  | ---------------- | -------------------------------------------------------------------------------- |
  | **A — HTTP API** | `MutationTesterAgent.ts` reported score ≥ 80% in `progressLogs` (`GET /jobs/:id`) |
  | **B — CLI**      | `python3 tools/mutate.py <file> --cmd "<runner>" --threshold 80` exits 0          |
  | **C — Webhook**  | Same as Mode A (same agent, only warns if < 80%)                                  |
  | **Claude Code**  | `mutation_tester` agent approved in `progress/mutation_<name>.md`               |

- [ ] Any surviving mutant is documented in
      `progress/mutation_<name>.md` (killed with a new test, or
      explicitly justified as equivalent).

---

## How to use this file

**Agents:** when closing a feature, the `judge` checks every C1–C6 checkbox
and the `mutation_tester` validates C7. If any remain empty, reject and return
control to `craftsman_lead` with the issue list.

**Human:** you can run `./init.sh` at any time to verify
environment state (C1, C3, C4).
