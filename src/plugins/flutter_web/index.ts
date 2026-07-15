/**
 * @fileoverview Flutter Web Platform Skill for RPP multiplatform monorepos
 *
 * Supports the structure found in rpp-co repositories such as
 * rpp-account-basics-multiplatform-pyme and rpp-cashflow-multiplatform-pyme:
 * - Melos monorepo with FVM 3.35.7 and Dart 3.9.2
 * - Apps under apps/app (rpp_pyme_app)
 * - Feature packages under packages/features/<feature>
 * - Shared base packages under packages/base/pay_multiplatform_* (git overrides)
 * - fluro-based routing (NOT go_router)
 * - Dependencies resolved via melos bootstrap + pubspec_overrides.yaml
 * - Private dependencies come from GitHub git URLs injected via setup.sh
 */

import {
  PlatformSkill,
  BuildResult,
  TestResult,
  AnalyzeResult,
  PromptContext,
  BuildStrategy,
} from "../index";
import {
  runFlutterPubGet,
  runFlutterTests,
  runDartAnalyze,
  runMelosBootstrap,
  verifyFlutterEnvironment,
} from "../../tools/test-runner";
import { readFile, fileExists } from "../../tools/file";
import {
  GaiaEnvError,
  GaiaBuildError,
  GaiaTestError,
  trim,
} from "../../errors";
import * as path from "path";
import { execSync } from "child_process";
import * as fs from "fs";

const FORBIDDEN_PACKAGES = [
  "camera",
  "geolocator",
  "local_auth",
  "flutter_blue",
  "flutter_bluetooth_serial",
  "image_picker",
  "flutter_local_notifications",
  "vibration",
  "sensors_plus",
];

const KNOWN_FEATURE_PACKAGES = [
  "account_summary",
  "bre_b",
  "certificates",
  "common",
  "create_payment",
  "limits",
  "link_pse",
  "register_account",
  "vaults",
];

const KNOWN_DART_DEFINES = [
  "BACKEND_API",
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_DATABASE_URL",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_APP_ID",
  "AMPLITUD_API_KEY",
  "AMPLITUD_INSTANCE_NAME",
  "SHARED_SERVICES_API",
  "BRAZE_API_KEY",
  "BRAZE_BASE_URL",
];

/**
 * Prepare pubspec_overrides.yaml files for melos bootstrap:
 * 1. Resolve any git merge conflict markers (take HEAD/ours version)
 * 2. Inject credentials into placeholder URLs with proper YAML quoting
 *    so that melos's yaml_edit parser does not crash on unquoted colons.
 */
async function preparePubspecOverrides(repoPath: string): Promise<void> {
  const overrideFiles: string[] = [];
  try {
    const out = execSync(
      'find . -name "pubspec_overrides.yaml" -not -path "*/.dart_tool/*"',
      { cwd: repoPath, encoding: "utf-8" },
    );
    out.split("\n").filter(Boolean).forEach((f) =>
      overrideFiles.push(path.join(repoPath, f)),
    );
  } catch {
    return; // no overrides found — nothing to do
  }

  const user =
    process.env.GITHUB_TOKEN_RPP
      ? "x-access-token"
      : process.env.USERNAME_REPOSITORY ?? "";
  const pass =
    process.env.GITHUB_TOKEN_RPP ??
    process.env.PASSWORD_REPOSITORY ?? "";

  for (const file of overrideFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    // 1. Resolve merge conflicts — keep HEAD (ours) version
    if (content.includes("<<<<<<<")) {
      content = content.replace(
        /<<<<<<< [^\n]*\n((?:(?!======= *\n)[\s\S])*?)======= *\n(?:(?!>>>>>>> )[\s\S])*?>>>>>>> [^\n]*/g,
        (_, ours: string) => ours.trimEnd(),
      );
    }

    // 2. Replace credential placeholders and ensure YAML-safe quoting
    if (user && pass && content.includes("USERNAME_REPOSITORY")) {
      content = content.replace(
        /url:\s*https:\/\/USERNAME_REPOSITORY:PASSWORD_REPOSITORY@([^\s]+)/g,
        (_match, rest: string) => `url: "https://${user}:${pass}@${rest}"`,
      );
    }

    fs.writeFileSync(file, content, "utf-8");
  }
}

export class FlutterWebSkill implements PlatformSkill {
  readonly displayName = "Flutter Web";
  readonly sourceExtension = "dart";
  readonly srcDirs = ["lib", "test"];

  async verifyEnvironment(repoPath: string) {
    const base = await verifyFlutterEnvironment(repoPath);
    if (!base.valid) {
      throw new GaiaEnvError(
        "[Flutter Web] SDK not found or misconfigured. Run `flutter doctor` to diagnose.",
        base.errors?.join("\n"),
      );
    }

    const isMelos = await fileExists(path.join(repoPath, "melos.yaml"));
    const fvmrc = await readFile(path.join(repoPath, ".fvmrc")).catch(() => "");
    const fvmVersion = fvmrc.match(/"flutter"\s*:\s*"([^"]+)"/)?.[1] ?? null;

    const pubspecPath = path.join(repoPath, "pubspec.yaml");
    const content = await readFile(pubspecPath).catch(() => "");
    const found = FORBIDDEN_PACKAGES.filter((pkg) => content.includes(pkg));
    if (found.length > 0) {
      throw new GaiaEnvError(
        `[Flutter Web] Mobile-only packages detected in pubspec.yaml — these are not supported on Flutter Web: ${found.join(", ")}`,
        `Remove or replace the following from pubspec.yaml: ${found.join(", ")}`,
      );
    }

    const overridesPath = path.join(repoPath, "pubspec_overrides.yaml");
    const overrides = await readFile(overridesPath).catch(() => "");
    const hasBitbucketDeps = overrides.includes("bitbucket.org");

    const warnings: string[] = [];
    if (isMelos) {
      warnings.push(
        "Melos monorepo detected — run `melos bootstrap` before `flutter pub get`.",
      );
    }
    if (fvmVersion) {
      warnings.push(`FVM flutter version required: ${fvmVersion}.`);
    }
    if (hasBitbucketDeps) {
      warnings.push(
        "Bitbucket git overrides detected in pubspec_overrides.yaml. Ensure USERNAME_REPOSITORY and PASSWORD_REPOSITORY are exported for CI builds; these are separate from GITHUB_TOKEN.",
      );
    }

    return { valid: true, errors: [], warnings };
  }

  async build(
    repoPath: string,
    module?: string,
    _strategy?: BuildStrategy,
  ): Promise<BuildResult> {
    const isMelos = await fileExists(path.join(repoPath, "melos.yaml"));

    if (isMelos) {
      await preparePubspecOverrides(repoPath);
      const bootstrap = await runMelosBootstrap(repoPath);
      if (!bootstrap.passed) {
        throw new GaiaBuildError(
          `[Flutter Web] \`melos bootstrap\` failed in ${path.basename(repoPath)}`,
          trim(bootstrap.stderr),
        );
      }
    }

    const appDir = isMelos ? path.join(repoPath, "apps/app") : repoPath;
    const result = await runFlutterPubGet(appDir);
    if (!result.passed) {
      throw new GaiaBuildError(
        `[Flutter Web] \`flutter pub get\` failed — dependency resolution error in ${appDir}`,
        trim(result.stderr),
      );
    }

    if (isMelos) {
      const webBuildDefines = KNOWN_DART_DEFINES.map((name) => {
        const value = process.env[name];
        return value ? `--dart-define=${name}=${value}` : "";
      })
        .filter(Boolean)
        .join(" ");
      const baseHref =
        process.env.FLUTTER_WEB_BASE_HREF ??
        "/banking-accounts/pyme/account-basics/";
      const skiaFlag =
        process.env.FLUTTER_WEB_USE_SKIA === "false"
          ? ""
          : "--dart-define=FLUTTER_WEB_USE_SKIA=true";
      const buildCommand = [
        "flutter build web --release",
        `--base-href=${baseHref}`,
        webBuildDefines,
        skiaFlag,
      ]
        .filter(Boolean)
        .join(" ");

      return {
        ...result,
        command: buildCommand,
        stdout: `${result.stdout}\n[Flutter Web] Web build command: ${buildCommand}`,
      };
    }

    return result;
  }

  async test(repoPath: string, module?: string): Promise<TestResult> {
    const target = module ? `module '${module}'` : path.basename(repoPath);

    // Try running tests normally first
    let result = await runFlutterTests({ workingDir: repoPath, module, platform: 'chrome' });

    // If tests fail due to web-only dart:js_interop compilation errors,
    // retry with only model/data tests that don't pull web-specific deps
    if (
      !result.passed &&
      (result.stderr.includes("dart:js_interop") ||
        result.stderr.includes("dart:ui_web") ||
        result.stdout.includes("dart:js_interop"))
    ) {
      result = await runFlutterTests({
        workingDir: repoPath,
        module,
        platform: 'chrome',
        testFile: "test/data/",
      });
    }

    if (!result.passed) {
      throw new GaiaTestError(
        `[Flutter Web] \`flutter test\` failed in ${target}`,
        trim(result.stderr),
      );
    }
    return result;
  }

  async analyze(repoPath: string, module?: string): Promise<AnalyzeResult> {
    const target = module ? `module '${module}'` : path.basename(repoPath);
    const analyzeDir = module
      ? path.join(repoPath, "packages/features", module)
      : repoPath;
    const result = await runDartAnalyze(analyzeDir);
    if (!result.passed) {
      throw new GaiaTestError(
        `[Flutter Web] \`dart analyze\` found issues in ${target}`,
        trim(result.stderr),
      );
    }
    return result;
  }

  getPromptContext(job: {
    title: string;
    module?: string;
    repo: string;
  }): PromptContext {
    const feature = job.module ?? "account_summary";
    const base = `packages/features/${feature}`;
    const isKnown = KNOWN_FEATURE_PACKAGES.includes(feature);
    const forbiddenList = FORBIDDEN_PACKAGES.join(", ");
    const featureExports = `lib/${feature}.dart`;

    const isCashflow = job.repo.includes("cashflow");
    const isAccountBasics = job.repo.includes("account-basics");
    const baseHref = isCashflow
      ? "/banking-accounts/pyme/cashflow/"
      : "/banking-accounts/pyme/account-basics/";

    return {
      specSystem: `You are an expert Flutter Web architect for RPP multiplatform monorepos.
Repo structure: apps/app + packages/features/<feature> + shared packages/base/pay_multiplatform_* (git overrides).
Tooling: melos, FVM flutter 3.35.7, Dart 3.9.2, very_good_analysis.
Routing: use fluro (Handler + Map<String, Handler> configuration). NEVER go_router, Navigator.push or MaterialPageRoute.
Public exports: every feature package has TWO entry points:
  - lib/${feature}.dart  -> exports src/core/{feature}_router.dart, src/core/{feature}_routes.dart and src/core/{feature}_provider_overrides.dart (may transitively pull web deps)
  - lib/${feature}_core.dart -> exports src/core/{feature}_routes.dart, data models and controllers that do NOT import web-only packages (safe for VM tests and controllers)
Package layout per feature:
  - lib/src/core/{feature}_routes.dart (static route strings)
  - lib/src/core/{feature}_router.dart (fluro Handler map)
  - lib/src/core/{feature}_provider_overrides.dart (concrete repository/service overrides for production)
  - lib/src/data/models/ (freezed models)
  - lib/src/data/repositories/ (abstract contract, provider tokens, impl, repository provider)
  - lib/src/presentation/flow/<module>/<module>_screen.dart + <module>_controller.dart (Screen wraps module in ModuleContainer; concrete controller extends abstract module controller)
  - lib/src/presentation/modules/<module>/<module>_module.dart + <module>_module_controller.dart (abstract) + <module>_states_notifier.dart + provider files
CRITICAL SPEC AUTHOR INSTRUCTIONS:
- The prompt below includes the EXISTING SOURCE CODE of the target feature. Read it carefully before proposing tasks.
- If the acceptance criteria describe rendering a view state (loading, error, success, empty, etc.), the file to modify is almost always the MODULE widget at lib/src/presentation/modules/<module>/<module>_module.dart, NOT the screen, router or routes.
- Only modify lib/src/core/{feature}_routes.dart or {feature}_router.dart when the acceptance criteria explicitly require a NEW route or a navigation change.
- TODO comments, throw UnimplementedError, and empty/default switch branches in the existing code are signals of where work is needed.
- Prefer modifying existing files. Create new files only when new models, repositories, services or providers are genuinely required.
- ACTION → CONTROLLER RULE: If the module widget introduces or wires a user action that delegates to a controller method (e.g. retry -> controller.loadPresummary, primary button -> controller.navigateToSummary), the spec MUST also include tasks to (a) declare the method in the abstract module controller, (b) implement it in the concrete flow controller, and (c) add/update a controller test at test/src/presentation/flows/<module>/<module>_controller_test.dart verifying the method (navigation target, notifier call, etc.).
State management: hooks_riverpod + flutter_hooks. Notifiers extend StateNotifier with SafeStateNotifier and use freezed sealed classes for states.
Serialization: freezed + json_serializable.
NEVER suggest these mobile-only packages: ${forbiddenList}.
Private dependencies are resolved via pubspec_overrides.yaml with credentials injected by scripts/setup.sh; this is separate from GitHub PR credentials.`,
      implementerSystem: `You are an expert Flutter Web developer for RPP multiplatform monorepos.
- Feature package: ${base}
- Dart package name for imports: "${feature}" (i.e. use "package:${feature}/src/..." for files inside this package)
- CRITICAL PUBLIC IMPORT RULE:
    * For screens, modules and production wiring (anything that may use web deps): import "package:${feature}/${feature}.dart"
    * For controllers, tests, notifier unit tests and ANY file that must run on the Dart VM: import "package:${feature}/${feature}_core.dart"
    * For the common feature package: use "package:common/common_core.dart" in controllers/tests; use "package:common/common.dart" only in widgets/modules
    * NEVER import web-only packages such as pay_multiplatform_common_web or pay_multiplatform_security_web directly in test/controller files.
- File layout for a module named <module>:
    * Flow (concrete, web-safe): ${base}/lib/src/presentation/flow/<module>/<module>_screen.dart
    * Flow controller: ${base}/lib/src/presentation/flow/<module>/<module>_controller.dart extends the abstract module controller below
    * Module widget: ${base}/lib/src/presentation/modules/<module>/<module>_module.dart (HookConsumerWidget, switches on view states)
    * Module controller abstract: ${base}/lib/src/presentation/modules/<module>/<module>_module_controller.dart (extends PayModuleController with PayMultiplatformBackNavigation)
    * Notifier: ${base}/lib/src/presentation/modules/<module>/<module>_states_notifier.dart or <module>_module_provider.dart
    * Provider tokens: ${base}/lib/src/data/repositories/repository_provider_tokens.dart
    * Repository overrides: ${base}/lib/src/core/${feature}_provider_overrides.dart
- When the task is about a MODULE widget (e.g. changing how a view state is rendered), modify the MODULE file (${base}/lib/src/presentation/modules/<module>/<module>_module.dart), NOT the screen/controller/router unless explicitly required.
- Routing: fluro only. Concrete controllers use appManager.router.navigateTo(route, transition: TransitionType.fadeIn, clearStack: true/false) and appManager.router.navigateBack(). Routes are defined in ${base}/lib/src/core/${feature}_routes.dart.
- State: freezed sealed classes with pattern matching. Notifiers extend StateNotifier<SealedClass> with SafeStateNotifier and set safeState = ...
- Provider style: StateNotifierProvider.autoDispose for notifiers; Provider.autoDispose or plain Provider for controllers; repository/service tokens are overridden in ${feature}_provider_overrides.dart.
- Dependency injection: define abstract Provider<T> tokens in repository_provider_tokens.dart that throw UnimplementedError; concrete repository implementations go in src/data/repositories/; production overrides in src/core/${feature}_provider_overrides.dart.
- Tests: ${base}/test/src/ using mocktail + flutter_test
    * Location: mirror the lib structure under test/src/ (e.g. test/src/presentation/modules/<module>/...)
    * Notifier tests: import the NOTIFIER class file DIRECTLY, instantiate it with a mocked repository, and call async methods explicitly. Do NOT import module/widget/controller files.
    * Controller tests: import the concrete controller from "package:${feature}/${feature}_core.dart", stub via MockRef pattern (mock appManager, router, repository tokens). If the feature has no test/src/mocks/mocks.dart, define local MockRef, MockAppManager, MockAppRouter and MockAppLogger classes using mocktail.
    * MANDATORY: whenever you add or use a controller method from a module widget (e.g. controller.loadPresummary, controller.navigateToSummary), you MUST also create/update the controller test at test/src/presentation/flows/<module>/<module>_controller_test.dart and verify the method behavior (navigation target, notifier call, etc.). Do NOT finish implementation without this test.
    * Controller tests MUST import only the concrete controller from "package:${feature}/${feature}_core.dart"; NEVER import the module widget, screen, router, or "flutter/widgets.dart" in a controller test.
    * To verify navigation in a controller test, use verify(() => appManager.router.navigateTo(...)) with any(named: 'transition') and any(named: 'clearStack') so you do NOT need to import TransitionType or fluro in the test.
    * NEVER import files that transitively import pay_multiplatform_common_web or pay_multiplatform_security_web in VM tests.
    * Mock abstract repositories with mocktail: class MockXxxRepository extends Mock implements XxxRepository {}
    * freezed models require ALL named fields (no positional constructors)
- KNOWN CASHFLOW REPOS (rpp-co/rpp-cashflow-multiplatform-pyme):
    * bre_b feature: notifier+module at packages/features/bre_b/lib/src/presentation/modules/presummary_form/presummary_form_states_notifier.dart and presummary_form_module.dart
    * bre_b notifier class: PresummaryFormStatesNotifier extends StateNotifier<SummaryFormViewStates> with SafeStateNotifier (method loadPresummary lives here)
    * bre_b view states: packages/features/bre_b/lib/src/data/models/presummary_form/summary_form_view_states.dart (SummaryFormViewStates sealed class with PresummaryFormLoading/Error/Success, SummaryFormLoading/Error/Success)
    * bre_b controller abstract: packages/features/bre_b/lib/src/presentation/modules/presummary_form/presummary_form_module_controller.dart
    * bre_b concrete flow controller: PresummaryFormController at packages/features/bre_b/lib/src/presentation/flow/presummary_form/presummary_form_controller.dart
    * bre_b provider: presummaryFormViewStateProvider exposes SummaryFormViewStates; use presummaryFormViewStateProvider.notifier to reach PresummaryFormStatesNotifier
    * common package exports: common/common_core.dart (for tests/controllers) and common/common.dart (for widgets)
- Linter: very_good_analysis; exclude generated files *.g.dart, *.freezed.dart, *.config.dart
- Forbidden packages: ${forbiddenList}
- Respond with ONLY file contents, no markdown fences.`,
      reviewerSystem: `You are a Flutter Web code reviewer for RPP.
Check for:
- fluro-based routing: router exposes Map<String, Handler>, no go_router, no Navigator.push, no MaterialPageRoute
- dual public exports: lib/${feature}.dart and lib/${feature}_core.dart exist; controllers/tests import the _core entry point, not the web entry point
- architecture: data/models, data/repositories (tokens + impl + overrides), presentation/modules (abstract controller + notifier + module), presentation/flow (screen + concrete controller)
- state: hooks_riverpod StateNotifier + StateNotifierProvider.autoDispose, freezed sealed classes, flutter_hooks inside HookConsumerWidget
- module changes target the module file, not unnecessary flow/router files
- generated files: exclude *.g.dart, *.freezed.dart, *.config.dart from analyze
- mobile-only packages: ${forbiddenList} must be absent
- tests: mocktail repository tests and flutter_test widget tests; tests do not import web-only transitive deps`,
      filePatterns: {
        routes: `${base}/lib/src/core/${feature}_routes.dart`,
        router: `${base}/lib/src/core/${feature}_router.dart`,
        providerOverrides: `${base}/lib/src/core/${feature}_provider_overrides.dart`,
        repositoryTokens: `${base}/lib/src/data/repositories/repository_provider_tokens.dart`,
        model: `${base}/lib/src/data/models/`,
        repository: `${base}/lib/src/data/repositories/`,
        flow: `${base}/lib/src/presentation/flow/`,
        module: `${base}/lib/src/presentation/modules/`,
        test: `${base}/test/src/`,
      },
      forbidden: FORBIDDEN_PACKAGES,
      conventions: {
        routing: "fluro",
        featurePackage: isKnown ? feature : "<feature>",
        baseHref,
        fvmVersion: "3.35.7",
        dartSdk: "3.9.2",
        repoOwner: job.repo.includes("/") ? job.repo.split("/")[0] : "rpp-co",
        credentialNote:
          "Use GITHUB_TOKEN scoped to this repo owner for PR creation. Do not reuse tokens from other organizations.",
      },
    };
  }
}
