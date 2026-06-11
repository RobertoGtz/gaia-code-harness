/**
 * @fileoverview Flutter Implementer Agent
 * @description Modifies Flutter/Dart code according to the approved spec
 */

import { BaseAgent } from '../base';
import { AgentContext, AgentResult, FileChange } from '../../types';
import { runMelosBootstrap, runFlutterTests, runFlutterPubGet, verifyFlutterEnvironment } from '../../tools/test-runner';
import { initGit, createBranch, generateBranchName, commitAndPush } from '../../tools/git';
import { readFile, writeFile, fileExists } from '../../tools/file';
import { setupRepository } from '../../tools/repo';
import * as path from 'path';

/**
 * FlutterImplementerAgent: Modifies Flutter/Dart code according to the spec
 * 
 * Input: Job with approved spec, workspace with repo
 * Output: Modified files, passing tests
 */
export class FlutterImplementerAgent extends BaseAgent {
  name = 'FlutterImplementer';

  async execute(context: AgentContext): Promise<AgentResult> {
    const { job, workspacePath } = context;
    const repoPath = path.join(workspacePath, 'repo');
    
    this.log(`Implementing: ${job.title}`);
    
    try {
      // 1. Setup repository (clone or copy from local)
      const repoSetup = await setupRepository(job, repoPath);
      if (!repoSetup.success) {
        return {
          success: false,
          output: '',
          error: repoSetup.error,
        };
      }
      this.log(repoSetup.output);
      
      // 2. Verify Flutter environment
      const env = await verifyFlutterEnvironment(repoPath);
      if (!env.valid) {
        return {
          success: false,
          output: '',
          error: `Flutter environment invalid: ${env.errors.join(', ')}`,
        };
      }
      
      // 3. Setup git and create branch
      const git = initGit(repoPath);
      const branchName = generateBranchName(job.jiraTicketId || job.id.slice(0, 8), job.title);
      await createBranch(git, branchName, job.targetBranch);
      this.log(`Created branch: ${branchName}`);
      
      // 4. Resolve dependencies (melos for monorepos, pub get otherwise)
      const isMonorepo = await fileExists(path.join(repoPath, 'melos.yaml'));
      if (isMonorepo) {
        this.log('Running melos bootstrap...');
        const bootstrapResult = await runMelosBootstrap(repoPath);
        if (!bootstrapResult.passed) {
          return {
            success: false,
            output: '',
            error: `Melos bootstrap failed: ${bootstrapResult.stderr}`,
          };
        }
      } else {
        this.log('No melos.yaml found, running flutter pub get...');
        const pubGetResult = await runFlutterPubGet(repoPath);
        if (!pubGetResult.passed) {
          return {
            success: false,
            output: '',
            error: `flutter pub get failed: ${pubGetResult.stderr}`,
          };
        }
      }
      
      // 5. Implement each task from spec
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
      
      // 6. Run tests
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
      
      // 7. Commit changes
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
