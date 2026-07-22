# Strict TDD — GAIA Code Harness

> One test at a time. Never the whole battery up front. Never production code without a red test asking for it.

---

## The Three Laws of TDD

1. **You don't write production code** except to make a failing test pass.
2. **You don't write more of a test than is sufficient to fail** — and not compiling or not importing counts as failing.
3. **You don't write more production code than is necessary** to make the one failing test pass.

The effect: you never have code without a test justifying it, nor a test
that isn't driving real code. Scope does not inflate.

---

## The cycle

```
   ┌──────────────────────────────────────────────┐
   │                                              │
   ▼                                              │
 RED            GREEN              REFACTOR      │
 write ONE  →  minimum code      →  clean while  ──┘
 failing       to make it           keeping
 test          green                 green
```

- **RED** — the test derives from the next `@s` scenario in the `.feature`.
  Verify it really fails. A test that passes the first time proves nothing:
  adjust it or suspect the setup.
- **GREEN** — **minimum** implementation. Returning a constant is allowed if no
  test disproves it yet. The next cycle will force generalization.
- **REFACTOR** — only on green. Remove duplication, improve names, split long
  functions. Re-run tests after every change. If something turns red, you're
  not refactoring: you're changing behavior.

---

## Granularity: one scenario, one or more cycles

Each `@s` in the `.feature` translates into at least one Red-Green-Refactor cycle.
A scenario with several edges may need two cycles to force generalization.

---

## Mandatory traceability

At close, every `@s` must be covered by at least one concrete test.
The `tdd_craftsman` writes the map in `progress/tdd_<name>.md`:

```markdown
## Traceability

- @s1 (empty file → 0) → test_count_empty_file
- @s2 (three notes → 3) → test_count_several_notes
- @s3 (does not mutate file) → test_count_no_mutate_file
```

The `judge` rejects if any `@s` lacks a test, and the `mutation_tester`
rejects if existing tests don't bite.

---

## How to run tests by platform

```bash
# TypeScript (internal harness)
npx jest --passWithNoTests

# Swift / iOS
swift test                               # in the job workspace

# Android / Kotlin
./gradlew testDebugUnitTest              # in the project directory

# Flutter
flutter test                             # in the project directory

# Python (fallback)
python3 -m unittest discover -s tests -v
```

---

## Smells the `judge` looks for

- Production code that **no red test** asked for (violates Law 1).
- Tests written "for the future" for scenarios not yet being touched.
- Refactors done on red.
- Long functions or opaque names that survived REFACTOR.
- Tests without asserts (always green, prove nothing).
