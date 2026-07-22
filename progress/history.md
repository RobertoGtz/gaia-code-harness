# Session history

> Append-only log. Each entry is added at the end when a session closes.
> Nothing in the history is edited or deleted.

---

<!-- Entry format:
## YYYY-MM-DD — <feature or task name>

- **Feature**: #<id> <name>
- **Final status**: done | blocked | in_progress
- **Summary**: what was done, what decisions were made, what remains pending.
- **Mutation score**: XX% (mutated file)
- **Notes**: blockers, design decisions, technical debt.
-->

## 2026-06-28 — iOS Build Strategy validation

- **Feature**: iOS Build Strategy for large Tuist monorepos
- **Status final**: in_progress
- **Resumen**: Validated `auto` build strategy on a Rappi iOS Tuist feature (PR 2334). Validated `xcodebuild` build strategy on a standalone non-Tuist iOS module generated in /tmp. Added unit tests for `git.ts`, `repo.ts`, and `reviewer.ts`. Improved `mutate.py` to strip block comments and mask strings before line comments.
- **Mutation score**: reviewer.ts 90%, git.ts 76.9%, repo.ts 55.6%, xcode-runner.ts 82% (prior session), ios/index.ts 94% (prior session)
- **Notas**: The Rappi monorepo's non-Tuist apps (Partners, Grability) require external CocoaPods/script dependencies that are not present in the workspace, so the `xcodebuild` validation used a generated non-Tuist module. `git.ts` and `repo.ts` mutation scores are held down by false positives from generic type `<>` in JSDoc and JSDoc boolean literals, which the improved mutator reduces but does not fully eliminate.

## 2026-06-28 — Mutation false positives resolved

- **Feature**: iOS Build Strategy for large Tuist monorepos
- **Status final**: in_progress
- **Resumen**: Committed and pushed test additions. Improved `tools/mutate.py` to exclude TypeScript generics and to skip mutants inside strings/comments. Reran mutation testing on all touched files.
- **Mutation score**: reviewer.ts 100%, git.ts 100%, repo.ts 85.7%, xcode-runner.ts 90%, file.ts 93.3%, ios/index.ts 96.7%
- **Notas**: The mutator previously counted false positives from JSDoc (`<>` in generic types, `true`/`false` in docs, return examples). Added explicit excluded-region detection so only actual code logic is mutated.

## 2026-06-28 — iOS build strategy feature closed

- **Feature**: #2 ios-build-strategy
- **Status final**: done
- **Resumen**: Human approved the 12 Gherkin scenarios. Judge review passed C1–C7. Mutation scores for all touched files are ≥ 80%. Feature marked as done in feature_list.json.
- **Mutation score**: reviewer.ts 100%, git.ts 100%, repo.ts 85.7%, xcode-runner.ts 90%, file.ts 93.3%, ios/index.ts 96.7%
- **Notas**: The feature was documented retrospectively because the code had already been implemented and validated against real jobs. All pipeline artifacts (spec, Gherkin, TDD map, judge review, mutation report) are now in place.

## 2026-07-09 — Flutter Web skill for RPP multiplatform monorepos

- **Feature**: #3 flutter-web-skill
- **Status final**: done
- **Resumen**: Completed TDD cycle for all 10 Gherkin scenarios (s1–s10). Fixed `PromptContext` interface to include `conventions` field. Corrected test assertion for `NEVER go_router` in specSystem. Added test for @s10 (separate GitHub credentials per repo owner). Implemented `repoOwner` extraction from `job.repo` and `credentialNote` in `getPromptContext`. All 15 tests green.
- **Mutation score**: src/skills/flutter_web/index.ts 100% (3/3 killed)
- **Notas**: Dart lint errors from ios-rappi-main workspace are unrelated to this TypeScript task and were ignored. The `repoOwner` is parsed from the `org/repo` format in `job.repo`, defaulting to `rpp-co` when no slash is present.
# Current session

## Goal
Continue translating and sanitizing the GAIA Code Harness project:
- Translate remaining docs, command files, scripts, and specs to English.
- Remove company-specific references from public-facing artifacts.
- Keep `.env` operational as requested.

## Completed in this session
- Translated `.claude/commands/gaia_code_generator.md`, `.windsurf/commands/gaia_code_generator.md`, and `.kiro/commands/gaia_code_generator.md` to English.
- Sanitized `.env.example` with generic placeholder tokens and URLs.
- Left `.env` unchanged per user request.
- Translated and sanitized `scripts/present-promo.sh`, `scripts/present-cli-claude.sh`, `scripts/present.sh`, and `scripts/demo.sh`.
- Translated `feature_list.json` and `project-spec.md` to English; replaced private repo/module references with generic placeholders.
- Removed the remaining Spanish prompt text in `src/agents/spec-author.ts` and updated `tests/spec-author.test.ts` accordingly.
- Removed company references in comments/prompts of `src/plugins/ios/index.ts`.
- Translated all `.claude/agents/*.md`, `.claude/workflows/*.md`, `.claude/rules/security-and-conventions.md`, `.claude/skills/gaia/SKILL.md`, and `.claude/research/gaia-research-playbook.md` to English.
- Translated `init.sh` and `tools/mutate.py` to English.
- Ran `./init.sh --quick` — passes.
- Ran `npx tsc --noEmit` — passes.
- Ran targeted Jest tests for changed files — passes.
- Ran mutation testing with `tools/mutate.py` on `src/agents/spec-author.ts` and `src/plugins/ios/index.ts` — both 100% kill rate.

## Known limitations
- `src/plugins/flutter_web/index.ts` and related tests still contain organization-specific identifiers (`rpp-co`, `GITHUB_TOKEN_RPP`, private-monorepo prompt examples) that are tied to the project's private-monorepo support. Refactoring them safely requires updating tests and possibly externalizing organization-specific behavior into a plugin or env-driven mapping, so they were left intact because `.env` retains those credentials and the tests assert that behavior.
- Full `npm test` fails intermittently because `CleanMyMac` deletes `node_modules/jest-util/build/` while the suite runs. Targeted test runs and mutation tests pass after a fresh `npm install`.

## Pending
- Decide whether to refactor `flutter_web` organization-specific references into configurable mappings.
- Run full `npm test` once the environment issue is paused.
- Commit and push all changes.
