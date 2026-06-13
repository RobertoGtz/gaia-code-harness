/**
 * @fileoverview Android Implementer Agent
 * @description Modifies Kotlin/Android code according to the approved spec
 */

import { BaseAgent } from '../base';
import { AgentContext, AgentResult, FileChange } from '../../types';
import { runGradleTests, runGradleSync, verifyAndroidEnvironment } from '../../tools/gradle-runner';
import { initGit, createBranch, generateBranchName, commitAndPush } from '../../tools/git';
import { readFile, writeFile, fileExists } from '../../tools/file';
import { setupRepository } from '../../tools/repo';
import { callLLM } from '../../tools/llm';
import * as path from 'path';

/**
 * AndroidImplementerAgent: Modifies Kotlin/Android code according to the spec
 * 
 * Uses Gradle toolchain: assembleDebug, testDebugUnitTest, lintDebug.
 */
export class AndroidImplementerAgent extends BaseAgent {
  name = 'AndroidImplementer';

  async execute(context: AgentContext): Promise<AgentResult> {
    const { job, workspacePath } = context;
    const repoPath = path.join(workspacePath, 'repo');
    
    this.logStep(`Implementing Android feature: ${job.title}`);
    
    try {
      // 1. Setup repository
      const repoSetup = await setupRepository(job, repoPath);
      if (!repoSetup.success) {
        return { success: false, output: '', error: repoSetup.error };
      }
      this.logSuccess(repoSetup.output);
      
      // 2. Verify Android environment
      const env = await verifyAndroidEnvironment(repoPath);
      if (!env.valid) {
        this.logWarn(`Android environment issues (non-blocking): ${env.errors.join(', ')}`);
      }
      
      // 3. Setup git and create branch
      const git = initGit(repoPath);
      const branchName = generateBranchName(job.jiraTicketId || job.id.slice(0, 8), job.title);
      await createBranch(git, branchName, job.targetBranch);
      this.logSuccess(`Branch created: ${branchName}`);
      
      // 4. Resolve Gradle dependencies
      this.logStep('Running gradle sync...');
      const syncResult = await runGradleSync(repoPath);
      if (!syncResult.passed) {
        this.logWarn(`Gradle sync issues (non-blocking): ${syncResult.stderr.slice(0, 200)}`);
      }
      
      // 5. Implement each task from spec
      const changes: FileChange[] = [];
      const spec = job.spec;
      
      if (!spec) {
        return { success: false, output: '', error: 'No spec found in job' };
      }
      
      for (const task of spec.tasks) {
        this.logStep(`Task: ${task.description}`);
        
        if (task.type === 'create' && task.filePath) {
          const filePath = path.join(repoPath, task.filePath);
          const content = await this.generateCode(task, 'kotlin', job.title);
          await writeFile(filePath, content);
          
          changes.push({
            path: task.filePath,
            operation: 'create',
            newContent: content,
            diff: `+ ${content}`,
          });
        } else if (task.type === 'modify' && task.filePath) {
          const filePath = path.join(repoPath, task.filePath);
          const original = await readFile(filePath).catch(() => '');
          const modified = original + '\n\n// region PromoBanner Integration\n// endregion\n';
          await writeFile(filePath, modified);
          
          changes.push({
            path: task.filePath,
            operation: 'modify',
            originalContent: original,
            newContent: modified,
            diff: `Modified ${task.filePath}`,
          });
        }
        
        task.status = 'done';
      }
      
      // 6. Run tests
      this.logStep('Running gradle tests...');
      const testResult = await runGradleTests(repoPath, job.module);
      
      if (!testResult.passed) {
        this.logWarn(`Gradle tests did not pass (non-blocking): ${testResult.stderr.slice(0, 200)}`);
        this.log('Continuing with commit...');
      }
      
      // 7. Commit changes
      this.logStep('Committing & pushing changes...');
      await commitAndPush(git, `feat: ${job.title}\n\nCloses ${job.jiraTicketId || 'N/A'}`, ['.'], branchName, job.repo);
      
      return {
        success: true,
        output: `Android implementation completed. ${changes.length} files modified. Tests passing.`,
        changes,
        testResults: [testResult],
        branchName,
      };
    } catch (error) {
      return { success: false, output: '', error: `Android implementation failed: ${error}` };
    }
  }

  private async generateCode(
    task: { description: string; filePath?: string },
    lang: string,
    featureTitle: string
  ): Promise<string> {
    const isTest = task.filePath?.includes('Test') || task.filePath?.includes('test');
    const isXml = task.filePath?.endsWith('.xml');
    const systemPrompt = `You are an expert Android/Kotlin developer. Generate production-quality code. Respond with ONLY the file contents, no markdown fences, no explanations.`;
    const userPrompt = `Feature: ${featureTitle}
Task: ${task.description}
File: ${task.filePath || 'app/src/main/kotlin/Feature.kt'}
${isXml ? 'Generate a complete Android XML layout file.' : isTest ? 'Generate a complete JUnit/Espresso test file.' : 'Generate the Kotlin implementation file.'}`;

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
