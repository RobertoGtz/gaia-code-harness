/**
 * @fileoverview iOS SpecAuthor Agent
 * @description Generates technical specifications for iOS/Swift projects
 */

import { BaseAgent } from '../base';
import { AgentContext, AgentResult, TechnicalSpec, ImplementationTask } from '../../types';
import { getDirectoryStructure } from '../../tools/file';
import { setupRepository } from '../../tools/repo';
import { callLLM, extractJSON } from '../../tools/llm';
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
      const structureFiles = await getDirectoryStructure(repoPath, 3);
      const structure = structureFiles.map(f => f.relativePath).join('\n');
      this.log('Explored repo structure');
      
      // 3. Find relevant Swift files
      const relevantFiles = await this.findSwiftFiles(repoPath, job.module);
      this.log(`Found ${relevantFiles.sources.length} source files, ${relevantFiles.tests.length} test files`);
      
      // 4. Generate spec (LLM or fallback to mock)
      const spec = await this.generateSpec(job, relevantFiles, structure);
      
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

  private async generateSpec(
    job: AgentContext['job'],
    relevantFiles: { sources: string[]; tests: string[]; hasPackageSwift: boolean },
    repoStructure: string
  ): Promise<TechnicalSpec> {
    const criteria = job.acceptanceCriteria.map((ac) => `- ${ac.text}`).join('\n');
    const sourceFiles = relevantFiles.sources.slice(0, 20).join('\n');

    const prompt = `You are an iOS tech lead. Given the following feature request and repository context, generate a technical specification in JSON.

Feature: ${job.title}
Description: ${job.description || ''}
Acceptance Criteria:
${criteria}

Repository structure (top 3 levels):
${repoStructure}

Relevant Swift files:
${sourceFiles}
${job.module ? `\nTarget module: ${job.module}` : ''}

Respond with ONLY a JSON object matching this TypeScript type:
{
  requirements: Array<{ id: string; content: string; sourceAcId: string }>,
  design: {
    affectedFiles: string[],
    newFiles: string[],
    architectureDecisions: string[],
    uiComponents: string[]
  },
  tasks: Array<{
    id: string; description: string; filePath: string;
    type: 'create' | 'modify' | 'test'; status: 'pending'; dependsOn?: string[]
  }>,
  risks: string[]
}`;

    try {
      const response = await callLLM([
        { role: 'system', content: 'You are an expert iOS/Swift architect. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ]);
      this.log(`Spec generated via ${response.provider} (${response.model})`);
      return extractJSON<TechnicalSpec>(response.text);
    } catch (err) {
      this.log(`LLM call failed, using fallback spec: ${err}`);
      return this.fallbackSpec(job);
    }
  }

  private fallbackSpec(job: AgentContext['job']): TechnicalSpec {
    const requirements = job.acceptanceCriteria.map((ac, i) => ({
      id: `req-${i}`,
      content: ac.text,
      sourceAcId: ac.id,
    }));
    const modulePath = job.module || 'App';
    const newFiles = [
      `Sources/${modulePath}/Views/PromoBannerView.swift`,
      `Tests/${modulePath}Tests/PromoBannerViewTests.swift`,
    ];
    return {
      requirements,
      design: {
        affectedFiles: [`Sources/${modulePath}/Screens/HomeViewController.swift`],
        newFiles,
        architectureDecisions: ['Use UICollectionView for horizontal banner carousel'],
        uiComponents: ['PromoBannerView'],
      },
      tasks: [
        { id: 'task-1', description: 'Create PromoBannerView', filePath: newFiles[0], type: 'create', status: 'pending' },
        { id: 'task-2', description: 'Add XCTest tests', filePath: newFiles[1], type: 'test', status: 'pending', dependsOn: ['task-1'] },
      ],
      risks: ['May require UICollectionViewCompositionalLayout (iOS 13+)'],
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
