/**
 * @fileoverview Generic Implementer Agent
 * @description Platform-agnostic code implementation. Uses PlatformSkill for
 *              toolchain commands (build, test) and LLM prompt context.
 */

import { BaseAgent } from './base';
import { AgentContext, AgentResult, FileChange, TestResult } from '../types';
import { TestRunResult } from '../tools/test-runner';
import { readFile, writeFile } from '../tools/file';
import * as fs from 'fs/promises';
import { setupRepository } from '../tools/repo';
import { initGit, createBranch, generateBranchName, commitAndPush } from '../tools/git';
import { callLLM } from '../tools/llm';
import { loadSkill } from '../skills';
import { GaiaError, GaiaRepoError, GaiaTestError } from '../errors';
import * as path from 'path';

export class ImplementerAgent extends BaseAgent {
  name = 'Implementer';

  async execute(context: AgentContext): Promise<AgentResult> {
    const { job, workspacePath } = context;
    const repoPath = path.join(workspacePath, 'repo');
    this.logStep(`Implementing: ${job.title} [${job.platform}]`);

    try {
      const skill = await loadSkill(job.platform);
      this.log(`Loaded skill: ${skill.displayName}`);

      const repoSetup = await setupRepository(job, repoPath);
      if (!repoSetup.success) {
        throw new GaiaRepoError(
          `[${job.platform}] Cannot clone repository '${job.repo}' (branch: ${job.targetBranch}). Check GITHUB_TOKEN and repo permissions.`,
          repoSetup.error
        );
      }
      this.logSuccess(repoSetup.output);

      await skill.verifyEnvironment(repoPath); // throws GaiaEnvError on failure

      const git = initGit(repoPath);
      const branchName = generateBranchName(job.jiraTicketId || job.id.slice(0, 8), job.title);
      try {
        await createBranch(git, branchName, job.targetBranch);
      } catch (err) {
        throw new GaiaRepoError(
          `[${job.platform}] Failed to create branch '${branchName}' from '${job.targetBranch}' in '${job.repo}'. Branch may already exist or base branch is invalid.`,
          String(err)
        );
      }
      this.logSuccess(`Branch created: ${branchName}`);

      this.logStep('Resolving dependencies...');
      await skill.build(repoPath, job.module); // throws GaiaBuildError on failure

      const spec = job.spec;
      if (!spec) return { success: false, output: '', error: 'No spec found in job' };

      const promptCtx = skill.getPromptContext(job);
      const pubspecRaw = await fs.readFile(path.join(repoPath, 'pubspec.yaml'), 'utf-8').catch(() => '');
      const changes: FileChange[] = [];

      for (const task of spec.tasks) {
        this.logStep(`Task [${task.type}]: ${task.description}`);

        if ((task.type === 'create' || task.type === 'test') && task.filePath) {
          const filePath = path.join(repoPath, task.filePath);
          const content = await this.generateCode(task, promptCtx.implementerSystem, job.title, pubspecRaw);
          await writeFile(filePath, content);
          changes.push({ path: task.filePath, operation: 'create', newContent: content, diff: `+ ${task.filePath}` });

        } else if (task.type === 'modify' && task.filePath) {
          const filePath = path.join(repoPath, task.filePath);
          const original = await readFile(filePath).catch(() => '');
          const modified = await this.modifyCode(task, original, promptCtx.implementerSystem, job.title, pubspecRaw);
          await writeFile(filePath, modified);
          changes.push({ path: task.filePath, operation: 'modify', originalContent: original, newContent: modified, diff: `~ ${task.filePath}` });
        }

        task.status = 'done';
      }

      this.logStep('Running tests...');
      const MAX_FIX_ATTEMPTS = 3;
      let testResult = await skill.test(repoPath, job.module).catch((e: any) => ({
        passed: false, command: '', stdout: String(e?.message ?? ''), stderr: String(e?.detail ?? e), exitCode: 1, duration: 0,
      } as import('../tools/test-runner').TestRunResult));

      for (let attempt = 1; !testResult.passed && attempt <= MAX_FIX_ATTEMPTS; attempt++) {
        const errorOutput = [testResult.stdout, testResult.stderr].filter(Boolean).join('\n').slice(0, 3000);
        this.logStep(`Tests failed (attempt ${attempt}/${MAX_FIX_ATTEMPTS}) — asking LLM to fix errors...`);
        this.log(errorOutput.slice(0, 300));

        const fixedFiles = await this.fixAllFiles(changes.map(c => c.path), repoPath, errorOutput, promptCtx.implementerSystem, job.title, pubspecRaw);
        this.log(`LLM fix returned ${Object.keys(fixedFiles).length} file(s): ${Object.keys(fixedFiles).join(', ')}`);
        for (const [relPath, content] of Object.entries(fixedFiles)) {
          const filePath = path.join(repoPath, relPath);
          await writeFile(filePath, content);
          const change = changes.find(c => c.path === relPath);
          if (change) change.newContent = content;
        }

        this.logStep(`Retrying tests (attempt ${attempt + 1})...`);
        testResult = await skill.test(repoPath, job.module).catch((e: any) => ({
          passed: false, command: '', stdout: String(e?.message ?? ''), stderr: String(e?.detail ?? e), exitCode: 1, duration: 0,
        } as import('../tools/test-runner').TestRunResult));
        if (testResult.passed) this.logSuccess('Tests passed after LLM fix!');
      }

      if (!testResult.passed) {
        const stderr = [testResult.stdout, testResult.stderr].filter(Boolean).join('\n').slice(0, 500);
        throw new GaiaTestError(
          `[${job.platform}] \`${testResult.command || 'test'}\` failed after ${MAX_FIX_ATTEMPTS} fix attempts`,
          stderr
        );
      }

      this.logStep('Committing & pushing changes...');
      try {
        await commitAndPush(git, `feat: ${job.title}\n\nCloses ${job.jiraTicketId || 'N/A'}`, ['.'], branchName, job.repo);
      } catch (err) {
        throw new GaiaRepoError(
          `[${job.platform}] Failed to push branch '${branchName}' to '${job.repo}'. Check push permissions and GITHUB_TOKEN scope.`,
          String(err)
        );
      }

      return {
        success: true,
        output: `Implementation completed. ${changes.length} files modified. Tests passing.`,
        changes,
        testResults: [this.toTestResult(testResult)],
        branchName,
      };
    } catch (error) {
      if (error instanceof GaiaError) {
        return { success: false, output: '', error: error.message, errorCode: error.code };
      }
      return { success: false, output: '', error: `Implementation failed: ${error}`, errorCode: 'UNKNOWN' };
    }
  }

  /**
   * TDD mode: Red-Green-Refactor one task at a time.
   * Separates test tasks from implementation tasks and interleaves:
   *   for each test task → write test (RED) → write impl (GREEN) → run build → log
   */
  async executeTDD(context: AgentContext): Promise<AgentResult> {
    const { job, workspacePath } = context;
    const repoPath = path.join(workspacePath, 'repo');
    this.logStep(`[TDD] Implementing: ${job.title} [${job.platform}]`);

    try {
      const skill = await loadSkill(job.platform);
      this.log(`Loaded skill: ${skill.displayName}`);

      const repoSetup = await setupRepository(job, repoPath);
      if (!repoSetup.success) throw new GaiaRepoError(`[${job.platform}] Cannot clone '${job.repo}'`, repoSetup.error);
      this.logSuccess(repoSetup.output);

      await skill.verifyEnvironment(repoPath);

      const git = initGit(repoPath);
      const branchName = generateBranchName(job.jiraTicketId || job.id.slice(0, 8), job.title);
      try { await createBranch(git, branchName, job.targetBranch); }
      catch (err) { throw new GaiaRepoError(`[${job.platform}] Failed to create branch '${branchName}'`, String(err)); }
      this.logSuccess(`Branch created: ${branchName}`);

      this.logStep('Resolving dependencies...');
      await skill.build(repoPath, job.module);

      const spec = job.spec;
      if (!spec) return { success: false, output: '', error: 'No spec found' };

      const promptCtx = skill.getPromptContext(job);
      const pubspecRaw = await fs.readFile(path.join(repoPath, 'pubspec.yaml'), 'utf-8').catch(() => '');
      const changes: FileChange[] = [];

      // Pair test tasks with their corresponding create/modify tasks
      const testTasks   = spec.tasks.filter(t => t.type === 'test');
      const implTasks   = spec.tasks.filter(t => t.type !== 'test');

      // First write all non-test impl files (models, viewmodels) so tests can import them
      for (const task of implTasks) {
        this.logStep(`[RED prep] Task [${task.type}]: ${task.description}`);
        if ((task.type === 'create' || task.type === 'modify') && task.filePath) {
          const filePath = path.join(repoPath, task.filePath);
          const original = task.type === 'modify' ? await readFile(filePath).catch(() => '') : '';
          const content  = task.type === 'modify'
            ? await this.modifyCode(task, original, promptCtx.implementerSystem, job.title, pubspecRaw)
            : await this.generateCode(task, promptCtx.implementerSystem, job.title, pubspecRaw);
          await writeFile(filePath, content);
          changes.push({ path: task.filePath, operation: task.type === 'modify' ? 'modify' : 'create', originalContent: original, newContent: content, diff: `${task.type === 'modify' ? '~' : '+'} ${task.filePath}` });
          task.status = 'done';
        }
      }

      // Confirm impl compiles before writing tests (GREEN baseline)
      let baseline = await skill.test(repoPath, job.module).catch((e: any) => ({
        passed: false, command: '', stdout: String(e?.message ?? ''), stderr: String(e?.detail ?? e), exitCode: 1, duration: 0,
      } as import('../tools/test-runner').TestRunResult));

      if (!baseline.passed) {
        // Fix impl before moving to test cycle
        const err = [baseline.stdout, baseline.stderr].filter(Boolean).join('\n').slice(0, 3000);
        this.logStep(`Impl build failed — fixing before RED...`);
        const fixed = await this.fixAllFiles(changes.map(c => c.path), repoPath, err, promptCtx.implementerSystem, job.title, pubspecRaw);
        for (const [rel, content] of Object.entries(fixed)) {
          await writeFile(path.join(repoPath, rel), content);
          const ch = changes.find(c => c.path === rel);
          if (ch) ch.newContent = content;
        }
      }

      // Red-Green-Refactor per test task
      for (const testTask of testTasks) {
        this.logStep(`[RED] Writing test: ${testTask.description}`);
        if (!testTask.filePath) continue;

        const testFilePath = path.join(repoPath, testTask.filePath);
        const testContent  = await this.generateCode(testTask, promptCtx.implementerSystem, job.title, pubspecRaw);
        await writeFile(testFilePath, testContent);
        changes.push({ path: testTask.filePath, operation: 'create', newContent: testContent, diff: `+ ${testTask.filePath}` });

        // Confirm RED: build should fail only because behavior not yet tested (compile OK)
        let redResult = await skill.test(repoPath, job.module).catch((e: any) => ({
          passed: false, command: '', stdout: String(e?.message ?? ''), stderr: String(e?.detail ?? e), exitCode: 1, duration: 0,
        } as import('../tools/test-runner').TestRunResult));

        if (redResult.passed) {
          this.log(`[RED] Test passed immediately — test may not be asserting anything meaningful`);
        } else {
          this.log(`[RED] Confirmed failing (expected)`);
          // GREEN: fix impl to make this test pass
          const errOut = [redResult.stdout, redResult.stderr].filter(Boolean).join('\n').slice(0, 3000);
          const greenFiles = await this.fixAllFiles(
            changes.map(c => c.path), repoPath, errOut, promptCtx.implementerSystem, job.title, pubspecRaw
          );
          for (const [rel, content] of Object.entries(greenFiles)) {
            await writeFile(path.join(repoPath, rel), content);
            const ch = changes.find(c => c.path === rel);
            if (ch) ch.newContent = content;
          }

          const greenResult = await skill.test(repoPath, job.module).catch((e: any) => ({
            passed: false, command: '', stdout: String(e?.message ?? ''), stderr: String(e?.detail ?? e), exitCode: 1, duration: 0,
          } as import('../tools/test-runner').TestRunResult));

          if (greenResult.passed) {
            this.logSuccess(`[GREEN] Tests passing after impl fix`);
          } else {
            this.log(`[GREEN] Still failing — will be caught in final fix loop`);
          }
        }
        testTask.status = 'done';
      }

      // Final fix loop (same as normal mode) to catch any remaining failures
      this.logStep('Final test run...');
      const MAX_FIX = 3;
      let testResult = await skill.test(repoPath, job.module).catch((e: any) => ({
        passed: false, command: '', stdout: String(e?.message ?? ''), stderr: String(e?.detail ?? e), exitCode: 1, duration: 0,
      } as import('../tools/test-runner').TestRunResult));

      for (let attempt = 1; !testResult.passed && attempt <= MAX_FIX; attempt++) {
        const errorOutput = [testResult.stdout, testResult.stderr].filter(Boolean).join('\n').slice(0, 3000);
        this.logStep(`Tests failed (attempt ${attempt}/${MAX_FIX}) — fixing...`);
        const fixedFiles = await this.fixAllFiles(changes.map(c => c.path), repoPath, errorOutput, promptCtx.implementerSystem, job.title, pubspecRaw);
        for (const [rel, content] of Object.entries(fixedFiles)) {
          await writeFile(path.join(repoPath, rel), content);
          const ch = changes.find(c => c.path === rel);
          if (ch) ch.newContent = content;
        }
        testResult = await skill.test(repoPath, job.module).catch((e: any) => ({
          passed: false, command: '', stdout: String(e?.message ?? ''), stderr: String(e?.detail ?? e), exitCode: 1, duration: 0,
        } as import('../tools/test-runner').TestRunResult));
        if (testResult.passed) this.logSuccess('Tests passed after fix!');
      }

      if (!testResult.passed) {
        const stderr = [testResult.stdout, testResult.stderr].filter(Boolean).join('\n').slice(0, 500);
        throw new GaiaTestError(`[${job.platform}] \`${testResult.command || 'test'}\` failed after ${MAX_FIX} fix attempts`, stderr);
      }

      this.logStep('Committing & pushing changes...');
      try { await commitAndPush(git, `feat: ${job.title}\n\nCloses ${job.jiraTicketId || 'N/A'}`, ['.'], branchName, job.repo); }
      catch (err) { throw new GaiaRepoError(`[${job.platform}] Failed to push '${branchName}'`, String(err)); }

      return {
        success: true,
        output: `TDD implementation completed. ${changes.length} files. Tests passing.`,
        changes,
        testResults: [this.toTestResult(testResult)],
        branchName,
      };
    } catch (error) {
      if (error instanceof GaiaError) return { success: false, output: '', error: error.message, errorCode: error.code };
      return { success: false, output: '', error: `TDD implementation failed: ${error}`, errorCode: 'UNKNOWN' };
    }
  }

  private toTestResult(r: TestRunResult): TestResult {
    return {
      passed: r.passed,
      command: r.command ?? '',
      stdout: r.stdout,
      stderr: r.stderr,
      exitCode: r.exitCode ?? 0,
      duration: r.duration ?? 0,
    };
  }

  private async generateCode(
    task: { description: string; filePath?: string },
    systemPrompt: string,
    featureTitle: string,
    pubspec = ''
  ): Promise<string> {
    const pubspecCtx = pubspec ? `\n\npubspec.yaml (use ONLY packages already listed here, exact package name for imports):\n${pubspec}` : '';
    const userPrompt = `Feature: ${featureTitle}\nTask: ${task.description}\nFile: ${task.filePath || 'output file'}${pubspecCtx}\nGenerate the complete file contents. Use exact package name from pubspec.yaml for all imports.`;
    try {
      const response = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);
      return response.text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
    } catch (err) {
      throw new Error(`LLM unavailable: ${err}`);
    }
  }

  private async fixAllFiles(
    relPaths: string[],
    repoPath: string,
    errorOutput: string,
    systemPrompt: string,
    featureTitle: string,
    pubspec = ''
  ): Promise<Record<string, string>> {
    const fileContents: string[] = [];
    const validPaths: string[] = [];
    for (const relPath of relPaths) {
      const content = await readFile(path.join(repoPath, relPath)).catch(() => '');
      if (!content) continue;
      fileContents.push(`=== FILE: ${relPath} ===\n${content}`);
      validPaths.push(relPath);
    }
    const pubspecCtx = pubspec ? `\n\npubspec.yaml (use ONLY packages listed here):\n${pubspec}` : '';
    const userPrompt = `Feature: ${featureTitle}${pubspecCtx}\n\nThe following build/test errors occurred:\n${errorOutput}\n\nFix ALL files below so they are consistent with each other and all errors are resolved.\nIMPORTANT: Each class/struct/enum must be declared in EXACTLY ONE file. If you see "invalid redeclaration" errors, remove the duplicate definition from all files except the one where it belongs (e.g. keep FeedItem only in Models/FeedItem.swift, NOT inside ViewModel files).\nReturn ONLY a JSON object mapping file path to corrected file contents, e.g.:\n{"path/to/file.swift": "...contents..."}\n\nFiles to fix:\n${fileContents.join('\n\n')}`;
    try {
      const response = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);
      const raw = response.text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') result[k] = v;
      }
      return result;
    } catch (err) {
      this.log(`fixAllFiles JSON parse failed: ${err}`);
      return {};
    }
  }

  private async fixCode(
    filePath: string,
    currentContent: string,
    errorOutput: string,
    systemPrompt: string,
    featureTitle: string,
    pubspec = ''
  ): Promise<string> {
    const pubspecCtx = pubspec ? `\n\npubspec.yaml (use ONLY packages already listed here):\n${pubspec}` : '';
    const userPrompt = `Feature: ${featureTitle}\nFile: ${filePath}${pubspecCtx}\n\nThe following build/test errors occurred:\n${errorOutput}\n\nCurrent file contents:\n${currentContent}\n\nFix the errors and return the complete corrected file. Use exact package name from pubspec.yaml for all imports.`;
    try {
      const response = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);
      return response.text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
    } catch (err) {
      throw new Error(`LLM fix unavailable: ${err}`);
    }
  }

  private async modifyCode(
    task: { description: string; filePath?: string },
    originalContent: string,
    systemPrompt: string,
    featureTitle: string,
    pubspec = ''
  ): Promise<string> {
    const pubspecCtx = pubspec ? `\n\npubspec.yaml (use ONLY packages already listed here, exact package name for imports):\n${pubspec}` : '';
    const userPrompt = `Feature: ${featureTitle}\nTask: ${task.description}\nFile: ${task.filePath}${pubspecCtx}\n\nCurrent file contents:\n${originalContent}\n\nReturn the complete modified file. Use exact package name from pubspec.yaml for all imports.`;
    try {
      const response = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);
      return response.text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
    } catch (err) {
      throw new Error(`LLM unavailable: ${err}`);
    }
  }
}
