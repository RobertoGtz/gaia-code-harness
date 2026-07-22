# GAIA Research Playbook

> Structured research guide before writing specs or implementing features in GAIA.

## When to use

- The feature is ambiguous or touches multiple components.
- The current state of the target code is unknown.
- You must decide among several design alternatives.

## Steps

1. **Closing questions**
   - What problem are we solving exactly?
   - Who is the end user?
   - What is the correct observable behavior?
   - What constraints do we have (time, complexity, legacy)?
2. **Repository exploration**
   - Use `find` / `grep` to locate relevant files.
   - Read `README.md`, `docs/engineering/architecture.md`, and `docs/engineering/workflow.md`.
   - Identify related plugins, agents, or tools.
3. **Impact map**
   - List files that will likely change.
   - Identify existing tests that must be updated.
   - Detect external dependencies (APIs, tokens, DB).
4. **Alternatives and trade-offs**
   - Write 2-3 design options.
   - Evaluate each on cost, risk, maintainability, and alignment with architecture.
5. **Preliminary Gherkin contract**
   - Write 3-5 `Given/When/Then` scenarios without implementation.
   - Use those scenarios to validate with the human before moving forward.
6. **Document**
   - Save the research in `progress/research-<feature>.md`.
   - Reference that file from `project-spec.md`.

## Output

- `progress/research-<feature>.md` with questions, findings, alternatives, and preliminary scenarios.
- The human validates before moving to formal `spec_partner`.
