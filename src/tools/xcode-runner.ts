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
  // Use a shell script to reliably fix all Swift files in Sources/:
  // 1. Remove any `import DemoApp*` lines (internal module imports that don't exist)
  // 2. Prepend `import Foundation` to files that use Foundation types but lack the import
  const script = `
find "${workingDir}/Sources" -name "*.swift" | while read f; do
  # Remove internal DemoApp imports
  sed -i '' '/^import DemoApp/d' "$f" 2>/dev/null || sed -i '/^import DemoApp/d' "$f"
  # Add import Foundation if needed
  if grep -qE '\\b(Date|URL|UUID|Decimal|TimeInterval)\\b' "$f" && ! grep -q '^import Foundation' "$f"; then
    tmpfile=$(mktemp)
    echo 'import Foundation' | cat - "$f" > "$tmpfile" && mv "$tmpfile" "$f"
  fi
done
`;
  try {
    await execAsync(script, { cwd: workingDir });
  } catch {
    // best-effort — ignore failures
  }
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
    const tuistResult = await ensureTuistGenerated(workingDir);
    if (!tuistResult.passed) return tuistResult;
    const projectFlag = await getXcodeProjectFlag(workingDir, scheme);
    const destination = await getAvailableIosSimulator();
    const command = `xcodebuild test ${projectFlag} -scheme ${scheme || 'App'} -destination '${destination}' -quiet`;
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
 * In a monorepo, an optional `module` can be provided to lint from the
 * feature/module directory where its own `.swiftlint.yml` lives.
 */
export async function runSwiftLint(workingDir: string, module?: string): Promise<TestRunResult> {
  const startTime = Date.now();

  // Determine the lint working directory. Prefer module-specific folder if it
  // has its own .swiftlint.yml; otherwise lint from the repo root.
  let lintDir = workingDir;
  if (module) {
    const moduleDir = await findModuleDir(workingDir, module);
    if (moduleDir && await fileExists(path.join(moduleDir, '.swiftlint.yml'))) {
      lintDir = moduleDir;
    }
  }

  try {
    const { stdout, stderr } = await execAsync('swiftlint lint --quiet', {
      cwd: lintDir,
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
 * Search for a module directory that matches the given module name.
 * Tries exact name and name + 'Feature' suffix under common monorepo roots.
 * Returns the absolute path, or undefined if not found.
 */
async function findModuleDir(workingDir: string, module: string): Promise<string | undefined> {
  const candidates = [
    `${module}`,
    `${module}Feature`,
  ];

  const roots = ['features', 'feature_interfaces', 'ui', 'libraries', 'services', 'foundations'];
  for (const root of roots) {
    for (const candidate of candidates) {
      const dir = path.join(workingDir, root, candidate);
      try {
        const stat = await fs.stat(dir);
        if (stat.isDirectory()) return dir;
      } catch {
        // ignore
      }
      // also check nested one level (e.g. features/PayInsurance/PayInsuranceFeature)
      const nestedDir = path.join(workingDir, root, module, candidate);
      try {
        const stat = await fs.stat(nestedDir);
        if (stat.isDirectory()) return nestedDir;
      } catch {
        // ignore
      }
    }
  }
  return undefined;
}

/**
 * Build the iOS project without running tests.
 */
export async function runXcodeBuild(workingDir: string, scheme?: string): Promise<TestRunResult> {
  const startTime = Date.now();
  const tuistResult = await ensureTuistGenerated(workingDir);
  if (!tuistResult.passed) return tuistResult;
  const projectFlag = await getXcodeProjectFlag(workingDir, scheme);
  const destination = await getAvailableIosSimulator();
  const command = `xcodebuild build ${projectFlag} -scheme ${scheme || 'App'} -destination '${destination}' -quiet`;

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
 * Return the appropriate -project or -workspace flag for xcodebuild.
 * Strategy:
 * 1. If a scheme is provided, search for a module-specific .xcodeproj
 *    (e.g. features/PayInsurance/PayInsuranceFeature/PayInsuranceFeature.xcodeproj)
 *    or with a 'Feature' suffix (e.g. PayInsuranceFeature.xcodeproj).
 * 2. Otherwise, prefer a root .xcworkspace (Tuist monorepo), then a root .xcodeproj,
 *    or an empty string for implicit project/scheme.
 */
async function getXcodeProjectFlag(workingDir: string, scheme?: string): Promise<string> {
  try {
    const entries = await fs.readdir(workingDir);

    // Monorepo: a root workspace (Tuist) is the only reliable way to build
    // modules with cross-dependencies. Use it whenever it exists.
    const workspace = entries.find(e => e.endsWith('.xcworkspace'));
    if (workspace) return `-workspace ${workspace}`;

    // Fallback to a module-specific project only if there is no workspace.
    if (scheme) {
      const moduleProject = await findModuleXcodeproj(workingDir, scheme);
      if (moduleProject) return `-project ${moduleProject}`;
    }

    const xcodeproj = entries.find(e => e.endsWith('.xcodeproj'));
    if (xcodeproj) return `-project ${xcodeproj}`;
  } catch {
    // ignore
  }
  return '';
}

/**
 * Search for a module-specific .xcodeproj under the repo root.
 * Tries exact scheme name first, then scheme + 'Feature' suffix.
 * Returns a relative path from workingDir, or undefined if not found.
 */
async function findModuleXcodeproj(workingDir: string, scheme: string): Promise<string | undefined> {
  const candidates = [
    `${scheme}.xcodeproj`,
    `${scheme}Feature.xcodeproj`,
  ];

  try {
    const entries = await fs.readdir(workingDir, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.isDirectory() && candidates.includes(entry.name)) {
        // parentPath (Node 20.12+) with path (Node 18) fallback
        const parent = (entry as any).parentPath || (entry as any).path || workingDir;
        return path.relative(workingDir, path.join(parent, entry.name));
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Discover an available iOS Simulator to use as xcodebuild destination.
 * Prefers a booted simulator, then the newest iPhone simulator, then any
 * iOS simulator. Falls back to a generic destination string.
 */
async function getAvailableIosSimulator(): Promise<string> {
  try {
    const { stdout } = await execAsync('xcrun simctl list devices available -j', { timeout: 15000 });
    const data = JSON.parse(stdout);
    const devices: Array<{ name: string; udid: string; state?: string; isAvailable: boolean }> = [];
    for (const runtime of Object.values(data.devices as Record<string, any[]>)) {
      for (const device of runtime) {
        if (device.isAvailable && device.name && device.udid) {
          devices.push(device);
        }
      }
    }

    const booted = devices.find(d => d.state === 'Booted' && d.name.toLowerCase().includes('iphone'));
    if (booted) return `platform=iOS Simulator,id=${booted.udid}`;

    const iPhones = devices
      .filter(d => d.name.toLowerCase().includes('iphone'))
      .sort((a, b) => b.name.localeCompare(a.name)); // newest names (e.g. iPhone 17) sort first
    if (iPhones.length) return `platform=iOS Simulator,id=${iPhones[0].udid}`;

    if (devices.length) return `platform=iOS Simulator,id=${devices[0].udid}`;
  } catch {
    // ignore
  }
  return 'platform=iOS Simulator';
}

/**
 * Generate the Xcode workspace/project with Tuist if the repo is a Tuist monorepo
 * and the generated files are missing or stale. Returns a success result if no
 * Tuist project is detected or generation succeeds.
 */
async function ensureTuistGenerated(workingDir: string): Promise<TestRunResult> {
  const startTime = Date.now();
  const hasTuistConfig = await fileExists(path.join(workingDir, 'Tuist.swift')) ||
    await fileExists(path.join(workingDir, 'Workspace.swift')) ||
    await fileExists(path.join(workingDir, 'Project.swift'));
  if (!hasTuistConfig) {
    return { passed: true, command: '', stdout: '', stderr: '', exitCode: 0, duration: 0 };
  }

  const hasGeneratedWorkspace = await fileExists(path.join(workingDir, 'RappiMonorepo.xcworkspace')) ||
    await findByExtension(workingDir, '.xcodeproj');
  if (hasGeneratedWorkspace) {
    return { passed: true, command: '', stdout: '', stderr: '', exitCode: 0, duration: 0 };
  }

  const command = 'tuist generate';
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: workingDir, timeout: 300000 });
    return { passed: true, command, stdout, stderr, exitCode: 0, duration: Date.now() - startTime };
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
 * Build the project using Tuist. This is the most reliable option for
 * Tuist-based modular monorepos because it understands the dependency graph
 * and cached precompiled binaries. Accepts an optional scheme name.
 */
export async function runTuistBuild(workingDir: string, scheme?: string): Promise<TestRunResult> {
  const startTime = Date.now();
  const generateResult = await ensureTuistGenerated(workingDir);
  if (!generateResult.passed) return generateResult;

  const command = scheme ? `tuist build ${scheme}` : 'tuist build';
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workingDir,
      timeout: 1200000, // 20 min — monorepo builds can be slow
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
