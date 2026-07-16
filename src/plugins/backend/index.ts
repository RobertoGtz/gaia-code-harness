/**
 * @fileoverview Node.js / Backend Platform Skill
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { PlatformSkill, BuildResult, AnalyzeResult, PromptContext, BuildStrategy } from '../index';
import { TestRunResult } from '../../tools/test-runner';
import { GaiaEnvError, GaiaBuildError, GaiaTestError, trim } from '../../errors';
import * as path from 'path';

const execAsync = promisify(exec);

export class BackendSkill implements PlatformSkill {
  readonly displayName = 'Node.js / Backend';
  readonly sourceExtension = 'ts';
  readonly srcDirs = ['src', 'test', 'tests'];

  async verifyEnvironment(repoPath: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      await execAsync('node --version', { cwd: repoPath, timeout: 10000 });
    } catch {
      errors.push('node not found in PATH');
    }

    try {
      await execAsync('npm --version', { cwd: repoPath, timeout: 10000 });
    } catch {
      errors.push('npm not found in PATH');
    }

    if (errors.length > 0) {
      throw new GaiaEnvError(
        '[Backend] Node.js / npm not found or misconfigured.',
        errors.join('\n')
      );
    }

    return { valid: true, errors: [] };
  }

  async build(repoPath: string, _module?: string, _strategy?: BuildStrategy): Promise<BuildResult> {
    const startTime = Date.now();
    const command = 'npm run build';

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: repoPath,
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
      const result: BuildResult = {
        passed: false,
        command,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1,
        duration: Date.now() - startTime,
      };

      throw new GaiaBuildError(
        `[Backend] \`npm run build\` failed in ${path.basename(repoPath)}`,
        trim(result.stderr)
      );
    }
  }

  async test(repoPath: string, module?: string): Promise<TestRunResult> {
    const startTime = Date.now();
    const target = module ? `module '${module}'` : path.basename(repoPath);
    const command = 'npm test';

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: repoPath,
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
      const result: TestRunResult = {
        passed: false,
        command,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1,
        duration: Date.now() - startTime,
      };

      throw new GaiaTestError(
        `[Backend] \`npm test\` failed in ${target}`,
        trim(result.stderr)
      );
    }
  }

  async analyze(repoPath: string, module?: string): Promise<AnalyzeResult> {
    const startTime = Date.now();
    const target = module ? `module '${module}'` : path.basename(repoPath);
    const command = 'npm run lint';

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: repoPath,
        timeout: 180000,
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
      const stderr: string = error.stderr || '';
      const stdout: string = error.stdout || '';
      const exitCode: number = error.code || 1;

      // Non-fatal: missing lint script
      if (stderr.includes('missing script') || stdout.includes('missing script')) {
        return {
          passed: true,
          command,
          stdout,
          stderr,
          exitCode,
          duration: Date.now() - startTime,
        };
      }

      throw new GaiaTestError(
        `[Backend] \`npm run lint\` found issues in ${target}`,
        trim(stderr)
      );
    }
  }

  getPromptContext(job: { title: string; module?: string; repo: string }): PromptContext {
    const srcDir = 'src/';
    const testDir = 'tests/';

    return {
      specSystem: `You are an expert Node.js/TypeScript architect.
Design clean, testable modules following SOLID principles.
Use async/await throughout. Prefer explicit types over inference.
Organize code into src/ for production code and tests/ (or test/) for Jest tests.`,

      implementerSystem: `You are an expert Node.js/TypeScript developer.
- Source directory: ${srcDir}
- Tests directory: ${testDir} (Jest with ts-jest)
- Use async/await; no callback-style code.
- Use typed error classes (extend Error or custom base class).
- All public functions must have explicit return types.
- Use strict TypeScript: no implicit any, no non-null assertions without justification.
- Module: ${job.module ?? path.basename(job.repo)}
- Respond with ONLY file contents, no markdown fences.`,

      reviewerSystem: `You are a Node.js/TypeScript code reviewer.
Check for: TypeScript strict mode compliance, no \`any\` types, proper async/await usage,
explicit return types on all exported functions, proper error handling with typed errors,
Jest test coverage with descriptive test names, no unused imports or variables.`,

      filePatterns: {
        source: srcDir,
        test: testDir,
      },

      forbidden: [],
    };
  }
}
