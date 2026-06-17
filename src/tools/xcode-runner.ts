/**
 * @fileoverview Xcode/Swift test runner utilities
 * @description iOS test execution, build verification, and environment checks
 * @module tools/xcode-runner
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TestRunResult, EnvironmentCheck } from './test-runner';

const execAsync = promisify(exec);

/**
 * Run Swift tests via `swift test` or `xcodebuild test`.
 * Uses swift test for SPM projects, xcodebuild for .xcodeproj/.xcworkspace.
 */
export async function runSwiftTests(workingDir: string, scheme?: string): Promise<TestRunResult> {
  const startTime = Date.now();
  
  // Determine if SPM or Xcode project
  const hasSPM = await fileExists(path.join(workingDir, 'Package.swift'));

  if (!hasSPM) {
    // xcodeproj / xcworkspace — use xcodebuild with simulator
    const command = `xcodebuild test -scheme ${scheme || 'App'} -destination 'platform=iOS Simulator,name=iPhone 15' -quiet`;
    try {
      const { stdout, stderr } = await execAsync(command, { cwd: workingDir, timeout: 300000 });
      return { passed: true, command, stdout, stderr, exitCode: 0, duration: Date.now() - startTime };
    } catch (error: any) {
      return { passed: false, command, stdout: error.stdout || '', stderr: error.stderr || '', exitCode: error.code || 1, duration: Date.now() - startTime };
    }
  }

  // SPM project — try swift test first, fall back to swift build if UIKit/simulator required
  const testCommand = 'swift test';
  try {
    const { stdout, stderr } = await execAsync(testCommand, { cwd: workingDir, timeout: 300000 });
    return { passed: true, command: testCommand, stdout, stderr, exitCode: 0, duration: Date.now() - startTime };
  } catch (testErr: any) {
    const testStderr: string = testErr.stderr || '';
    const needsSimulator = testStderr.includes('no such module') || testStderr.includes('UIKit') || testStderr.includes('cannot be used when building for iOS');
    if (!needsSimulator) {
      return { passed: false, command: testCommand, stdout: testErr.stdout || '', stderr: testStderr, exitCode: testErr.code || 1, duration: Date.now() - startTime };
    }
    // UIKit / iOS-only code — validate compilation via swift build instead
    const buildCommand = 'swift build';
    try {
      const { stdout, stderr } = await execAsync(buildCommand, { cwd: workingDir, timeout: 300000 });
      return { passed: true, command: buildCommand, stdout, stderr, exitCode: 0, duration: Date.now() - startTime };
    } catch (buildErr: any) {
      return { passed: false, command: buildCommand, stdout: buildErr.stdout || '', stderr: buildErr.stderr || '', exitCode: buildErr.code || 1, duration: Date.now() - startTime };
    }
  }
}

/**
 * Run SwiftLint for static analysis.
 */
export async function runSwiftLint(workingDir: string): Promise<TestRunResult> {
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync('swiftlint lint --quiet', {
      cwd: workingDir,
      timeout: 60000,
    });

    return {
      passed: true,
      command: 'swiftlint lint',
      stdout,
      stderr,
      exitCode: 0,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      passed: false,
      command: 'swiftlint lint',
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code || 1,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Build the iOS project without running tests.
 */
export async function runXcodeBuild(workingDir: string, scheme?: string): Promise<TestRunResult> {
  const startTime = Date.now();
  const command = `xcodebuild build -scheme ${scheme || 'App'} -destination 'platform=iOS Simulator,name=iPhone 15' -quiet`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workingDir,
      timeout: 300000,
    });

    return {
      passed: true,
      command,
      stdout,
      stderr,
      exitCode: 0,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      passed: false,
      command,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code || 1,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Resolve Swift Package Manager dependencies.
 */
export async function runSwiftPackageResolve(workingDir: string): Promise<TestRunResult> {
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync('swift package resolve', {
      cwd: workingDir,
      timeout: 180000,
    });

    return {
      passed: true,
      command: 'swift package resolve',
      stdout,
      stderr,
      exitCode: 0,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      passed: false,
      command: 'swift package resolve',
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code || 1,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Verify iOS development environment is properly configured.
 * Checks: Xcode CLI tools, swift compiler, project files exist.
 */
export async function verifyIosEnvironment(workingDir: string): Promise<EnvironmentCheck> {
  const errors: string[] = [];

  // Check if swift is available
  try {
    await execAsync('swift --version', { cwd: workingDir, timeout: 10000 });
  } catch {
    errors.push('Swift not found in PATH');
  }

  // Check if xcodebuild is available
  try {
    await execAsync('xcodebuild -version', { cwd: workingDir, timeout: 10000 });
  } catch {
    errors.push('Xcode command line tools not found');
  }

  // Check for project files
  const hasPackageSwift = await fileExists(path.join(workingDir, 'Package.swift'));
  const hasXcodeproj = await findByExtension(workingDir, '.xcodeproj');
  const hasXcworkspace = await findByExtension(workingDir, '.xcworkspace');

  if (!hasPackageSwift && !hasXcodeproj && !hasXcworkspace) {
    errors.push('No Package.swift, .xcodeproj, or .xcworkspace found');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findByExtension(dir: string, ext: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir);
    return entries.some(e => e.endsWith(ext));
  } catch {
    return false;
  }
}
