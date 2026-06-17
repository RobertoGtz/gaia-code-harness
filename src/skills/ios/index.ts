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

export class IosSkill implements PlatformSkill {
  readonly displayName = 'iOS / Swift';
  readonly sourceExtension = 'swift';

  async verifyEnvironment(repoPath: string) {
    return verifyIosEnvironment(repoPath);
  }

  async build(repoPath: string): Promise<BuildResult> {
    return runSwiftPackageResolve(repoPath);
  }

  async test(repoPath: string): Promise<TestResult> {
    return runSwiftTests(repoPath);
  }

  async analyze(repoPath: string): Promise<AnalyzeResult> {
    return runSwiftLint(repoPath);
  }

  getPromptContext(job: { title: string; module?: string; repo: string }): PromptContext {
    return {
      specSystem: `You are an expert iOS architect using MVVM + Coordinator pattern with UIKit or SwiftUI.
Use Swift concurrency (async/await). Prefer protocol-oriented programming and dependency injection via initializer.
Source files go in Sources/{TargetName}/, tests in Tests/{TargetName}Tests/.`,
      implementerSystem: `You are an expert iOS/Swift developer.
- Architecture: MVVM + Coordinator
- Source files: Sources/DemoApp/
- Tests: Tests/DemoAppTests/
- Use XCTest for unit tests. Mock dependencies with protocols.
- Use async/await for asynchronous code — no completion handlers unless interfacing legacy APIs.
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
