/**
 * @fileoverview Android / Kotlin Platform Skill
 */

import { PlatformSkill, BuildResult, TestResult, AnalyzeResult, PromptContext } from '../index';
import {
  runGradleSync,
  runGradleTests,
  runAndroidLint,
  verifyAndroidEnvironment,
} from '../../tools/gradle-runner';
import { GaiaEnvError, GaiaBuildError, GaiaTestError, trim } from '../../errors';
import * as path from 'path';

export class AndroidSkill implements PlatformSkill {
  readonly displayName = 'Android / Kotlin';
  readonly sourceExtension = 'kt';
  readonly srcDirs = ['app/src/main', 'app/src/test', 'app/src/androidTest'];

  async verifyEnvironment(repoPath: string) {
    const result = await verifyAndroidEnvironment(repoPath);
    if (!result.valid) {
      throw new GaiaEnvError(
        '[Android] JDK / Android SDK not found or misconfigured. Ensure JAVA_HOME and ANDROID_HOME are set.',
        result.errors?.join('\n')
      );
    }
    return result;
  }

  async build(repoPath: string): Promise<BuildResult> {
    const result = await runGradleSync(repoPath);
    if (!result.passed) {
      throw new GaiaBuildError(
        `[Android] \`./gradlew dependencies\` failed — check build.gradle in ${path.basename(repoPath)}`,
        trim(result.stderr)
      );
    }
    return result;
  }

  async test(repoPath: string, module?: string): Promise<TestResult> {
    const target = module ? `module '${module}'` : path.basename(repoPath);
    const result = await runGradleTests(repoPath, module);
    if (!result.passed) {
      throw new GaiaTestError(
        `[Android] \`./gradlew testDebugUnitTest\` failed in ${target}`,
        trim(result.stderr)
      );
    }
    return result;
  }

  async analyze(repoPath: string): Promise<AnalyzeResult> {
    const result = await runAndroidLint(repoPath);
    if (!result.passed) {
      throw new GaiaTestError(
        `[Android] \`./gradlew lintDebug\` found issues in ${path.basename(repoPath)}. Fix lint violations before review.`,
        trim(result.stderr)
      );
    }
    return result;
  }

  getPromptContext(job: { title: string; module?: string; repo: string }): PromptContext {
    const base = job.module ? `${job.module}/src/main/kotlin` : 'app/src/main/kotlin/com/demo/app';
    const testBase = job.module ? `${job.module}/src/test/kotlin` : 'app/src/test/kotlin/com/demo/app';
    return {
      specSystem: `You are an expert Android architect using MVVM + Clean Architecture with Kotlin.
Use Kotlin Coroutines and Flow for async operations. Use Hilt for dependency injection.
Sealed classes for UiState. ViewModels in presentation layer, UseCases in domain, Repositories in data.`,
      implementerSystem: `You are an expert Android/Kotlin developer.
- Architecture: MVVM + Clean Architecture
- ViewModel: ${base}/presentation/viewmodels/
- UseCase: ${base}/domain/usecases/
- Repository: ${base}/data/repositories/
- Tests: ${testBase}/
- Use MockK for mocking, JUnit4 + Coroutines Test for unit tests
- UiState: sealed class with Loading, Success, Empty, Error
- NEVER use runBlocking in tests — use runTest(UnconfinedTestDispatcher())
- Respond with ONLY file contents, no markdown fences.`,
      reviewerSystem: `You are an Android/Kotlin code reviewer.
Check for: MVVM + Clean Architecture separation, sealed UiState, Coroutines/Flow usage (no RxJava unless existing), MockK test coverage, no runBlocking in tests, Hilt injection.`,
      filePatterns: {
        viewModel: `${base}/presentation/viewmodels/`,
        useCase: `${base}/domain/usecases/`,
        repository: `${base}/data/repositories/`,
        test: `${testBase}/`,
      },
      forbidden: [],
    };
  }
}
