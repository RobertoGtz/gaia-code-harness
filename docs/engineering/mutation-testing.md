# Mutation Testing — GAIA Code Harness

> Validates that your test suite would actually detect bugs. Minimum acceptable score: 80%.

---

## The problem it solves

A green suite says "the code doesn't blow up with these inputs". It does **not** say
"the tests would fail if the code were wrong". A test without strong assertions
always passes and protects nothing.

Mutation testing measures it the other way around: it introduces a small defect
(a _mutant_) and watches the suite.

- If **some test fails** → the mutant is **killed**. The net caught the defect.
- If **all tests pass** → the mutant **survived**. There is a hole: missing assert or case.

**Score = `killed / total`**. The higher, the more the tests bite.

---

## The tool: `tools/mutate.py`

No external dependencies (stdlib Python 3.9+ only). Supports:

- **Python** — native tokenizer (no false positives in strings/comments)
- **TypeScript / JavaScript** — string and template-literal aware regex
- **Swift** — regex for Swift operators and keywords
- **Kotlin** — same engine as TS/Swift

### Mutation catalog

| Category    | Examples                                 |
| ----------- | ---------------------------------------- |
| Comparison  | `<=` → `<`, `==` → `!=`, `===` → `!==`   |
| Arithmetic  | `+` → `-`, `-` → `+`                     |
| Logic       | `&&` → `\|\|`, `true` → `false`          |
| Return      | `return <expr>` → `return null/nil/None` |
| Constants   | `0` → `1`, `1` → `0` (Python only)       |

The script **always restores** the original file (`finally`), even on Ctrl-C.

### Quick usage

```bash
# TypeScript (internal harness)
python3 tools/mutate.py src/agents/implementer.ts \
  --cmd "npx jest --passWithNoTests" \
  --threshold 80

# Swift / iOS (job workspace)
python3 tools/mutate.py /tmp/gaia-workspace/<jobId>/Sources/App.swift \
  --cmd "swift test" \
  --cwd /tmp/gaia-workspace/<jobId> \
  --threshold 80

# Android / Kotlin
python3 tools/mutate.py app/src/main/kotlin/Foo.kt \
  --cmd "./gradlew testDebugUnitTest" \
  --cwd /path/to/android/project

# Flutter (Dart)
python3 tools/mutate.py lib/features/feed/data/repository.dart \
  --cmd "flutter test" \
  --cwd /tmp/gaia-workspace/<jobId>

# Limit number of mutants (long runs)
python3 tools/mutate.py src/agents/implementer.ts \
  --cmd "npx jest --passWithNoTests" --max 60

# JSON output (for MutationTesterAgent.ts)
python3 tools/mutate.py src/agents/implementer.ts \
  --cmd "npx jest" --json
```

### Exit codes

| Code | Meaning                                                   |
| ---- | --------------------------------------------------------- |
| `0`  | Score ≥ threshold — **PASS**                              |
| `1`  | Score < threshold — **FAIL**                              |
| `2`  | Red suite before mutation — fix the tests first           |

---

## The threshold

- **100% on new or touched lines** by the feature is the ideal.
- Minimum acceptable: **80%** — aligned with `MutationTesterAgent.ts`.
- For legacy code not touched by the feature, it is measured but not blocking.
- An **equivalent mutant** (does not change observable behavior) may be
  excluded, but **only** with explicit justification in
  `progress/mutation_<name>.md`. Abusing this is cheating the judge.

---

## Who does what

| Mode             | Runner                                       | Effect when score < 80%                                       |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------- |
| **Claude Code**  | `mutation_tester` agent (human in the loop) | Blocks; returns to `tdd_craftsman`                            |
| **A — HTTP API** | `MutationTesterAgent.ts` (automatic)         | Closed-loop: feedback to `ImplementerAgent` (≤ 5×)            |
| **B — CLI**      | `MutationTesterAgent.ts` (automatic)       | Closed-loop: feedback to `ImplementerAgent` (≤ 5×)            |
| **C — Webhook**  | `MutationTesterAgent.ts` (automatic)         | Closed-loop: feedback to `ImplementerAgent` (≤ 5×)            |

`mutation_tester` **measures and reports**. It does not edit code directly.
If a mutant survives, `MutationTesterAgent.ts` returns `TEST_ERROR` with the
details; the `Leader` persists that feedback in `reviewFeedback` and re-runs
`ImplementerAgent` (up to 5 retries) before marking the job as `test_error`.
In any mode you can retry manually with
`npx ts-node src/cli/run.ts --id <jobId> --retry` or `POST /jobs/:id/retry`.
A surviving mutant is the implementer's job: write the red test that kills it
and run it through the `judge`/reviewer again.

---

## Why the cost is worth it

Re-running the whole suite for each mutant is expensive. But that is the
shift described by Uncle Bob: the limit is no longer how fast a human types,
but how much validation your CPU can pay for. Code correctness is the return,
and it pays for every cycle.
