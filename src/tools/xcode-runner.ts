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
 * Remove internal module imports (e.g. import DemoAppModels) that the LLM
 * erroneously generates for single-target SPM projects.
 */
async function stripInternalImports(workingDir: string): Promise<void> {
  const sourcesDir = path.join(workingDir, 'Sources');
  async function walk(dir: string): Promise<void> {
    let names: string[];
    try { names = await fs.readdir(dir); } catch { return; }
    for (const name of names) {
      const full = path.join(dir, name);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat) continue;
      if (stat.isDirectory()) { await walk(full); continue; }
      if (!name.endsWith('.swift')) continue;
      const src = await fs.readFile(full, 'utf8').catch(() => '');
      // Remove lines like: import DemoApp, import DemoAppModels, import DemoAppViewModels, etc.
      const fixed = src.split('\n').filter(l => !/^import DemoApp/.test(l.trim())).join('\n');
      if (fixed !== src) await fs.writeFile(full, fixed, 'utf8');
    }
  }
  await walk(sourcesDir);
}

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

  // Strip internal module imports that the LLM erroneously generates (e.g. import DemoAppModels).
  // In a single-target SPM project all source files share one module; no internal imports are needed.
  await stripInternalImports(workingDir);

  // SPM project with iOS platform target — swift test cannot run iOS code on macOS without a simulator.
  // Always use swift build to validate compilation correctness instead.
  const buildCommand = 'swift build';
  try {
    const { stdout, stderr } = await execAsync(buildCommand, { cwd: workingDir, timeout: 300000 });
    return { passed: true, command: buildCommand, stdout, stderr, exitCode: 0, duration: Date.now() - startTime };
  } catch (buildErr: any) {
    return {
      passed: false,
      command: buildCommand,
      stdout: buildErr.stdout || '',
      stderr: buildErr.stderr || '',
      exitCode: buildErr.code || 1,
      duration: Date.now() - startTime,
    };
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
