# Sesión actual

## Feature en curso

Enhance iOS Skill Implementation: tests, monorepo module analysis, and documentation.

## Estado

- `src/tools/xcode-runner.ts`: dynamic iOS simulator detection, workspace-first project flag, `ensureTuistGenerated`, `runTuistBuild`, tests updated
- `src/skills/ios/index.ts`: `build()` supports `resolve`/`xcodebuild`/`tuist`/`auto` strategies with fallback, tests updated
- `src/types/index.ts` / `src/db/index.ts` / `src/api/routes/jobs.ts` / `src/cli/run.ts`: added `buildStrategy` field
- `src/skills/index.ts` / `android` / `flutter` / `flutter_web`: `build` accepts optional `BuildStrategy`
- `src/skills/index.ts`: `PlatformSkill.analyze` signature now accepts optional `module`
- `src/skills/android/index.ts`, `flutter/index.ts`, `flutter_web/index.ts`: `analyze` updated to accept module
- `docs/engineering/architecture.md`: added iOS skill section and updated toolchain table
- `docs/guides/testing.md`: added `xcode-runner.test.ts` and `ios-skill.test.ts` suites
- `tools/mutate.py`: fixed multiline TS template-literal masking (`re.DOTALL`)
- All tests: 152/152 passing
- `init.sh --quick`: OK
- No blockers.

## Notas de sesión

The mutation-testing tool had a bug with multiline TS template literals that caused line shifts and false surviving mutants. Refactored `IosSkill.getPromptContext` to use string arrays joined with `\n`, which the tool masks correctly and gives a clean mutation score.
