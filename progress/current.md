# Sesión actual

## Feature en curso

Implement iOS Build Strategy for large Tuist monorepos.

## Estado

- `src/tools/xcode-runner.ts`: dynamic iOS simulator detection, workspace-first project flag, `ensureTuistGenerated`, `runTuistBuild`, tests updated
- `src/skills/ios/index.ts`: `build()` supports `resolve`/`xcodebuild`/`tuist`/`auto` strategies with fallback, tests updated
- `src/types/index.ts` / `src/db/index.ts` / `src/api/routes/jobs.ts` / `src/cli/run.ts`: added `buildStrategy` field
- `src/skills/index.ts` / `android` / `flutter` / `flutter_web`: `build` accepts optional `BuildStrategy`
- `src/tools/file.ts`: handles broken symlinks in `getDirectoryStructure`/`searchFiles`, limits structure to 500 files
- `src/tools/git.ts`: preserves real origin remote when pushing, injects token instead of overriding with GITHUB_OWNER
- `src/tools/repo.ts`: restores GitHub origin URL after cloning from local repo path
- `src/agents/reviewer.ts`: derives PR owner/repo from local origin remote
- `docs/engineering/architecture.md` / `API.md`: documented iOS build strategies
- POC job succeeded: created PR https://github.com/rappi-inc/ios-rappi-main/pull/2332 on the Rappi iOS monorepo using `buildStrategy: "resolve"`
- All tests: 154/154 passing
- `init.sh`: OK
- Mutation: `src/skills/ios/index.ts` 94%, `src/tools/xcode-runner.ts` 82%
- No blockers.

## Notas de sesión

The Rappi iOS monorepo has broken symlinks and ~14k files at depth 3, which previously broke spec generation and oversized the LLM prompt. Fixed by skipping broken symlinks and capping directory structure files. The push/PR flow was also fixed to use the real GitHub upstream from the local clone instead of the GITHUB_OWNER env var.
