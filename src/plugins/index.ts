/**
 * @fileoverview Platform Skills — interface and loader
 * @description A PlatformSkill encapsulates everything platform-specific:
 *   toolchain commands (build, test, analyze) and LLM prompt context.
 *   Generic agents call skill methods instead of hardcoding platform logic.
 */

import * as path from 'path';
import * as fs from 'fs';
import { Platform, TestResult } from '../types';
import { TestRunResult } from '../tools/test-runner';

// ─── Core interface ──────────────────────────────────────────────────────────

/** Alias for toolchain results (build, analyze) — same shape as TestRunResult */
export type BuildResult = TestRunResult;
export type AnalyzeResult = TestRunResult;

/**
 * Build strategy hints how a platform skill should validate generated code.
 * - `resolve`: only resolve dependencies (fast, no compilation — default for iOS monorepos)
 * - `xcodebuild`: use xcodebuild build/test
 * - `tuist`: use tuist build (best for Tuist monorepos, but slow)
 * - `auto`: let the skill pick the best available strategy
 */
export type BuildStrategy = 'resolve' | 'xcodebuild' | 'tuist' | 'auto';

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

  /** Source and test directories relative to repo root, e.g. ["lib", "test"] */
  readonly srcDirs: string[];

  /** Verify the local toolchain is available (flutter, xcode, gradle…) */
  verifyEnvironment(repoPath: string): Promise<{ valid: boolean; errors: string[] }>;

  /**
   * Resolve dependencies and optionally validate compilation.
   * (pub get, melos, gradle, swift package resolve, xcodebuild, tuist…)
   */
  build(repoPath: string, module?: string, strategy?: BuildStrategy): Promise<BuildResult>;

  /** Run the test suite — returns TestResult (domain type with command/exitCode/duration) */
  test(repoPath: string, module?: string): Promise<TestRunResult>;

  /** Run static analysis / linter */
  analyze(repoPath: string, module?: string): Promise<TestRunResult>;

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
  /** Platform-specific conventions (routing, versioning, paths, etc.) */
  conventions?: Record<string, string>;
}

// ─── Loader ──────────────────────────────────────────────────────────────────

const skillCache = new Map<string, PlatformSkill>();

/**
 * Load and return the PlatformSkill for the given platform.
 *
 * Resolution order:
 *   1. If `repoPath` is provided and `<repoPath>/.gaia/plugins/<platform>/index.js` exists,
 *      load that plugin dynamically (repo-local override).
 *   2. Otherwise fall back to the built-in plugin in `src/plugins/<platform>`.
 *
 * Skills are cached per (platform, repoPath) pair after first load.
 */
export async function loadSkill(platform: Platform, repoPath?: string): Promise<PlatformSkill> {
  const cacheKey = repoPath ? `${platform}:${repoPath}` : platform;

  if (skillCache.has(cacheKey)) {
    return skillCache.get(cacheKey)!;
  }

  let skill: PlatformSkill | undefined;

  // ── 1. Repo-local override ──────────────────────────────────────────────────
  if (repoPath) {
    const localPlugin = path.join(repoPath, '.gaia', 'plugins', platform, 'index.js');
    if (fs.existsSync(localPlugin)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(localPlugin);
      const Ctor = mod.default ?? mod[Object.keys(mod)[0]];
      if (typeof Ctor === 'function') {
        skill = new Ctor() as PlatformSkill;
      }
    }
  }

  // ── 2. Built-in fallback ────────────────────────────────────────────────────
  if (!skill) {
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
      case 'backend': {
        const { BackendSkill } = await import('./backend');
        skill = new BackendSkill();
        break;
      }
      default:
        throw new Error(`No skill registered for platform: "${platform}"`);
    }
  }

  skillCache.set(cacheKey, skill);
  return skill;
}
