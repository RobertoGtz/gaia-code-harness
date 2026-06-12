/**
 * @fileoverview Flutter SpecAuthor Agent
 * @description Generates technical specifications for Flutter projects
 */

import { BaseAgent } from '../base';
import { AgentContext, AgentResult, TechnicalSpec, ImplementationTask } from '../../types';
import { getDirectoryStructure, getRelevantFiles } from '../../tools/file';
import { setupRepository } from '../../tools/repo';
import { callLLM, extractJSON } from '../../tools/llm';
import * as path from 'path';

/**
 * FlutterSpecAuthorAgent: Generates technical specification for Flutter projects
 * 
 * Input: Job with acceptance criteria, figmaUrl, repo info
 * Output: TechnicalSpec with requirements, design, tasks
 */
export class FlutterSpecAuthorAgent extends BaseAgent {
  name = 'FlutterSpecAuthor';

  async execute(context: AgentContext): Promise<AgentResult> {
    const { job, workspacePath } = context;
    
    this.log(`Generating spec for: ${job.title}`);
    
    try {
      // 1. Setup repository (clone or copy from local)
      const repoPath = path.join(workspacePath, 'repo');
      const setup = await setupRepository(job, repoPath);
      if (!setup.success) {
        return {
          success: false,
          output: '',
          error: setup.error,
        };
      }
      this.log(setup.output);
      
      // 2. Explore repo structure
      const structureFiles = await getDirectoryStructure(repoPath, 3);
      const structure = structureFiles.map(f => f.relativePath).join('\n');
      this.log('Explored repo structure');
      
      // 3. Find relevant files (Flutter-specific: lib/, test/, pubspec.yaml)
      const relevantFiles = await getRelevantFiles(repoPath, job.module);
      this.log(`Found ${relevantFiles.lib.length} lib files, ${relevantFiles.test.length} test files`);
      
      // 4. Generate spec (LLM or fallback to mock)
      const spec = await this.generateSpec(job, relevantFiles, structure);
      
      // 5. Save spec to disk for external memory
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

  private async generateSpec(
    job: AgentContext['job'],
    relevantFiles: { lib: string[]; test: string[]; pubspec: boolean },
    repoStructure: string
  ): Promise<TechnicalSpec> {
    const criteria = job.acceptanceCriteria.map((ac) => `- ${ac.text}`).join('\n');
    const libFiles = relevantFiles.lib.slice(0, 20).join('\n');

    const prompt = `You are a Flutter tech lead. Given the following feature request and repository context, generate a technical specification in JSON.

Feature: ${job.title}
Description: ${job.description || ''}
Acceptance Criteria:
${criteria}

Repository structure (top 3 levels):
${repoStructure}

Relevant Dart files:
${libFiles}
${job.module ? `\nTarget module: ${job.module}` : ''}

Respond with ONLY a JSON object (no markdown prose) matching this TypeScript type:
{
  requirements: Array<{ id: string; content: string; sourceAcId: string }>,
  design: {
    affectedFiles: string[],
    newFiles: string[],
    architectureDecisions: string[],
    uiComponents: string[]
  },
  tasks: Array<{
    id: string;
    description: string;
    filePath: string;
    type: 'create' | 'modify' | 'test';
    status: 'pending';
    dependsOn?: string[]
  }>,
  risks: string[]
}`;

    try {
      const response = await callLLM([
        { role: 'system', content: 'You are an expert Flutter architect. Always respond with valid JSON only.' },
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
    const basePath = job.module ? `packages/features/${job.module}` : 'lib';
    const newFiles = [
      `${basePath}/lib/src/presentation/widgets/promo_banner.dart`,
      `${basePath}/test/widgets/promo_banner_test.dart`,
    ];
    return {
      requirements,
      design: {
        affectedFiles: [`${basePath}/lib/src/presentation/screens/home_screen.dart`],
        newFiles,
        architectureDecisions: ['Create reusable widget for promotional banners'],
        uiComponents: ['PromoBanner'],
      },
      tasks: [
        { id: 'task-1', description: 'Create PromoBanner widget', filePath: newFiles[0], type: 'create', status: 'pending' },
        { id: 'task-2', description: 'Add widget tests', filePath: newFiles[1], type: 'test', status: 'pending', dependsOn: ['task-1'] },
      ],
      risks: ['Requires backend integration for promotions'],
    };
  }

  private async saveSpec(
    workspacePath: string,
    spec: TechnicalSpec,
    jobId: string
  ): Promise<void> {
    const { writeFile } = await import('../../tools/file');
    
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
