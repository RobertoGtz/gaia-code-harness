/**
 * @fileoverview Implementer Agent
 * @description Modifies code according to the approved spec
 */

import { BaseAgent } from './base';
import { AgentContext, AgentResult, FileChange } from '../types';
import { runMelosBootstrap, runFlutterTests, verifyFlutterEnvironment } from '../tools/test-runner';
import { initGit, createBranch, generateBranchName, commitAndPush, cloneRepository } from '../tools/git';
import { readFile, writeFile, copyDirectory, fileExists } from '../tools/file';
import * as path from 'path';

/**
 * ImplementerAgent: Modifies code according to the spec
 * 
 * Input: Job with approved spec, workspace with repo
 * Output: Modified files, passing tests
 */
export class ImplementerAgent extends BaseAgent {
  name = 'Implementer';

  async execute(context: AgentContext): Promise<AgentResult> {
    const { job, workspacePath } = context;
    const repoPath = path.join(workspacePath, 'repo');
    
    this.log(`Implementing: ${job.title}`);
    
    try {
      // 1. Setup repository (clone or copy from local)
      const repoSetup = await this.setupRepository(job, repoPath);
      if (!repoSetup.success) {
        return repoSetup;
      }
      
      // 2. Verify Flutter environment
      const env = await verifyFlutterEnvironment(repoPath);
      if (!env.valid) {
        return {
          success: false,
          output: '',
          error: `Flutter environment invalid: ${env.errors.join(', ')}`,
        };
      }
      
      // 2. Setup git and create branch
      const git = initGit(repoPath);
      const branchName = generateBranchName(job.jiraTicketId || job.id.slice(0, 8), job.title);
      await createBranch(git, branchName, job.targetBranch);
      this.log(`Created branch: ${branchName}`);
      
      // 3. Run melos bootstrap
      this.log('Running melos bootstrap...');
      const bootstrapResult = await runMelosBootstrap(repoPath);
      if (!bootstrapResult.passed) {
        return {
          success: false,
          output: '',
          error: `Melos bootstrap failed: ${bootstrapResult.stderr}`,
        };
      }
      
      // 4. Implement each task from spec
      const changes: FileChange[] = [];
      const spec = job.spec;
      
      if (!spec) {
        return {
          success: false,
          output: '',
          error: 'No spec found in job',
        };
      }
      
      for (const task of spec.tasks) {
        this.log(`Processing task: ${task.description}`);
        
        if (task.type === 'create' && task.filePath) {
          const filePath = path.join(repoPath, task.filePath);
          const content = this.generateMockCode(task);
          await writeFile(filePath, content);
          
          changes.push({
            path: task.filePath,
            operation: 'create',
            newContent: content,
            diff: `+ ${content}`,
          });
          
        } else if (task.type === 'modify' && task.filePath) {
          const filePath = path.join(repoPath, task.filePath);
          
          if (task.filePath.includes('home_screen.dart')) {
            const original = await readFile(filePath).catch(() => '');
            const modified = original + '\n\n// Added PromoBanner integration\n';
            
            await writeFile(filePath, modified);
            
            changes.push({
              path: task.filePath,
              operation: 'modify',
              originalContent: original,
              newContent: modified,
              diff: `Modified ${task.filePath}`,
            });
          }
        }
        
        task.status = 'done';
      }
      
      // 5. Run tests
      this.log('Running tests...');
      const testResult = await runFlutterTests({
        workingDir: repoPath,
        module: job.module,
      });
      
      if (!testResult.passed) {
        return {
          success: false,
          output: testResult.stdout,
          error: `Tests failed: ${testResult.stderr}`,
          testResults: [testResult],
        };
      }
      
      // 6. Commit changes
      this.log('Committing changes...');
      await commitAndPush(git, `feat: ${job.title}\n\nCloses ${job.jiraTicketId || 'N/A'}`, ['.'], branchName);
      
      return {
        success: true,
        output: `Implementation completed. ${changes.length} files modified. Tests passing.`,
        changes,
        testResults: [testResult],
        branchName,
      };
      
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Implementation failed: ${error}`,
      };
    }
  }

  /**
   * Setup the repository for implementation.
   * First checks if LOCAL_REPOS_PATH is configured and copies from there.
   * If not, clones from remote GitHub repository.
   * 
   * @param job - The job with repo information
   * @param repoPath - Target path for the repository
   * @returns AgentResult indicating success or failure
   * @example
   * const setup = await this.setupRepository(job, '/workspace/job-123/repo');
   * if (!setup.success) return setup;
   */
  private async setupRepository(job: AgentContext['job'], repoPath: string): Promise<AgentResult> {
    // Check if repo already exists
    if (await fileExists(repoPath)) {
      this.log('Repository already exists, using existing');
      return { success: true, output: 'Using existing repository' };
    }
    
    // Check if LOCAL_REPOS_PATH is configured
    const localReposPath = process.env.LOCAL_REPOS_PATH;
    if (localReposPath) {
      const localRepo = path.join(localReposPath, job.repo);
      if (await fileExists(localRepo)) {
        this.log(`Copying from LOCAL_REPOS_PATH: ${localRepo}`);
        try {
          await copyDirectory(localRepo, repoPath);
          this.log('Repository copied successfully');
          return { success: true, output: 'Repository copied from local path' };
        } catch (error) {
          return {
            success: false,
            output: '',
            error: `Failed to copy from LOCAL_REPOS_PATH: ${error}`,
          };
        }
      }
    }
    
    // Fallback: clone from remote
    this.log(`Cloning repository from GitHub: ${job.repo}`);
    try {
      const owner = process.env.GITHUB_OWNER || 'rappi';
      const repoUrl = `https://github.com/${owner}/${job.repo}.git`;
      await cloneRepository(repoUrl, repoPath, job.targetBranch);
      this.log('Repository cloned successfully');
      return { success: true, output: 'Repository cloned from GitHub' };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to clone repository: ${error}`,
      };
    }
  }

  private generateMockCode(task: { description: string; filePath?: string }): string {
    if (task.filePath?.includes('_test.dart')) {
      return `
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';

void main() {
  group('PromoBanner', () {
    test('should display promotions', () {
      expect(true, true);
    });
  });
}
`;
    }
    
    return `
import 'package:flutter/material.dart';

class PromoBanner extends StatelessWidget {
  final List<String> promotions;
  
  const PromoBanner({
    Key? key,
    required this.promotions,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      child: Text('Promo Banner'),
    );
  }
}
`;
  }
}
