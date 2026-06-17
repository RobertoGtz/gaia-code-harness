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
import * as path from 'path';

export class FlutterSkill implements PlatformSkill {
  readonly displayName = 'Flutter (mobile)';
  readonly sourceExtension = 'dart';

  async verifyEnvironment(repoPath: string) {
    return verifyFlutterEnvironment(repoPath);
  }

  async build(repoPath: string, module?: string): Promise<BuildResult> {
    const isMonorepo = await fileExists(path.join(repoPath, 'melos.yaml'));
    if (isMonorepo) {
      return runMelosBootstrap(repoPath);
    }
    return runFlutterPubGet(repoPath);
  }

  async test(repoPath: string, module?: string): Promise<TestResult> {
    return runFlutterTests({ workingDir: repoPath, module });
  }

  async analyze(repoPath: string): Promise<AnalyzeResult> {
    return runDartAnalyze(repoPath);
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
