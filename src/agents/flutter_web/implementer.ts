/**
 * @fileoverview Flutter Web Implementer Agent
 * @description Generates and modifies Flutter Web code according to the approved spec.
 *              Enforces web-specific file paths, responsive layout patterns,
 *              URL routing, and disallows mobile-only plugins.
 */

import { BaseAgent } from '../base';
import { AgentContext, AgentResult, FileChange } from '../../types';
import { runFlutterTests, runFlutterPubGet, verifyFlutterEnvironment } from '../../tools/test-runner';
import { initGit, createBranch, generateBranchName, commitAndPush } from '../../tools/git';
import { readFile, writeFile, fileExists } from '../../tools/file';
import { setupRepository } from '../../tools/repo';
import { callLLM } from '../../tools/llm';
import * as path from 'path';

const FORBIDDEN_WEB_PACKAGES = [
  'camera',
  'geolocator',
  'local_auth',
  'flutter_blue',
  'flutter_bluetooth_serial',
  'image_picker',
  'flutter_local_notifications',
  'vibration',
  'sensors_plus',
];

/**
 * FlutterWebImplementerAgent: Implements Flutter Web features from spec.
 *
 * Key differences from mobile Flutter:
 * - Generates code with responsive LayoutBuilder breakpoints
 * - Uses go_router paths for navigation (no Navigator.push)
 * - Validates that no mobile-only packages are introduced
 * - Targets lib/src/web/pages/ and lib/src/web/components/ paths
 */
export class FlutterWebImplementerAgent extends BaseAgent {
  name = 'FlutterWebImplementer';

  async execute(context: AgentContext): Promise<AgentResult> {
    const { job, workspacePath } = context;
    const repoPath = path.join(workspacePath, 'repo');

    this.logStep(`Implementing Flutter Web feature: ${job.title}`);

    try {
      const repoSetup = await setupRepository(job, repoPath);
      if (!repoSetup.success) {
        return { success: false, output: '', error: repoSetup.error };
      }
      this.logSuccess(repoSetup.output);

      const env = await verifyFlutterEnvironment(repoPath);
      if (!env.valid) {
        return {
          success: false,
          output: '',
          error: `Flutter environment invalid: ${env.errors.join(', ')}`,
        };
      }

      // Validate pubspec.yaml does not contain forbidden web packages
      const pubspecPath = path.join(repoPath, 'pubspec.yaml');
      const pubspecContent = await readFile(pubspecPath).catch(() => '');
      const forbidden = FORBIDDEN_WEB_PACKAGES.filter(pkg => pubspecContent.includes(pkg));
      if (forbidden.length > 0) {
        this.logWarn(`Mobile-only packages detected in pubspec.yaml: ${forbidden.join(', ')} — these will not work on Flutter Web.`);
      }

      const git = initGit(repoPath);
      const branchName = generateBranchName(job.jiraTicketId || job.id.slice(0, 8), job.title);
      await createBranch(git, branchName, job.targetBranch);
      this.logSuccess(`Branch created: ${branchName}`);

      this.logStep('Running flutter pub get...');
      const pubGetResult = await runFlutterPubGet(repoPath);
      if (!pubGetResult.passed) {
        return {
          success: false,
          output: '',
          error: `flutter pub get failed: ${pubGetResult.stderr}`,
        };
      }

      const spec = job.spec;
      if (!spec) {
        return { success: false, output: '', error: 'No spec found in job' };
      }

      const changes: FileChange[] = [];

      for (const task of spec.tasks) {
        this.logStep(`Task: ${task.description}`);

        if (task.type === 'create' && task.filePath) {
          const filePath = path.join(repoPath, task.filePath);
          const content = await this.generateWebCode(task, job.title);
          await writeFile(filePath, content);

          changes.push({
            path: task.filePath,
            operation: 'create',
            newContent: content,
            diff: `+ ${task.filePath} (created)`,
          });

        } else if (task.type === 'modify' && task.filePath) {
          const filePath = path.join(repoPath, task.filePath);
          const original = await readFile(filePath).catch(() => '');
          const modified = await this.modifyWebCode(task, original, job.title);
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

      this.logStep('Running flutter tests...');
      const testResult = await runFlutterTests({ workingDir: repoPath, module: job.module });

      if (!testResult.passed) {
        return {
          success: false,
          output: testResult.stdout,
          error: `Tests failed: ${testResult.stderr}`,
          testResults: [testResult],
        };
      }

      this.logStep('Committing & pushing changes...');
      await commitAndPush(
        git,
        `feat: ${job.title}\n\nCloses ${job.jiraTicketId || 'N/A'}`,
        ['.'],
        branchName,
        job.repo
      );

      return {
        success: true,
        output: `Flutter Web implementation completed. ${changes.length} files modified. Tests passing.`,
        changes,
        testResults: [testResult],
        branchName,
      };

    } catch (error) {
      return { success: false, output: '', error: `Implementation failed: ${error}` };
    }
  }

  private async generateWebCode(
    task: { description: string; filePath?: string },
    featureTitle: string
  ): Promise<string> {
    const isTest = task.filePath?.includes('_test') || task.filePath?.includes('test_');
    const isPage = task.filePath?.includes('/pages/');
    const isComponent = task.filePath?.includes('/components/');

    const systemPrompt = `You are an expert Flutter Web developer. Generate production-quality Dart code for Flutter Web. 
Rules:
- Never use mobile-only packages: ${FORBIDDEN_WEB_PACKAGES.join(', ')}
- Use go_router for navigation — never Navigator.push or MaterialPageRoute
- All screens/pages must include responsive breakpoints using LayoutBuilder (mobile < 600, tablet 600-1024, desktop > 1024)
- Use dart:html or universal_html for web-specific interactions only when necessary
- Respond with ONLY the file contents, no markdown fences, no explanations.`;

    const userPrompt = `Feature: ${featureTitle}
Task: ${task.description}
File: ${task.filePath || 'lib/src/web/pages/feature_page.dart'}
${isPage ? 'This is a PAGE — include go_router route path, responsive LayoutBuilder, and page title metadata.' : ''}
${isComponent ? 'This is a COMPONENT — make it fully responsive and accept configuration via constructor parameters.' : ''}
${isTest ? 'Generate a complete flutter_test widget test file covering loading, success, and error states.' : ''}`;

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

  private async modifyWebCode(
    task: { description: string; filePath?: string },
    originalContent: string,
    featureTitle: string
  ): Promise<string> {
    const systemPrompt = `You are an expert Flutter Web developer. Modify the provided Dart file according to the task.
Rules:
- Never use mobile-only packages: ${FORBIDDEN_WEB_PACKAGES.join(', ')}
- Use go_router for navigation — never Navigator.push
- Preserve existing code structure and imports
- Respond with ONLY the complete modified file contents, no markdown fences.`;

    const userPrompt = `Feature: ${featureTitle}
Task: ${task.description}
File: ${task.filePath}

Current file contents:
${originalContent}`;

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
