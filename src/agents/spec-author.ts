/**
 * @fileoverview SpecAuthor Agent
 * @description Generates technical specifications from product requirements
 */

import { BaseAgent } from './base';
import { AgentContext, AgentResult, TechnicalSpec, ImplementationTask } from '../types';
import { getDirectoryStructure, getRelevantFiles } from '../tools/file';
import * as path from 'path';

/**
 * SpecAuthorAgent: Generates technical specification from requirements
 * 
 * Input: Job with acceptance criteria, figmaUrl, repo info
 * Output: TechnicalSpec with requirements, design, tasks
 */
export class SpecAuthorAgent extends BaseAgent {
  name = 'SpecAuthor';

  async execute(context: AgentContext): Promise<AgentResult> {
    const { job, workspacePath } = context;
    
    this.log(`Generating spec for: ${job.title}`);
    
    try {
      // 1. Explore repo structure
      const repoPath = path.join(workspacePath, 'repo');
      const structure = await getDirectoryStructure(repoPath, 3);
      this.log('Explored repo structure');
      
      // 2. Find relevant files
      const relevantFiles = await getRelevantFiles(repoPath, job.module);
      this.log(`Found ${relevantFiles.lib.length} lib files, ${relevantFiles.test.length} test files`);
      
      // 3. Generate spec
      const spec = this.generateSpec(job, relevantFiles);
      
      // 4. Save spec to disk for external memory
      await this.saveSpec(workspacePath, spec, job.id);
      
      return {
        success: true,
        output: 'Specification generated successfully',
        spec,
        nextStatus: 'spec_ready',
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to generate spec: ${error}`,
      };
    }
  }

  private generateSpec(
    job: AgentContext['job'],
    relevantFiles: { lib: string[]; test: string[]; pubspec: boolean }
  ): TechnicalSpec {
    const requirements = job.acceptanceCriteria.map((ac, i) => ({
      id: `req-${i}`,
      content: ac.text,
      sourceAcId: ac.id,
    }));
    
    const affectedFiles: string[] = [];
    const newFiles: string[] = [];
    
    if (job.module) {
      const basePath = `packages/features/${job.module}`;
      
      affectedFiles.push(
        `${basePath}/lib/src/presentation/screens/home_screen.dart`,
        `${basePath}/lib/src/presentation/widgets/promo_banner.dart`
      );
      
      newFiles.push(
        `${basePath}/lib/src/presentation/widgets/promo_banner.dart`,
        `${basePath}/test/widgets/promo_banner_test.dart`
      );
    }
    
    const tasks: ImplementationTask[] = [
      {
        id: 'task-1',
        description: 'Create PromoBanner widget with carousel support',
        filePath: newFiles[0],
        type: 'create',
        status: 'pending',
      },
      {
        id: 'task-2',
        description: 'Integrate PromoBanner in HomeScreen',
        filePath: affectedFiles[0],
        type: 'modify',
        status: 'pending',
        dependsOn: ['task-1'],
      },
      {
        id: 'task-3',
        description: 'Add tests for PromoBanner',
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
          'Create reusable widget for promotional banners',
          'Use PageView for carousel when >3 promos',
          'Integrate with existing navigation system',
        ],
        uiComponents: ['PromoBanner', 'PromoCarousel'],
      },
      tasks,
      risks: [
        'May affect home screen performance with many images',
        'Requires backend integration for promotions',
      ],
    };
  }

  private async saveSpec(
    workspacePath: string,
    spec: TechnicalSpec,
    jobId: string
  ): Promise<void> {
    const { writeFile } = await import('../tools/file');
    
    const specDir = path.join(workspacePath, 'specs', jobId);
    
    await writeFile(
      path.join(specDir, 'requirements.json'),
      JSON.stringify(spec.requirements, null, 2)
    );
    
    await writeFile(
      path.join(specDir, 'design.json'),
      JSON.stringify(spec.design, null, 2)
    );
    
    await writeFile(
      path.join(specDir, 'tasks.json'),
      JSON.stringify(spec.tasks, null, 2)
    );
    
    this.log(`Spec saved to ${specDir}`);
  }
}
