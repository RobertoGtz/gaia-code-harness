# Project Spec

Maintained by `spec_partner`. Each section captures decisions made during the specification conversation.

---

## Feature #2: iOS build strategy for large Tuist monorepos

### Purpose

The GAIA harness must be able to run iOS code-generation jobs against different repository shapes:

- Large Tuist monorepos with tens of thousands of files, broken symlinks and private dependencies.
- Individual Tuist modules inside those monorepos.
- Non-Tuist iOS projects (SPM or plain Xcode) that do not use Tuist.

Choosing a build strategy (`buildStrategy`) lets the harness adapt validation without changing the rest of the pipeline.

### Supported strategies

| Strategy     | When to use                      | Expected behavior                                                                                                           |
| ------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `resolve`    | Large Tuist monorepos            | Only runs `swift package resolve` / `tuist install` to validate dependencies. Fast.                                          |
| `tuist`      | Tuist module with `Project.swift`| Generates the project (`tuist generate`) if needed and runs `tuist build`.                                                   |
| `xcodebuild` | Xcode/SPM project without Tuist  | Builds with `xcodebuild` directly, discovering `.xcodeproj` or `.xcworkspace`.                                              |
| `auto`       | Default                          | Tries `tuist build`; if it fails, `xcodebuild`; if it fails, `resolve`. If no Tuist, jumps to `xcodebuild` then `resolve`.  |

### Design decisions

1. **Resolve by default for large monorepos.** Building the whole app can take > 20 minutes. `resolve` validates that dependencies are resolvable without paying the full build cost. The LLM agent still gets real type/module feedback via `tuist build` / `swift package resolve`.

2. **Preserve the real GitHub upstream.** In setups with a `LOCAL_REPOS_PATH` using local clones, if the original GitHub URL is not restored on `origin`, the `ReviewerAgent` will try to create the PR against the owner defined by `GITHUB_OWNER`, which may not match the real upstream. `setupRepository` saves the original GitHub URL before copying and restores it after.

3. **Copy `Tuist/.build` from the local repo.** Tuist plugin dependencies and resolved packages are already present in the local clone. Copying the cache avoids re-downloads and authentication failures against private repos. If the destination already exists, the copy is skipped to avoid overwriting.

4. **Avoid unnecessary Tuist generation for non-Tuist projects.** If the job workspace does not contain `Tuist.swift`, `Workspace.swift` or `Project.swift`, `auto` jumps directly to `xcodebuild` and then `resolve`, without invoking `tuist generate`.

5. **Handle broken symlinks and huge structures.** Large monorepos can have ~14k files at depth 3 and broken symlinks. `getDirectoryStructure` and `searchFiles` ignore them and limit the structure to 500 files so the LLM context is not saturated.

### Edge cases

- Repo does not exist locally: clone from GitHub with `GITHUB_TOKEN`.
- Repo exists but is not the expected one: reuse it if `repoPath` already exists.
- `tuist build` fails because a plugin is unresolved: `auto` falls back to `xcodebuild`.
- `xcodebuild` fails because of external dependencies (CocoaPods/script): fall back to `resolve`.
- No iOS toolset installed: `verifyIosEnvironment` fails before the build.

### Artifacts

- `src/plugins/ios/index.ts` — strategy selection and orchestration.
- `src/tools/xcode-runner.ts` — `runTuistBuild`, `runXcodeBuild`, `ensureTuistGenerated`, etc.
- `src/tools/repo.ts` — `setupRepository` with cache and upstream preservation.
- `src/tools/git.ts` — remote parsing, PR creation, token injection.
- `src/types/index.ts` and `src/db/index.ts` — `buildStrategy` field.
- `src/api/routes/jobs.ts` and `src/cli/run.ts` — accept `buildStrategy` in requests.

## Feature #3: Update Flutter Web skill for multiplatform monorepos

### Purpose

GAIA's Flutter Web skill must support multiplatform Flutter Web monorepos: `melos` monorepos with FVM, private git dependency overrides, and web apps deployed under specific subpaths. Previously the skill assumed `go_router` navigation and a `lib/src/web/` structure, which does not match real multiplatform codebases.

### Reference repo

A representative monorepo shape:

- `sample-org/sample-flutter-web-app` (GitHub)
- Main app: `apps/app`
- Features: `packages/features/{home,settings,profile,...}`
- Shared base: `packages/base/shared_*` (git overrides)
- Flutter SDK: `3.35.7` (FVM `.fvmrc`)
- Dart SDK: `3.9.2` (`melos.yaml` environment)
- Melos: `6.3.2`

### Feature package structure

Each feature publishes its API from `lib/{feature}.dart` and organizes code as:

```
lib/
  {feature}.dart              # exports router + routes
  src/
    core/{feature}_router.dart  # fluro Handler + configuration map
    core/{feature}_routes.dart  # route constants
    data/models/...             # freezed/json_serializable models
    data/repositories/...       # abstract + impl repositories
    presentation/...          # widgets, providers, hooks
```

### Design decisions

1. **Melos bootstrap is the first step.** Packages depend on each other and on shared base packages via `pubspec_overrides.yaml`. Running `melos bootstrap` first links local packages before `flutter pub get` resolves external dependencies.

2. **Navigation with `fluro`, not `go_router`.** The router exposes a `Map<String, Handler>` keyed by route, using a fluro `Handler`. The root app (`apps/app`) collects every feature's configuration and passes it to `router.configureRoutes(...)`. The skill must not generate `Navigator.push` or `MaterialPageRoute` directly.

3. **Shared packages come from private git overrides.** `pubspec_overrides.yaml` points to private git URLs. CI injects credentials with `USERNAME_REPOSITORY` and `PASSWORD_REPOSITORY`. This is independent of `GITHUB_TOKEN` used to create PRs on GitHub. The skill documents that there are two credential sets: GitHub for PRs and private git overrides for dependencies.

4. **Web build needs `--base-href` and `dart-define`.** The Dockerfile uses `--base-href=/demo/app/` and defines variables `BACKEND_API`, `FIREBASE_*`, `AMPLITUD_*`, `SHARED_SERVICES_API`, `BRAZE_*` and `FLUTTER_WEB_USE_SKIA=true`. The skill passes these values if available in the job.

5. **Tests and coverage are per feature package.** `scripts/coverage.sh` runs `flutter test --coverage` inside each `packages/features/<feature>` and then merges the `lcov.info` files. The skill runs tests in the target package, not from the repo root.

6. **Static analysis excludes generated files.** `*.g.dart`, `*.freezed.dart` and `*.config.dart` must be ignored. The base linter is `very_good_analysis`.

7. **Monorepo layout uses `apps/` and `packages/`.** It is not a flat project with `lib/` at the root. If `melos.yaml` is present, the skill treats the repo as a monorepo and resolves modules under `packages/features/<module>` and the app under `apps/app`.

### Edge cases

- `.fvmrc` present but the `flutter` in PATH does not match the version: warn that FVM can select the correct version if activated.
- `pubspec_overrides.yaml` with credential placeholders: CI replaces them, but locally private git credentials must be exported.
- Feature package without `test/`: the skill reports "no tests" without failing the job.
- App routes live in `apps/app` and features in `packages/features/`: the web build always runs from `apps/app`, while tests and analyze run from the feature package.
- Repo owner different from the default (`sample-org` vs `my-org`): the skill inherits owner and token from the job, not the global default.

### Artifacts

- `src/plugins/flutter_web/index.ts` — prompt context, verification, build, test, analyze.
- `src/tools/test-runner.ts` — `runMelosBootstrap`, `runFlutterPubGet`, `runFlutterTests`, `runDartAnalyze`.
- `feature_list.json` — `flutter-web-skill` feature.
- `features/flutter-web-skill.feature` — Gherkin contract.
- `progress/tdd_flutter-web-skill.md` — scenario-to-test map.
- `progress/mutation_flutter-web-skill.md` — mutation results.

<!-- spec_partner adds one section per feature here -->
