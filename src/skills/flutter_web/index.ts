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

  async verifyEnvironment(repoPath: string) {
    const base = await verifyFlutterEnvironment(repoPath);
    if (!base.valid) return base;

    const pubspecPath = path.join(repoPath, 'pubspec.yaml');
    const content = await readFile(pubspecPath).catch(() => '');
    const found = FORBIDDEN_PACKAGES.filter(pkg => content.includes(pkg));
    if (found.length > 0) {
      return {
        valid: false,
        errors: [`Mobile-only packages not supported on Flutter Web: ${found.join(', ')}`],
      };
    }
    return { valid: true, errors: [] };
  }

  async build(repoPath: string): Promise<BuildResult> {
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
