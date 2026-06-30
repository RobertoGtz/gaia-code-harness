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
      timeout: 300000, // 5 minute timeout
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
