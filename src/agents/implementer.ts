/**
 * @fileoverview Generic Implementer Agent
 * @description Platform-agnostic code implementation. Uses PlatformSkill for
 *              toolchain commands (build, test) and LLM prompt context.
 */

import { BaseAgent } from './base';
import { AgentContext, AgentResult, FileChange, TestResult } from '../types';
import { TestRunResult } from '../tools/test-runner';
import { readFile, writeFile } from '../tools/file';
import { setupRepository } from '../tools/repo';
import { initGit, createBranch, generateBranchName, commitAndPush } from '../tools/git';
import { callLLM } from '../tools/llm';
import { loadSkill } from '../skills';
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
      if (!repoSetup.success) return { success: false, output: '', error: repoSetup.error };
      this.logSuccess(repoSetup.output);

      const env = await skill.verifyEnvironment(repoPath);
      if (!env.valid) {
        return { success: false, output: '', error: `${skill.displayName} environment invalid: ${env.errors.join(', ')}` };
      }

      const git = initGit(repoPath);
      const branchName = generateBranchName(job.jiraTicketId || job.id.slice(0, 8), job.title);
      await createBranch(git, branchName, job.targetBranch);
      this.logSuccess(`Branch created: ${branchName}`);

      this.logStep('Resolving dependencies...');
      const buildResult = await skill.build(repoPath, job.module);
      if (!buildResult.passed) {
        return { success: false, output: '', error: `Dependency resolution failed: ${buildResult.stderr}` };
      }

      const spec = job.spec;
      if (!spec) return { success: false, output: '', error: 'No spec found in job' };

      const promptCtx = skill.getPromptContext(job);
      const changes: FileChange[] = [];

      for (const task of spec.tasks) {
        this.logStep(`Task [${task.type}]: ${task.description}`);

        if ((task.type === 'create' || task.type === 'test') && task.filePath) {
          const filePath = path.join(repoPath, task.filePath);
          const content = await this.generateCode(task, promptCtx.implementerSystem, job.title);
          await writeFile(filePath, content);
          changes.push({ path: task.filePath, operation: 'create', newContent: content, diff: `+ ${task.filePath}` });

        } else if (task.type === 'modify' && task.filePath) {
          const filePath = path.join(repoPath, task.filePath);
          const original = await readFile(filePath).catch(() => '');
          const modified = await this.modifyCode(task, original, promptCtx.implementerSystem, job.title);
          await writeFile(filePath, modified);
          changes.push({ path: task.filePath, operation: 'modify', originalContent: original, newContent: modified, diff: `~ ${task.filePath}` });
        }

        task.status = 'done';
      }

      this.logStep('Running tests...');
      const testResult = await skill.test(repoPath, job.module);
      if (!testResult.passed) {
        return { success: false, output: testResult.stdout, error: `Tests failed: ${testResult.stderr}`, testResults: [this.toTestResult(testResult)] };
      }

      this.logStep('Committing & pushing changes...');
      await commitAndPush(git, `feat: ${job.title}\n\nCloses ${job.jiraTicketId || 'N/A'}`, ['.'], branchName, job.repo);

      return {
        success: true,
        output: `Implementation completed. ${changes.length} files modified. Tests passing.`,
        changes,
        testResults: [this.toTestResult(testResult)],
        branchName,
      };
    } catch (error) {
      return { success: false, output: '', error: `Implementation failed: ${error}` };
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
    featureTitle: string
  ): Promise<string> {
    const userPrompt = `Feature: ${featureTitle}\nTask: ${task.description}\nFile: ${task.filePath || 'output file'}\nGenerate the complete file contents.`;
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

  private async modifyCode(
    task: { description: string; filePath?: string },
    originalContent: string,
    systemPrompt: string,
    featureTitle: string
  ): Promise<string> {
    const userPrompt = `Feature: ${featureTitle}\nTask: ${task.description}\nFile: ${task.filePath}\n\nCurrent file contents:\n${originalContent}\n\nReturn the complete modified file.`;
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
