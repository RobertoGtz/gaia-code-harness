/**
 * @fileoverview Gradle/Kotlin test runner utilities
 * @description Android test execution, build verification, and environment checks
 * @module tools/gradle-runner
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TestRunResult, EnvironmentCheck } from './test-runner';

const execAsync = promisify(exec);

function javaEnv(): NodeJS.ProcessEnv {
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) return process.env;
  const javaBin = path.join(javaHome, 'bin');
  const currentPath = process.env.PATH || '';
  return {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: currentPath.includes(javaBin) ? currentPath : `${javaBin}:${currentPath}`,
  };
}

/**
 * Run Android unit tests via Gradle.
 */
export async function runGradleTests(workingDir: string, module?: string): Promise<TestRunResult> {
  const startTime = Date.now();
  const gradleCmd = await getGradleCommand(workingDir);
  // Kotlin JVM projects use 'test'; Android app modules use 'testDebugUnitTest'
  const isAndroidApp = await fileExists(path.join(workingDir, 'app', 'src', 'main', 'AndroidManifest.xml'));
  const baseTask = isAndroidApp ? 'testDebugUnitTest' : 'test';
  const taskPath = module ? `:${module}:${baseTask}` : baseTask;
  const command = `${gradleCmd} ${taskPath}`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workingDir,
      timeout: 300000,
      env: javaEnv(),
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
 * Run Android Lint for static analysis.
 */
export async function runAndroidLint(workingDir: string, module?: string): Promise<TestRunResult> {
  const startTime = Date.now();
  const gradleCmd = await getGradleCommand(workingDir);
  const taskPath = module ? `:${module}:lintDebug` : 'lintDebug';
  const command = `${gradleCmd} ${taskPath}`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workingDir,
      timeout: 180000,
      env: javaEnv(),
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
 * Run ktlint for Kotlin code style checks.
 */
export async function runKtlint(workingDir: string): Promise<TestRunResult> {
  const startTime = Date.now();
  const gradleCmd = await getGradleCommand(workingDir);
  const command = `${gradleCmd} ktlintCheck`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workingDir,
      timeout: 120000,
      env: javaEnv(),
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
 * Build Android project without running tests.
 */
export async function runGradleBuild(workingDir: string, module?: string): Promise<TestRunResult> {
  const startTime = Date.now();
  const gradleCmd = await getGradleCommand(workingDir);
  const taskPath = module ? `:${module}:assembleDebug` : 'assembleDebug';
  const command = `${gradleCmd} ${taskPath}`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workingDir,
      timeout: 300000,
      env: javaEnv(),
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
 * Resolve Gradle dependencies.
 */
export async function runGradleSync(workingDir: string): Promise<TestRunResult> {
  const startTime = Date.now();
  const gradleCmd = await getGradleCommand(workingDir);
  const command = `${gradleCmd} dependencies`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workingDir,
      timeout: 180000,
      env: javaEnv(),
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
 * Verify Android development environment is properly configured.
 * Checks: Java, Gradle wrapper, project files.
 */
export async function verifyAndroidEnvironment(workingDir: string): Promise<EnvironmentCheck> {
  const errors: string[] = [];

  // Check Java
  try {
    await execAsync('java -version', { cwd: workingDir, timeout: 10000, env: javaEnv() });
  } catch {
    errors.push('Java not found in PATH');
  }

  // Check for Gradle wrapper or system Gradle
  const hasGradlew = await fileExists(path.join(workingDir, 'gradlew'));
  if (!hasGradlew) {
    try {
      await execAsync('gradle --version', { cwd: workingDir, timeout: 10000 });
    } catch {
      errors.push('Neither gradlew nor gradle found');
    }
  }

  // Check for project files
  const hasBuildGradle = await fileExists(path.join(workingDir, 'build.gradle'));
  const hasBuildGradleKts = await fileExists(path.join(workingDir, 'build.gradle.kts'));
  const hasSettingsGradle = await fileExists(path.join(workingDir, 'settings.gradle'));
  const hasSettingsGradleKts = await fileExists(path.join(workingDir, 'settings.gradle.kts'));

  if (!hasBuildGradle && !hasBuildGradleKts) {
    errors.push('No build.gradle or build.gradle.kts found');
  }

  if (!hasSettingsGradle && !hasSettingsGradleKts) {
    errors.push('No settings.gradle or settings.gradle.kts found');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Determine the correct Gradle command (gradlew vs gradle).
 */
async function getGradleCommand(workingDir: string): Promise<string> {
  const gradlewPath = path.join(workingDir, 'gradlew');
  if (await fileExists(gradlewPath)) {
    return './gradlew';
  }
  return 'gradle';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
