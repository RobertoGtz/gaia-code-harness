/**
 * @fileoverview Flutter Web SpecAuthor Agent
 * @description Generates technical specifications for Flutter Web projects.
 *              Extends the base Flutter spec generation with web-specific constraints:
 *              responsive layouts, URL-based routing, web-safe packages, and SEO considerations.
 */

import { BaseAgent } from '../base';
import { AgentContext, AgentResult, TechnicalSpec } from '../../types';
import { getDirectoryStructure, getRelevantFiles } from '../../tools/file';
import { setupRepository } from '../../tools/repo';
import { callLLM, extractJSON } from '../../tools/llm';
import * as path from 'path';

/**
 * FlutterWebSpecAuthorAgent: Generates technical spec for Flutter Web projects.
 *
 * Key differences from mobile Flutter:
 * - File patterns target lib/src/web/pages/ and lib/src/web/components/
 * - Routing assumes URL-based navigation via go_router
 * - No mobile-only plugins (camera, geolocator, local_auth, etc.)
 * - Responsive breakpoints required for every screen
 * - SEO metadata considerations included in design decisions
 */
export class FlutterWebSpecAuthorAgent extends BaseAgent {
  name = 'FlutterWebSpecAuthor';

  async execute(context: AgentContext): Promise<AgentResult> {
    const { job, workspacePath } = context;

    this.logStep(`Generating Flutter Web spec for: ${job.title}`);

    try {
      const repoPath = path.join(workspacePath, 'repo');
      const setup = await setupRepository(job, repoPath);
      if (!setup.success) {
        return { success: false, output: '', error: setup.error };
      }
      this.logSuccess(setup.output);

      const structureFiles = await getDirectoryStructure(repoPath, 3);
      const structure = structureFiles.map(f => f.relativePath).join('\n');
      this.logStep('Explored repo structure');

      const relevantFiles = await getRelevantFiles(repoPath, job.module);
      this.log(`Found ${relevantFiles.lib.length} lib files, ${relevantFiles.test.length} test files`);

      const spec = await this.generateSpec(job, relevantFiles, structure);
      await this.saveSpec(workspacePath, spec, job.id);

      return {
        success: true,
        output: 'Flutter Web specification generated successfully',
        spec,
        nextStatus: 'spec_ready',
      };
    } catch (error) {
      return { success: false, output: '', error: `Failed to generate spec: ${error}` };
    }
  }

  private async generateSpec(
    job: AgentContext['job'],
    relevantFiles: { lib: string[]; test: string[]; pubspec: boolean },
    repoStructure: string
  ): Promise<TechnicalSpec> {
    const criteria = job.acceptanceCriteria.map(ac => `- ${ac.text}`).join('\n');
    const libFiles = relevantFiles.lib.slice(0, 20).join('\n');

    const prompt = `You are a Flutter Web tech lead. Given the following feature request and repository context, generate a technical specification in JSON.

Feature: ${job.title}
Description: ${job.description || ''}
Acceptance Criteria:
${criteria}

Repository structure (top 3 levels):
${repoStructure}

Relevant Dart files:
${libFiles}
${job.module ? `\nTarget module: ${job.module}` : ''}

FLUTTER WEB CONSTRAINTS — apply these strictly:
- File structure: pages go in lib/src/web/pages/, reusable components in lib/src/web/components/
- Routing: use go_router with named URL paths (e.g. /home, /products/:id) — no Navigator.push
- Layouts: every screen must support mobile (< 600px), tablet (600–1024px), desktop (> 1024px) breakpoints using LayoutBuilder or ResponsiveWrapper
- Forbidden packages: camera, geolocator, local_auth, flutter_blue, image_picker (mobile-only plugins not supported on web)
- Preferred packages: go_router, flutter_animate, cached_network_image, http or dio, flutter_svg
- SEO: include metadata (page title, description) via js interop or meta_seo package when creating new pages
- Tests: use flutter_test for widget tests; integration tests must use flutter_driver or integration_test package

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
        {
          role: 'system',
          content: 'You are an expert Flutter Web architect. Always respond with valid JSON only. Never suggest mobile-only packages.',
        },
        { role: 'user', content: prompt },
      ]);
      this.logSuccess(`Spec generated via ${response.provider} (${response.model})`);
      return extractJSON<TechnicalSpec>(response.text);
    } catch (err) {
      this.logError(`LLM call failed: ${err}`);
      throw new Error(`LLM unavailable: ${err}`);
    }
  }

  private async saveSpec(workspacePath: string, spec: TechnicalSpec, jobId: string): Promise<void> {
    const { writeFile } = await import('../../tools/file');
    const specDir = path.join(workspacePath, 'specs', jobId);

    await writeFile(path.join(specDir, 'requirements.json'), JSON.stringify(spec.requirements, null, 2));
    await writeFile(path.join(specDir, 'design.json'), JSON.stringify(spec.design, null, 2));
    await writeFile(path.join(specDir, 'tasks.json'), JSON.stringify(spec.tasks, null, 2));

    this.logSuccess(`Spec saved to ${specDir}`);
  }
}
