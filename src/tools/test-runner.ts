/**
 * @fileoverview Test runner utilities
 * @description Flutter test execution and environment verification
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
}

/**
 * Result of a test run execution
 */
export interface TestRunResult {
  /** Whether all tests passed */
  passed: boolean;
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
 * Result of Flutter environment verification
 */
export interface EnvironmentCheck {
  /** Whether the environment is valid for Flutter development */
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

  try {
    const { stdout, stderr } = await execAsync('flutter test', {
      cwd: testDir,
      timeout: 120000, // 2 minute timeout
    });

    return {
      passed: true,
      stdout,
      stderr,
      exitCode: 0,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      passed: false,
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
      stdout,
      stderr,
      exitCode: 0,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      passed: false,
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
export async function runMelosBootstrap(workingDir: string): Promise<TestRunResult> {
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync('melos bootstrap', {
      cwd: workingDir,
      timeout: 300000, // 5 minute timeout
    });

    return {
      passed: true,
      stdout,
      stderr,
      exitCode: 0,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      passed: false,
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
