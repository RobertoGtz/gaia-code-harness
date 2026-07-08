/**
 * @fileoverview iOS / Swift Platform Skill — Rappi monorepo edition
 * @description Toolchain and prompt context for iOS/Swift projects.
 *              Supports both single-module Swift Package Manager demos and large
 *              Tuist-based modular monorepos (e.g. Rappi iOS) with feature
 *              interfaces, dependency injection, VIPER/MVVM, and a shared
 *              Design System.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { PlatformSkill, BuildResult, TestResult, AnalyzeResult, PromptContext, BuildStrategy } from '../index';
import { fileExists } from '../../tools/file';
import {
  runSwiftPackageResolve,
  runSwiftTests,
  runSwiftLint,
  runXcodeBuild,
  runTuistBuild,
  verifyIosEnvironment,
} from '../../tools/xcode-runner';
import { GaiaEnvError, GaiaBuildError, GaiaTestError, trim } from '../../errors';

export class IosSkill implements PlatformSkill {
  readonly displayName = 'iOS / Swift (Tuist/SPM)';
  readonly sourceExtension = 'swift';
  readonly srcDirs = [
    'apps',
    'features',
    'feature_interfaces',
    'services',
    'libraries',
    'foundations',
    'ui',
    'Sources',
    'Tests',
  ];

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

  async build(repoPath: string, module?: string, strategy?: BuildStrategy): Promise<BuildResult> {
    const hasTuist = await this.hasTuistConfig(repoPath);
    const hasXcode = await this.hasXcodeProject(repoPath);
    const scheme = module || 'App';

    // Explicit strategy: resolve only — fast, no compilation. Best default for large Tuist monorepos.
    if (strategy === 'resolve') {
      return this.resolveOrFail(repoPath);
    }

    // Explicit strategy: Tuist build
    if (strategy === 'tuist') {
      return this.buildOrFail(runTuistBuild(repoPath, scheme), 'tuist build');
    }

    // Explicit strategy: xcodebuild
    if (strategy === 'xcodebuild') {
      return this.buildOrFail(runXcodeBuild(repoPath, scheme), 'xcodebuild build');
    }

    // Auto: try the strongest validation available, falling back to lighter checks.
    if (hasTuist) {
      const tuistResult = await runTuistBuild(repoPath, scheme);
      if (tuistResult.passed) return tuistResult;

      const xcodeResult = await runXcodeBuild(repoPath, scheme);
      if (xcodeResult.passed) return xcodeResult;

      return this.resolveOrFail(repoPath);
    }

    if (hasXcode) {
      const xcodeResult = await runXcodeBuild(repoPath, scheme);
      if (xcodeResult.passed) return xcodeResult;
    }

    return this.resolveOrFail(repoPath);
  }

  private async resolveOrFail(repoPath: string): Promise<BuildResult> {
    const result = await runSwiftPackageResolve(repoPath);
    if (!result.passed) {
      throw new GaiaBuildError(
        `[iOS] \`swift package resolve\` failed — check Package.swift in ${path.basename(repoPath)}`,
        trim(result.stderr)
      );
    }
    return result;
  }

  private async buildOrFail(promise: Promise<BuildResult>, label: string): Promise<BuildResult> {
    const result = await promise;
    if (!result.passed) {
      throw new GaiaBuildError(
        `[iOS] \`${label}\` failed`,
        trim(result.stderr)
      );
    }
    return result;
  }

  private async hasTuistConfig(repoPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(repoPath);
      return entries.some(e => e === 'Tuist.swift' || e === 'Workspace.swift' || e === 'Project.swift');
    } catch {
      return false;
    }
  }

  async test(repoPath: string, module?: string): Promise<TestResult> {
    const result = await runSwiftTests(repoPath, module);
    if (!result.passed) {
      throw new GaiaTestError(
        `[iOS] tests failed in ${path.basename(repoPath)}${module ? ` (scheme ${module})` : ''}`,
        trim(result.stderr)
      );
    }
    return result;
  }

  async analyze(repoPath: string, module?: string): Promise<AnalyzeResult> {
    const result = await runSwiftLint(repoPath, module);
    if (!result.passed) {
      const target = module ? `${path.basename(repoPath)}/${module}` : path.basename(repoPath);
      throw new GaiaTestError(
        `[iOS] SwiftLint found violations in ${target}. Fix lint issues before review.`,
        trim(result.stderr)
      );
    }
    return result;
  }

  getPromptContext(job: { title: string; module?: string; repo: string }): PromptContext {
    const moduleName = job.module || 'Feature';
    const specLines = [
      'You are a senior iOS architect working in a large Tuist-based modular monorepo.',
      '',
      'PROJECT STRUCTURE:',
      '- apps/                        App targets',
      '- features/                    Feature implementations (e.g. features/PayInsurance/PayInsuranceFeature)',
      '- feature_interfaces/          Public protocols only (e.g. feature_interfaces/PayInsurance/PayInsuranceFeatureInterface)',
      '- services/                    Shared services (e.g. services/CoreMobile/RappiInjection)',
      '- libraries/                   Reusable libraries',
      '- foundations/                 Low-level utilities',
      '- ui/                          Design System and server-driven UI components',
      '',
      'DEPENDENCY RULES:',
      '- Direction: apps -> features -> services -> libraries -> foundations',
      '- A feature NEVER imports another feature directly. Use the protocol in feature_interfaces/.',
      '- Feature interfaces live in a separate module: {FeatureName}FeatureInterface.',
      '- Every feature module has Project.swift (Tuist) and Package.swift (SPM compatibility).',
      '',
      'ARCHITECTURE:',
      '- Verify the existing pattern in the feature before adding files. Common patterns: VIPER (Presenter, Interactor, Wireframe, View/Controller), MVVM (ViewModel + Repository + Network), or SwiftUI Feature protocol.',
      '- Prefer protocol-first design with dependency injection.',
      '- For UIKit flows: Feature -> Presenter -> Interactor -> Wireframe/Controller.',
      '- For SwiftUI flows: conform to Feature = SwiftUIFeature & UIKitFeature from BaseFeatureInterface.',
      '',
      'DESIGN SYSTEM:',
      '- Use DSCore.Colors.*, DSCore.Typography.*, L10n.* for strings.',
      '- In SwiftUI, DSColor.* returns UIColor. Always append .suColor.',
      '- Check ui/DesignSystemDelivery/Sources/Atoms/DSEtaAtoms/DSIconResolver.swift before using SF Symbols.',
      '- Never hardcode colors, fonts, or URLs.',
      '',
      'TDD SPEC FORMAT:',
      '- Break work into small, testable tasks.',
      '- Prefer creating/reusing entities, use cases/interactors, view models, and XCTest files.',
      '- Do NOT add large UI tasks unless the job explicitly asks for screen work.',
      '',
      'Before writing, read the existing feature directory and the matching feature interface to match the current pattern.',
    ];

    const implementerLines = [
      'You are a senior iOS/Swift developer in a large Tuist modular monorepo.',
      '',
      `MODULE LAYOUT FOR "${moduleName}" (concrete Rappi example with PayInsurance):`,
      '- {Vertical} is the parent folder, e.g. features/PayInsurance/ or feature_interfaces/PayInsurance/.',
      `- The feature module name is "${moduleName}Feature" (e.g. PayInsuranceFeature).`,
      `- The feature interface module name is "${moduleName}FeatureInterface" (e.g. PayInsuranceFeatureInterface).`,
      `- Feature implementation: features/{Vertical}/${moduleName}Feature/Sources/`,
      `- Feature interface: feature_interfaces/{Vertical}/${moduleName}FeatureInterface/Sources/`,
      `- Tests: features/{Vertical}/${moduleName}Feature/Tests/`,
      `- Project definition: features/{Vertical}/${moduleName}Feature/Project.swift`,
      `- Feature entry point: features/{Vertical}/${moduleName}Feature/Sources/${moduleName}Feature.swift`,
      `- Feature registration: features/{Vertical}/${moduleName}Feature/Sources/${moduleName}FeatureRegistrable.swift`,
      '',
      'ARCHITECTURE PATTERNS — inspect the existing feature and match its pattern; do not invent a new one:',
      '- VIPER: PayInsuranceFeature.swift (entry), PayInsurancePresenter, PayInsuranceInteractor, PayInsuranceWireframe, PayInsuranceViewController.',
      '- MVVM: RappiCreditsHomeV2Feature.swift, HomeVM/ViewModel, Repository, NetworkManager, Entities.',
      '- SwiftUI Feature: conform to Feature = SwiftUIFeature & UIKitFeature from BaseFeatureInterface.',
      '',
      'DEPENDENCY INJECTION:',
      '- Use RappiInjection/Swinject: @Inject var service: SomeServiceProtocol?',
      '- Resolve via MainComponent.resolve(SomeFeatureProtocol.self) or the feature\'s ResolverHelper.',
      `- Register features in ${moduleName}FeatureRegistrable: register (any ${moduleName}FeatureProtocol).self.`,
      '- Feature interface imports BaseFeatureInterface and RappiInjection.',
      '',
      'CROSS-FEATURE COMMUNICATION:',
      '- NEVER import another feature module directly.',
      '- ALWAYS import its feature interface module and use the protocol.',
      '- Use the feature\'s ResolverHelper to resolve the concrete implementation.',
      '',
      'DESIGN SYSTEM & SWIFTUI:',
      '- @MainActor for UI code. Sendable across actor boundaries.',
      '- Use weak var delegate.',
      '- L10n.* for strings; DSCore.Colors.* / DSCore.Typography.* for design tokens.',
      '- In SwiftUI: DSColor.* returns UIColor; always append .suColor.',
      '- DSIconResolver lives in DesignSystemDelivery; import DesignSystemDelivery when using it.',
      '- @Observable classes used in a struct View must be wrapped in @State private var.',
      '- Atomic design: decompose screens into Row views first, then a thin container.',
      '- Check .config/ios-deployment-target for the actual iOS version; currently 17.0.',
      '',
      'SAFETY RULES:',
      '- NO force unwrap (!), as! or try! in production code.',
      '- NO [self] in closures; use [weak self].',
      '- NO Float/Double for money; use Decimal.',
      '- NO hardcoded colors, fonts, URLs, or strings.',
      '- NO unverified imports or APIs — grep first.',
      '- NO heavy computation in SwiftUI body or Equatable.==.',
      '- NO JSON decoding in SwiftUI body.',
      '- NO print() in production; use os_log or structured logging.',
      '- NO fatalError() outside tests.',
      '- Use [safe:] or guard before array subscripts with dynamic indices.',
      '',
      'TESTING:',
      `- Use XCTest. Import @testable import ${moduleName}Feature and ${moduleName}FeatureInterface.`,
      '- Mock dependencies via protocols.',
      '- Use RappiTesting for XCTestCase helpers (trackForMemoryLeaks, XCTAssertThrowsError async).',
      '- Cover public methods, edge cases, and decoding.',
      '',
      'RESPONSE FORMAT:',
      '- Start with: Files, Skills loaded, Verification.',
      '- List every file being created or modifying.',
      '- Provide only file contents when asked; no markdown fences around Swift code.',
      '- Do NOT create internal module imports like \'import ${moduleName}FeatureModels\' — all sources in a single target share one module automatically.',
      '',
      'If the project is a simple SPM demo (single Package.swift, no Tuist), fall back to the simple rules: Sources/${moduleName}/ and Tests/${moduleName}Tests/, MVVM only, no UIKit/SwiftUI.',
    ];

    const reviewerLines = [
      'You are a senior iOS/Swift code reviewer for a large Tuist modular monorepo.',
      '',
      'Checklist:',
      '- Modular boundaries: feature only imports its own code and feature interfaces; no feature-to-feature imports.',
      '- Architecture consistency: matches the existing VIPER/MVVM/SwiftUI pattern in the feature.',
      '- Dependency injection: @Inject used, MainComponent.resolve for cross-feature, ResolverHelper present.',
      '- Design System: DSCore tokens, L10n strings, DSColor.suColor in SwiftUI, DSIconResolver checked before SF Symbols.',
      '- Safety: no force unwraps/as!/try!, [weak self] in closures, Decimal for money, safe array access, @MainActor for UI.',
      '- SwiftUI performance: no singleton/cache access in body, no I/O in Equatable, no .id() with mutable values, @State private var for @Observable state.',
      '- Tests: XCTest, @testable import, protocol mocks, edge cases, memory leak tracking.',
      '- SwiftLint compliance and no hardcoded constants.',
      '- Git: branch from develop, commit messages reference task/TICKET_ID.',
      '',
      'Flag any violation with a concrete file path and a suggested fix aligned with the Rappi standards.',
    ];

    return {
      specSystem: specLines.join('\n'),
      implementerSystem: implementerLines.join('\n'),
      reviewerSystem: reviewerLines.join('\n'),
      filePatterns: {
        source: `features/{Vertical}/${moduleName}Feature/Sources/`,
        featureEntry: `features/{Vertical}/${moduleName}Feature/Sources/${moduleName}Feature.swift`,
        registrable: `features/{Vertical}/${moduleName}Feature/Sources/${moduleName}FeatureRegistrable.swift`,
        interface: `feature_interfaces/{Vertical}/${moduleName}FeatureInterface/Sources/`,
        projectDef: `features/{Vertical}/${moduleName}Feature/Project.swift`,
        tests: `features/{Vertical}/${moduleName}Feature/Tests/`,
        designSystem: 'ui/DesignSystemDelivery/Sources/',
        apps: 'apps/',
      },
      forbidden: [
        'force unwrap (!) in production code',
        'as! / try! in production code',
        '[self] in closures',
        'Float/Double for money (use Decimal)',
        'hardcoded colors, fonts, URLs, strings',
        'feature importing another feature module directly',
        'DSColor.* without .suColor in SwiftUI',
        'Color(hex:) custom extension',
        'Image(systemName:) without checking DSIconResolver first',
        'let state = SomeObservable() in View (use @State private var)',
        'heavy computation in SwiftUI body',
        'JSON decoding in SwiftUI body',
        'print() in production code',
        'fatalError() outside tests',
      ],
    };
  }

  private async hasXcodeProject(repoPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(repoPath);
      return entries.some(e => e.endsWith('.xcodeproj') || e.endsWith('.xcworkspace')) ||
        entries.includes('Tuist.swift') ||
        entries.includes('Workspace.swift');
    } catch {
      return false;
    }
  }
}
