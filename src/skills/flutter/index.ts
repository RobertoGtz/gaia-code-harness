/**
 * @fileoverview Flutter (mobile) Platform Skill
 */

import { PlatformSkill, BuildResult, TestResult, AnalyzeResult, PromptContext } from '../index';
import {
  runFlutterPubGet,
  runMelosBootstrap,
  runFlutterTests,
  runDartAnalyze,
  verifyFlutterEnvironment,
} from '../../tools/test-runner';
import { fileExists } from '../../tools/file';
import { GaiaEnvError, GaiaBuildError, GaiaTestError, trim } from '../../errors';
import * as path from 'path';

export class FlutterSkill implements PlatformSkill {
  readonly displayName = 'Flutter (mobile)';
  readonly sourceExtension = 'dart';

  async verifyEnvironment(repoPath: string) {
    const result = await verifyFlutterEnvironment(repoPath);
    if (!result.valid) {
      throw new GaiaEnvError(
        '[Flutter] SDK not found or misconfigured. Run `flutter doctor` to diagnose.',
        result.errors?.join('\n')
      );
    }
    return result;
  }

  async build(repoPath: string, module?: string): Promise<BuildResult> {
    const isMonorepo = await fileExists(path.join(repoPath, 'melos.yaml'));
    const cmd = isMonorepo ? 'melos bootstrap' : 'flutter pub get';
    const result = isMonorepo
      ? await runMelosBootstrap(repoPath)
      : await runFlutterPubGet(repoPath);
    if (!result.passed) {
      throw new GaiaBuildError(
        `[Flutter] \`${cmd}\` failed — dependency resolution error in ${path.basename(repoPath)}`,
        trim(result.stderr)
      );
    }
    return result;
  }

  async test(repoPath: string, module?: string): Promise<TestResult> {
    const target = module ? `module '${module}'` : path.basename(repoPath);
    const result = await runFlutterTests({ workingDir: repoPath, module });
    if (!result.passed) {
      throw new GaiaTestError(
        `[Flutter] \`flutter test\` failed in ${target}`,
        trim(result.stderr)
      );
    }
    return result;
  }

  async analyze(repoPath: string): Promise<AnalyzeResult> {
    const result = await runDartAnalyze(repoPath);
    if (!result.passed) {
      throw new GaiaTestError(
        `[Flutter] \`dart analyze\` found issues in ${path.basename(repoPath)}`,
        trim(result.stderr)
      );
    }
    return result;
  }

  getPromptContext(job: { title: string; module?: string; repo: string }): PromptContext {
    const base = job.module ? `packages/features/${job.module}` : 'lib';
    return {
      specSystem: `You are an expert Flutter (mobile) architect following Clean MVVM architecture.
Use BLoC or Riverpod for state management. Target Dart files in lib/src/presentation/screens/ for screens, lib/src/presentation/widgets/ for widgets, lib/src/domain/ for use cases, lib/src/data/ for repositories.`,
      implementerSystem: `You are an expert Flutter/Dart developer.
- Architecture: Clean MVVM with BLoC or Riverpod
- Screens: ${base}/lib/src/presentation/screens/
- Widgets: ${base}/lib/src/presentation/widgets/
- Domain: ${base}/lib/src/domain/
- Data: ${base}/lib/src/data/
- Tests: ${base}/test/
- Use flutter_test for all tests. Generate widget tests for every new widget.
- Respond with ONLY file contents, no markdown fences.`,
      reviewerSystem: `You are a Flutter mobile code reviewer. Check for: Clean MVVM separation, BLoC/Riverpod usage, widget test coverage, no hardcoded strings, no business logic in widgets.`,
      filePatterns: {
        screen: `${base}/lib/src/presentation/screens/`,
        widget: `${base}/lib/src/presentation/widgets/`,
        domain: `${base}/lib/src/domain/`,
        data: `${base}/lib/src/data/`,
        test: `${base}/test/`,
      },
      forbidden: [],
    };
  }
}
