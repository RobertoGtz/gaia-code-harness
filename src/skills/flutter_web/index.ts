/**
 * @fileoverview Flutter Web Platform Skill
 */

import { PlatformSkill, BuildResult, TestResult, AnalyzeResult, PromptContext } from '../index';
import {
  runFlutterPubGet,
  runFlutterTests,
  runDartAnalyze,
  verifyFlutterEnvironment,
} from '../../tools/test-runner';
import { readFile } from '../../tools/file';
import { GaiaEnvError, GaiaBuildError, GaiaTestError, trim } from '../../errors';
import * as path from 'path';

const FORBIDDEN_PACKAGES = [
  'camera',
  'geolocator',
  'local_auth',
  'flutter_blue',
  'flutter_bluetooth_serial',
  'image_picker',
  'flutter_local_notifications',
  'vibration',
  'sensors_plus',
];

export class FlutterWebSkill implements PlatformSkill {
  readonly displayName = 'Flutter Web';
  readonly sourceExtension = 'dart';
  readonly srcDirs = ['lib', 'test'];

  async verifyEnvironment(repoPath: string) {
    const base = await verifyFlutterEnvironment(repoPath);
    if (!base.valid) {
      throw new GaiaEnvError(
        '[Flutter Web] SDK not found or misconfigured. Run `flutter doctor` to diagnose.',
        base.errors?.join('\n')
      );
    }
    const pubspecPath = path.join(repoPath, 'pubspec.yaml');
    const content = await readFile(pubspecPath).catch(() => '');
    const found = FORBIDDEN_PACKAGES.filter(pkg => content.includes(pkg));
    if (found.length > 0) {
      throw new GaiaEnvError(
        `[Flutter Web] Mobile-only packages detected in pubspec.yaml — these are not supported on Flutter Web: ${found.join(', ')}`,
        `Remove or replace the following from pubspec.yaml: ${found.join(', ')}`
      );
    }
    return { valid: true, errors: [] };
  }

  async build(repoPath: string): Promise<BuildResult> {
    const result = await runFlutterPubGet(repoPath);
    if (!result.passed) {
      throw new GaiaBuildError(
        `[Flutter Web] \`flutter pub get\` failed — dependency resolution error in ${path.basename(repoPath)}`,
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
        `[Flutter Web] \`flutter test\` failed in ${target}`,
        trim(result.stderr)
      );
    }
    return result;
  }

  async analyze(repoPath: string, module?: string): Promise<AnalyzeResult> {
    const target = module ? `module '${module}'` : path.basename(repoPath);
    const analyzeDir = module ? path.join(repoPath, 'packages/features', module) : repoPath;
    const result = await runDartAnalyze(analyzeDir);
    if (!result.passed) {
      throw new GaiaTestError(
        `[Flutter Web] \`dart analyze\` found issues in ${target}`,
        trim(result.stderr)
      );
    }
    return result;
  }

  getPromptContext(job: { title: string; module?: string; repo: string }): PromptContext {
    const base = job.module ? `packages/features/${job.module}` : 'lib';
    return {
      specSystem: `You are an expert Flutter Web architect.
Use go_router for URL-based navigation. Every page must support mobile (<600px), tablet (600–1024px), and desktop (>1024px) breakpoints via LayoutBuilder.
NEVER suggest these packages: ${FORBIDDEN_PACKAGES.join(', ')}.`,
      implementerSystem: `You are an expert Flutter Web developer.
- Pages: ${base}/lib/src/web/pages/
- Components: ${base}/lib/src/web/components/
- Routing: go_router with named URL paths — NEVER Navigator.push or MaterialPageRoute
- Responsive: every screen must use LayoutBuilder for breakpoints (mobile/tablet/desktop)
- Forbidden packages: ${FORBIDDEN_PACKAGES.join(', ')}
- Tests: flutter_test widget tests covering loading, success, and error states
- Respond with ONLY file contents, no markdown fences.`,
      reviewerSystem: `You are a Flutter Web code reviewer.
Check for: go_router usage (no Navigator.push), LayoutBuilder responsive breakpoints, absence of mobile-only packages (${FORBIDDEN_PACKAGES.join(', ')}), widget test coverage.`,
      filePatterns: {
        page: `${base}/lib/src/web/pages/`,
        component: `${base}/lib/src/web/components/`,
        test: `${base}/test/web/`,
      },
      forbidden: FORBIDDEN_PACKAGES,
    };
  }
}
