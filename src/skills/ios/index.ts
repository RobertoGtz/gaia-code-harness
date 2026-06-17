/**
 * @fileoverview iOS / Swift Platform Skill
 */

import { PlatformSkill, BuildResult, TestResult, AnalyzeResult, PromptContext } from '../index';
import {
  runSwiftPackageResolve,
  runSwiftTests,
  runSwiftLint,
  verifyIosEnvironment,
} from '../../tools/xcode-runner';
import { GaiaEnvError, GaiaBuildError, GaiaTestError, trim } from '../../errors';
import * as path from 'path';

export class IosSkill implements PlatformSkill {
  readonly displayName = 'iOS / Swift';
  readonly sourceExtension = 'swift';
  readonly srcDirs = ['Sources', 'Tests', 'App'];

  async verifyEnvironment(repoPath: string) {
    const result = await verifyIosEnvironment(repoPath);
    if (!result.valid) {
      throw new GaiaEnvError(
        '[iOS] Xcode / Swift toolchain not found or misconfigured. Run `xcode-select --install` and ensure Xcode is installed.',
        result.errors?.join('\n')
      );
    }
    return result;
  }

  async build(repoPath: string): Promise<BuildResult> {
    const result = await runSwiftPackageResolve(repoPath);
    if (!result.passed) {
      throw new GaiaBuildError(
        `[iOS] \`swift package resolve\` failed — check Package.swift in ${path.basename(repoPath)}`,
        trim(result.stderr)
      );
    }
    return result;
  }

  async test(repoPath: string): Promise<TestResult> {
    const result = await runSwiftTests(repoPath);
    if (!result.passed) {
      throw new GaiaTestError(
        `[iOS] \`swift build\` failed in ${path.basename(repoPath)}`,
        trim(result.stderr)
      );
    }
    return result;
  }

  async analyze(repoPath: string): Promise<AnalyzeResult> {
    const result = await runSwiftLint(repoPath);
    if (!result.passed) {
      throw new GaiaTestError(
        `[iOS] SwiftLint found violations in ${path.basename(repoPath)}. Fix lint issues before review.`,
        trim(result.stderr)
      );
    }
    return result;
  }

  getPromptContext(job: { title: string; module?: string; repo: string }): PromptContext {
    return {
      specSystem: `You are an expert iOS architect using MVVM + Coordinator pattern.
Use Swift concurrency (async/await). Prefer protocol-oriented programming and dependency injection via initializer.
Source files go in Sources/{TargetName}/, tests in Tests/{TargetName}Tests/.
IMPORTANT: This is a Swift Package Manager project validated with 'swift build' on macOS. Do NOT use UIKit or SwiftUI — use only Foundation and pure Swift. All business logic must be platform-agnostic.`,
      implementerSystem: `You are an expert iOS/Swift developer.
- Architecture: MVVM + Coordinator
- Source files: Sources/DemoApp/
- Tests: Tests/DemoAppTests/
- Use XCTest for unit tests. Mock dependencies with protocols.
- Use async/await for asynchronous code — no completion handlers unless interfacing legacy APIs.
- CRITICAL: Do NOT import UIKit or SwiftUI. This project uses Swift Package Manager and is compiled with 'swift build' on macOS where UIKit is unavailable. Use only Foundation and pure Swift.
- Respond with ONLY file contents, no markdown fences.`,
      reviewerSystem: `You are an iOS/Swift code reviewer.
Check for: MVVM separation, Coordinator navigation pattern, XCTest coverage, Swift concurrency usage, no force-unwraps in production code, SwiftLint compliance.`,
      filePatterns: {
        viewController: 'Sources/DemoApp/',
        viewModel: 'Sources/DemoApp/ViewModels/',
        coordinator: 'Sources/DemoApp/Coordinators/',
        model: 'Sources/DemoApp/Models/',
        test: 'Tests/DemoAppTests/',
      },
      forbidden: [],
    };
  }
}
