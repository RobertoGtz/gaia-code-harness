/**
 * @fileoverview Test runner utilities
 * @description Platform-agnostic test execution utilities and environment verification
 * @module tools/test-runner
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Options for running Flutter tests
 */
export interface TestOptions {
  /** Working directory for test execution */
  workingDir: string;
  /** Optional module path for monorepos */
  module?: string;
  /** Optional specific test name to run */
  testName?: string;
  /** Optional platform for flutter test (e.g. 'chrome' for web) */
  platform?: string;
  /** Optional specific test file path (relative to testDir) */
  testFile?: string;
}

/**
 * Result of a test run execution
 */
export interface TestRunResult {
  /** Whether all tests passed */
  passed: boolean;
  /** The command that was executed */
  command: string;
  /** Standard output from the test command */
  stdout: string;
  /** Standard error from the test command */
  stderr: string;
  /** Process exit code (0 = success) */
  exitCode: number;
  /** Execution duration in milliseconds */
  duration: number;
}

/**
 * Result of platform environment verification
 */
export interface EnvironmentCheck {
  /** Whether the toolchain is available and the project structure is valid */
  valid: boolean;
  /** List of validation errors if invalid */
  errors: string[];
}

/**
 * Execute Flutter tests for a project or module.
 * Runs 'flutter test' with a 2-minute timeout.
 * For monorepos, uses the module subdirectory.
 * 
 * @param options - Test execution options
 * @returns Promise resolving to test results
 * @example
 * const result = await runFlutterTests({
 *   workingDir: '/project',
 *   module: 'home_feature'
 * });
 * // result.passed: true/false
 * // result.stdout: '00:00 +1: All tests passed'
 */
export async function runFlutterTests(options: TestOptions): Promise<TestRunResult> {
  const { workingDir, module } = options;
  
  const startTime = Date.now();
  const testDir = module 
    ? path.join(workingDir, 'packages/features', module)
    : workingDir;
  const platformFlag = options.platform ? ` --platform ${options.platform}` : '';
  const fileArg = options.testFile ? ` ${options.testFile}` : '';
  const cmd = `flutter test${platformFlag}${fileArg}`;

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: testDir,
      timeout: 120000, // 2 minute timeout
    });

    return {
      passed: true,
      command: cmd,
      stdout,
      stderr,
      exitCode: 0,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      passed: false,
      command: cmd,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code || 1,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Run Dart static analysis (dart analyze).
 * Checks for compile errors, type issues, and lint violations.
 * 
 * @param workingDir - Directory to analyze
 * @returns Promise resolving to analyze results
 * @example
 * const result = await runDartAnalyze('/project');
 * if (!result.passed) {
 *   console.log(result.stdout); // Analysis errors
 * }
 */
export async function runDartAnalyze(workingDir: string): Promise<TestRunResult> {
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync('dart analyze', {
      cwd: workingDir,
      timeout: 60000,
    });

    return {
      passed: true,
      command: 'dart analyze',
      stdout,
      stderr,
      exitCode: 0,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      passed: false,
      command: 'dart analyze',
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code || 1,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Run 'melos bootstrap' to setup monorepo dependencies.
 * Links local packages and resolves dependencies.
 * 5-minute timeout for large monorepos.
 * 
 * @param workingDir - Monorepo root directory
 * @returns Promise resolving to bootstrap results
 * @example
 * const result = await runMelosBootstrap('/monorepo');
 * if (result.passed) {
 *   // Monorepo ready for development
 * }
 */
export async function runMelosBootstrap(workingDir: string, extraEnv?: Record<string, string>): Promise<TestRunResult> {
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync('melos bootstrap', {
      cwd: workingDir,
      timeout: 600000, // 10 minute timeout for large monorepos with git dependencies
      env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    });

    return {
      passed: true,
      command: 'melos bootstrap',
      stdout,
      stderr,
      exitCode: 0,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      passed: false,
      command: 'melos bootstrap',
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code || 1,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Run 'flutter pub get' to resolve dependencies for a single project.
 * Used for non-monorepo repositories (no melos.yaml).
 * 
 * @param workingDir - Project root directory
 * @returns Promise resolving to pub get results
 * @example
 * const result = await runFlutterPubGet('/project');
 * if (result.passed) {
 *   // Dependencies resolved
 * }
 */
export async function runFlutterPubGet(workingDir: string): Promise<TestRunResult> {
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync('flutter pub get', {
      cwd: workingDir,
      timeout: 180000, // 3 minute timeout
    });

    return {
      passed: true,
      command: 'flutter pub get',
      stdout,
      stderr,
      exitCode: 0,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      passed: false,
      command: 'flutter pub get',
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code || 1,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Run the repository's setup script if one exists.
 * Looks for scripts/setup.sh or scripts/setup.sh relative to the project root.
 * Returns a passed result if no script is found, preserving existing behavior.
 * Used by platform skills to apply repo-specific configuration (e.g. injecting
 * credentials into pubspec_overrides.yaml) before dependency resolution.
 *
 * @param workingDir - Project root directory
 * @returns TestRunResult with the script output, or passed=true if no script found
 * @example
 * const result = await runRepoSetupScript('/project');
 * if (!result.passed) throw new Error(result.stderr);
 */
/**
 * Extract the GitHub organization/owner from the origin remote URL.
 * Falls back to GITHUB_OWNER_RPP if the remote cannot be read.
 */
async function inferGitHubOrgFromRemote(workingDir: string): Promise<string | undefined> {
  try {
    const { stdout } = await execAsync('git remote get-url origin', {
      cwd: workingDir,
      timeout: 10000,
    });
    const match = stdout.trim().match(/github\.com[:/]([^/]+)\//);
    return match?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Rewrite pubspec_overrides.yaml files so Bitbucket URLs are replaced with the
 * configured GitHub owner when a RPP GitHub token is present. This allows repos
 * that have migrated (or are migrating) from Bitbucket to GitHub to resolve
 * git dependencies without manual changes to tracked override files.
 */
async function rewriteOverridesForRppGithub(workingDir: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN_RPP;
  const authUser = process.env.GITHUB_OWNER_RPP;
  if (!token || !authUser) return;

  const org = (await inferGitHubOrgFromRemote(workingDir)) || authUser;

  const entries = await fs.readdir(workingDir, { withFileTypes: true });
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.name === '.git' || item.name === 'build' || item.name === '.dart_tool') continue;
      if (item.isDirectory()) {
        await walk(fullPath);
      } else if (item.isFile() && item.name === 'pubspec_overrides.yaml') {
        files.push(fullPath);
      }
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '.git' || entry.name === 'build' || entry.name === '.dart_tool') continue;
    await walk(path.join(workingDir, entry.name));
  }

  for (const file of files) {
    let content = await fs.readFile(file, 'utf8');
    // Replace placeholder credentials first.
    content = content.replace(/USERNAME_REPOSITORY/g, authUser);
    content = content.replace(/PASSWORD_REPOSITORY/g, token);
    // Convert Bitbucket URLs (with any pre-injected credentials) to GitHub URLs
    // authenticated with the RPP token. The GitHub org is inferred from the
    // origin remote so private org-owned dependencies resolve correctly.
    content = content.replace(
      /https:\/\/[^@]+@bitbucket\.org\/rappinc\/([^\s]+)/g,
      `https://${authUser}:${token}@github.com/${org}/$1`
    );
    content = content.replace(
      /https:\/\/[^@]+@bitbucket\.org\/([^\s]+)/g,
      `https://${authUser}:${token}@github.com/${org}/$1`
    );
    // Normalize GitHub URLs that still point to the auth user instead of the org.
    content = content.replace(
      new RegExp(`https://[^@]+@github\\.com/(?!${org}/)([^/\\s]+)/([^\\s]+)`, 'g'),
      `https://${authUser}:${token}@github.com/${org}/$2`
    );
    await fs.writeFile(file, content, 'utf8');
  }
}

export async function runRepoSetupScript(workingDir: string): Promise<TestRunResult> {
  const candidates = ['scripts/setup.sh', 'scripts/setup.sh'];
  const startTime = Date.now();

  // Migrate Bitbucket overrides to GitHub before any setup script runs.
  await rewriteOverridesForRppGithub(workingDir);

  for (const candidate of candidates) {
    const scriptPath = path.join(workingDir, candidate);
    try {
      await fs.access(scriptPath);
    } catch {
      continue;
    }

    const shell = candidate.endsWith('.sh') ? 'bash' : 'sh';
    const cmd = `${shell} ${candidate}`;

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: workingDir,
        timeout: 300000, // 5 minute timeout
        env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' },
      });

      return {
        passed: true,
        command: cmd,
        stdout,
        stderr,
        exitCode: 0,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        passed: false,
        command: cmd,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1,
        duration: Date.now() - startTime,
      };
    }
  }

  return {
    passed: true,
    command: '',
    stdout: '',
    stderr: '',
    exitCode: 0,
    duration: 0,
  };
}

/**
 * Verify that Flutter development environment is properly configured.
 * Checks: Flutter CLI installed, pubspec.yaml or melos.yaml exists.
 * Used by agents before attempting to build or test.
 * 
 * @param workingDir - Project directory to check
 * @returns Environment validation result
 * @example
 * const check = await verifyFlutterEnvironment('/project');
 * if (!check.valid) {
 *   console.error(check.errors);
 *   // ['Flutter not found in PATH', 'No pubspec.yaml found']
 * }
 */
export async function verifyFlutterEnvironment(workingDir: string): Promise<EnvironmentCheck> {
  const errors: string[] = [];

  // Check if Flutter is installed
  try {
    await execAsync('flutter --version', { cwd: workingDir, timeout: 10000 });
  } catch {
    errors.push('Flutter not found in PATH');
  }

  // Check if pubspec.yaml exists
  try {
    await fs.access(path.join(workingDir, 'pubspec.yaml'));
  } catch {
    // Check for melos.yaml (monorepo)
    try {
      await fs.access(path.join(workingDir, 'melos.yaml'));
    } catch {
      errors.push('No pubspec.yaml or melos.yaml found');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
