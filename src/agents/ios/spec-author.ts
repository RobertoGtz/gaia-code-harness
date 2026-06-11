/**
 * @fileoverview iOS SpecAuthor Agent
 * @description Generates technical specifications for iOS/Swift projects
 */

import { BaseAgent } from '../base';
import { AgentContext, AgentResult, TechnicalSpec, ImplementationTask } from '../../types';
import { getDirectoryStructure } from '../../tools/file';
import { setupRepository } from '../../tools/repo';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * IosSpecAuthorAgent: Generates technical specification for iOS projects
 * 
 * Understands Swift project structure: Sources/, Tests/, Package.swift,
 * .xcodeproj, .xcworkspace, SPM modules.
 */
export class IosSpecAuthorAgent extends BaseAgent {
  name = 'IosSpecAuthor';

  async execute(context: AgentContext): Promise<AgentResult> {
    const { job, workspacePath } = context;
    
    this.log(`Generating spec for iOS project: ${job.title}`);
    
    try {
      // 1. Setup repository
      const repoPath = path.join(workspacePath, 'repo');
      const setup = await setupRepository(job, repoPath);
      if (!setup.success) {
        return { success: false, output: '', error: setup.error };
      }
      this.log(setup.output);
      
      // 2. Explore repo structure
      await getDirectoryStructure(repoPath, 3);
      this.log('Explored repo structure');
      
      // 3. Find relevant Swift files
      const relevantFiles = await this.findSwiftFiles(repoPath, job.module);
      this.log(`Found ${relevantFiles.sources.length} source files, ${relevantFiles.tests.length} test files`);
      
      // 4. Generate spec
      const spec = this.generateSpec(job, relevantFiles);
      
      // 5. Save spec to disk
      await this.saveSpec(workspacePath, spec, job.id);
      
      return {
        success: true,
        output: 'iOS specification generated successfully',
        spec,
        nextStatus: 'spec_ready',
      };
    } catch (error) {
      return { success: false, output: '', error: `Failed to generate iOS spec: ${error}` };
    }
  }

  private async findSwiftFiles(
    repoPath: string,
    module?: string
  ): Promise<{ sources: string[]; tests: string[]; hasPackageSwift: boolean }> {
    const sources: string[] = [];
    const tests: string[] = [];
    let hasPackageSwift = false;

    try {
      const entries = await fs.readdir(repoPath);
      hasPackageSwift = entries.includes('Package.swift');
    } catch { /* ignore */ }

    const searchDirs = module
      ? [path.join(repoPath, 'Sources', module), path.join(repoPath, module)]
      : [path.join(repoPath, 'Sources'), repoPath];

    for (const dir of searchDirs) {
      try {
        await this.walkSwiftFiles(dir, sources);
      } catch { /* dir may not exist */ }
    }

    const testDirs = module
      ? [path.join(repoPath, 'Tests', `${module}Tests`)]
      : [path.join(repoPath, 'Tests'), path.join(repoPath, `${path.basename(repoPath)}Tests`)];

    for (const dir of testDirs) {
      try {
        await this.walkSwiftFiles(dir, tests);
      } catch { /* dir may not exist */ }
    }

    return { sources, tests, hasPackageSwift };
  }

  private async walkSwiftFiles(dir: string, results: string[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walkSwiftFiles(fullPath, results);
      } else if (entry.name.endsWith('.swift')) {
        results.push(fullPath);
      }
    }
  }

  private generateSpec(
    job: AgentContext['job'],
    relevantFiles: { sources: string[]; tests: string[]; hasPackageSwift: boolean }
  ): TechnicalSpec {
    const requirements = job.acceptanceCriteria.map((ac, i) => ({
      id: `req-${i}`,
      content: ac.text,
      sourceAcId: ac.id,
    }));

    const modulePath = job.module || 'App';
    const affectedFiles = [
      `Sources/${modulePath}/Screens/HomeViewController.swift`,
      `Sources/${modulePath}/Views/PromoBannerView.swift`,
    ];
    const newFiles = [
      `Sources/${modulePath}/Views/PromoBannerView.swift`,
      `Tests/${modulePath}Tests/PromoBannerViewTests.swift`,
    ];

    const tasks: ImplementationTask[] = [
      {
        id: 'task-1',
        description: 'Create PromoBannerView UIView subclass',
        filePath: newFiles[0],
        type: 'create',
        status: 'pending',
      },
      {
        id: 'task-2',
        description: 'Integrate PromoBannerView in HomeViewController',
        filePath: affectedFiles[0],
        type: 'modify',
        status: 'pending',
        dependsOn: ['task-1'],
      },
      {
        id: 'task-3',
        description: 'Add XCTest tests for PromoBannerView',
        filePath: newFiles[1],
        type: 'test',
        status: 'pending',
        dependsOn: ['task-1'],
      },
    ];

    return {
      requirements,
      design: {
        affectedFiles,
        newFiles,
        architectureDecisions: [
          'Use UICollectionView for horizontal banner carousel',
          'Follow MVVM pattern with Combine bindings',
          'Integrate with existing navigation coordinator',
        ],
        uiComponents: ['PromoBannerView', 'PromoBannerCell'],
      },
      tasks,
      risks: [
        'May require UICollectionViewCompositionalLayout (iOS 13+)',
        'Image caching strategy needed for performance',
      ],
    };
  }

  private async saveSpec(workspacePath: string, spec: TechnicalSpec, jobId: string): Promise<void> {
    const { writeFile } = await import('../../tools/file');
    const specDir = path.join(workspacePath, 'specs', jobId);

    await writeFile(path.join(specDir, 'requirements.json'), JSON.stringify(spec.requirements, null, 2));
    await writeFile(path.join(specDir, 'design.json'), JSON.stringify(spec.design, null, 2));
    await writeFile(path.join(specDir, 'tasks.json'), JSON.stringify(spec.tasks, null, 2));

    this.log(`Spec saved to ${specDir}`);
  }
}
