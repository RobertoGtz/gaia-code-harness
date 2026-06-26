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
        `[iOS] \`swift test\` failed in ${path.basename(repoPath)}`,
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
      specSystem: `You are an expert iOS architect using MVVM pattern.
Source files go in Sources/DemoApp/, tests in Tests/DemoAppTests/.
IMPORTANT: This is a Swift Package Manager project validated with 'swift build' on macOS 12+. Do NOT use UIKit, SwiftUI, or Combine. Use only Foundation and pure Swift.
Keep the spec MINIMAL: exactly 3 tasks — 1 create Model, 1 create ViewModel, 1 test ViewModel. Do NOT add any ViewController, Coordinator, Service, or UI tasks. Example valid tasks:
- create Sources/DemoApp/Models/FeedItem.swift
- create Sources/DemoApp/ViewModels/FeedViewModel.swift
- test Tests/DemoAppTests/FeedViewModelTests.swift`,
      implementerSystem: `You are an expert iOS/Swift developer.
- Architecture: MVVM + Coordinator
- Source files: Sources/DemoApp/
- Tests: Tests/DemoAppTests/
- Use XCTest for unit tests. Mock dependencies with protocols.
- Use async/await for asynchronous code — no completion handlers unless interfacing legacy APIs.
- CRITICAL: Do NOT import UIKit, SwiftUI, or Combine. Do NOT use UIRefreshControl, UITableView, UIViewController, UIView, or ANY UIKit class. Do NOT use ObservableObject, @Published, @StateObject, Task{}, or any API requiring @available(macOS 10.15+). This project compiles with 'swift build' on macOS 12+ — the iOS SDK is NOT available.
- Implement ONLY pure business logic: data models, services that return data arrays, and ViewModels that call services. ViewModels are plain classes with a closure/delegate for updates — no UI code whatsoever.
- NEVER define a type (struct/class/enum) in more than one file. All files in Sources/DemoApp/ belong to the SAME Swift module (DemoApp) — do NOT add any import statements between them. Never write 'import DemoApp', 'import DemoAppModels', or any internal module import. Types defined in other files in Sources/DemoApp/ are automatically visible.
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
