/**
 * @fileoverview Platform Skills — interface and loader
 * @description A PlatformSkill encapsulates everything platform-specific:
 *   toolchain commands (build, test, analyze) and LLM prompt context.
 *   Generic agents call skill methods instead of hardcoding platform logic.
 */

import { Platform, TestResult } from '../types';
import { TestRunResult } from '../tools/test-runner';

// ─── Core interface ──────────────────────────────────────────────────────────

/** Alias for toolchain results (build, analyze) — same shape as TestRunResult */
export type BuildResult = TestRunResult;
export type AnalyzeResult = TestRunResult;

/** Re-export so skill implementations can import from one place */
export type { TestResult };

/**
 * PlatformSkill — all platform-specific behaviour in one place.
 * Implement this interface to add a new platform without touching any agent.
 */
export interface PlatformSkill {
  /** Human-readable name, e.g. "Flutter (mobile)", "iOS / Swift" */
  readonly displayName: string;

  /** Primary source extension, e.g. "dart", "swift", "kt" */
  readonly sourceExtension: string;

  /** Verify the local toolchain is available (flutter, xcode, gradle…) */
  verifyEnvironment(repoPath: string): Promise<{ valid: boolean; errors: string[] }>;

  /** Resolve dependencies (pub get, melos, gradle, swift package resolve…) */
  build(repoPath: string, module?: string): Promise<BuildResult>;

  /** Run the test suite — returns TestResult (domain type with command/exitCode/duration) */
  test(repoPath: string, module?: string): Promise<TestRunResult>;

  /** Run static analysis / linter */
  analyze(repoPath: string): Promise<TestRunResult>;

  /**
   * Returns platform-specific context injected into every LLM prompt.
   * Include: architecture, file patterns, forbidden packages, coding rules.
   */
  getPromptContext(job: { title: string; module?: string; repo: string }): PromptContext;
}

export interface PromptContext {
  /** System prompt fragment for the SpecAuthor */
  specSystem: string;
  /** System prompt fragment for the Implementer */
  implementerSystem: string;
  /** System prompt fragment for the Reviewer */
  reviewerSystem: string;
  /** File path patterns for this platform, e.g. { screen: "lib/src/...", test: "test/..." } */
  filePatterns: Record<string, string>;
  /** Packages / APIs that must never appear in generated code */
  forbidden: string[];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

const skillCache = new Map<Platform, PlatformSkill>();

/**
 * Load and return the PlatformSkill for the given platform.
 * Skills are cached after first load.
 */
export async function loadSkill(platform: Platform): Promise<PlatformSkill> {
  if (skillCache.has(platform)) {
    return skillCache.get(platform)!;
  }

  let skill: PlatformSkill;

  switch (platform) {
    case 'flutter': {
      const { FlutterSkill } = await import('./flutter');
      skill = new FlutterSkill();
      break;
    }
    case 'flutter_web': {
      const { FlutterWebSkill } = await import('./flutter_web');
      skill = new FlutterWebSkill();
      break;
    }
    case 'ios': {
      const { IosSkill } = await import('./ios');
      skill = new IosSkill();
      break;
    }
    case 'android': {
      const { AndroidSkill } = await import('./android');
      skill = new AndroidSkill();
      break;
    }
    default:
      throw new Error(`No skill registered for platform: "${platform}"`);
  }

  skillCache.set(platform, skill);
  return skill;
}
