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

export class AndroidSkill implements PlatformSkill {
  readonly displayName = 'Android / Kotlin';
  readonly sourceExtension = 'kt';

  async verifyEnvironment(repoPath: string) {
    return verifyAndroidEnvironment(repoPath);
  }

  async build(repoPath: string): Promise<BuildResult> {
    return runGradleSync(repoPath);
  }

  async test(repoPath: string, module?: string): Promise<TestResult> {
    return runGradleTests(repoPath, module);
  }

  async analyze(repoPath: string): Promise<AnalyzeResult> {
    return runAndroidLint(repoPath);
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
