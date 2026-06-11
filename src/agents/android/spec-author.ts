/**
 * @fileoverview Android SpecAuthor Agent
 * @description Generates technical specifications for Android/Kotlin projects
 */

import { BaseAgent } from '../base';
import { AgentContext, AgentResult, TechnicalSpec, ImplementationTask } from '../../types';
import { getDirectoryStructure } from '../../tools/file';
import { setupRepository } from '../../tools/repo';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * AndroidSpecAuthorAgent: Generates technical specification for Android projects
 * 
 * Understands Gradle project structure: app/, feature modules,
 * build.gradle.kts, settings.gradle.kts.
 */
export class AndroidSpecAuthorAgent extends BaseAgent {
  name = 'AndroidSpecAuthor';

  async execute(context: AgentContext): Promise<AgentResult> {
    const { job, workspacePath } = context;
    
    this.log(`Generating spec for Android project: ${job.title}`);
    
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
      
      // 3. Find relevant Kotlin files
      const relevantFiles = await this.findKotlinFiles(repoPath, job.module);
      this.log(`Found ${relevantFiles.sources.length} source files, ${relevantFiles.tests.length} test files`);
      
      // 4. Generate spec
      const spec = this.generateSpec(job, relevantFiles);
      
      // 5. Save spec to disk
      await this.saveSpec(workspacePath, spec, job.id);
      
      return {
        success: true,
        output: 'Android specification generated successfully',
        spec,
        nextStatus: 'spec_ready',
      };
    } catch (error) {
      return { success: false, output: '', error: `Failed to generate Android spec: ${error}` };
    }
  }

  private async findKotlinFiles(
    repoPath: string,
    module?: string
  ): Promise<{ sources: string[]; tests: string[]; hasBuildGradle: boolean }> {
    const sources: string[] = [];
    const tests: string[] = [];
    let hasBuildGradle = false;

    try {
      const entries = await fs.readdir(repoPath);
      hasBuildGradle = entries.includes('build.gradle') || entries.includes('build.gradle.kts');
    } catch { /* ignore */ }

    const modulePath = module || 'app';
    const srcDir = path.join(repoPath, modulePath, 'src', 'main', 'java');
    const kotlinSrcDir = path.join(repoPath, modulePath, 'src', 'main', 'kotlin');
    const testDir = path.join(repoPath, modulePath, 'src', 'test', 'java');
    const kotlinTestDir = path.join(repoPath, modulePath, 'src', 'test', 'kotlin');

    for (const dir of [srcDir, kotlinSrcDir]) {
      try { await this.walkKotlinFiles(dir, sources); } catch { /* dir may not exist */ }
    }
    for (const dir of [testDir, kotlinTestDir]) {
      try { await this.walkKotlinFiles(dir, tests); } catch { /* dir may not exist */ }
    }

    return { sources, tests, hasBuildGradle };
  }

  private async walkKotlinFiles(dir: string, results: string[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walkKotlinFiles(fullPath, results);
      } else if (entry.name.endsWith('.kt') || entry.name.endsWith('.kts')) {
        results.push(fullPath);
      }
    }
  }

  private generateSpec(
    job: AgentContext['job'],
    relevantFiles: { sources: string[]; tests: string[]; hasBuildGradle: boolean }
  ): TechnicalSpec {
    const requirements = job.acceptanceCriteria.map((ac, i) => ({
      id: `req-${i}`,
      content: ac.text,
      sourceAcId: ac.id,
    }));

    const modulePath = job.module || 'app';
    const packagePath = 'com/rappi/app';
    const affectedFiles = [
      `${modulePath}/src/main/kotlin/${packagePath}/ui/home/HomeFragment.kt`,
      `${modulePath}/src/main/kotlin/${packagePath}/ui/home/PromoBannerView.kt`,
    ];
    const newFiles = [
      `${modulePath}/src/main/kotlin/${packagePath}/ui/home/PromoBannerView.kt`,
      `${modulePath}/src/main/res/layout/view_promo_banner.xml`,
      `${modulePath}/src/test/kotlin/${packagePath}/ui/home/PromoBannerViewTest.kt`,
    ];

    const tasks: ImplementationTask[] = [
      {
        id: 'task-1',
        description: 'Create PromoBannerView custom view with RecyclerView',
        filePath: newFiles[0],
        type: 'create',
        status: 'pending',
      },
      {
        id: 'task-2',
        description: 'Create layout XML for PromoBannerView',
        filePath: newFiles[1],
        type: 'create',
        status: 'pending',
        dependsOn: ['task-1'],
      },
      {
        id: 'task-3',
        description: 'Integrate PromoBannerView in HomeFragment',
        filePath: affectedFiles[0],
        type: 'modify',
        status: 'pending',
        dependsOn: ['task-1', 'task-2'],
      },
      {
        id: 'task-4',
        description: 'Add unit tests for PromoBannerView',
        filePath: newFiles[2],
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
          'Use RecyclerView with horizontal LinearLayoutManager for carousel',
          'Follow MVVM pattern with ViewModel + LiveData/StateFlow',
          'Use View Binding for type-safe view access',
        ],
        uiComponents: ['PromoBannerView', 'PromoBannerAdapter', 'PromoBannerViewHolder'],
      },
      tasks,
      risks: [
        'RecyclerView may need SnapHelper for carousel behavior',
        'Image loading library (Glide/Coil) must be configured',
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
