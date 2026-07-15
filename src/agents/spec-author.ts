/**
 * @fileoverview Generic SpecAuthor Agent
 * @description Platform-agnostic spec generation. Platform-specific context
 *              is injected via PlatformSkill.getPromptContext().
 */

import { BaseAgent } from './base';
import { AgentContext, AgentResult, TechnicalSpec } from '../types';
import { getDirectoryStructure, getRelevantFiles, writeFile } from '../tools/file';
import { setupRepository } from '../tools/repo';
import { callLLM, extractJSON } from '../tools/llm';
import { loadSkill } from '../plugins';
import { createPluginLoader } from '../harness/plugin-loader';
import { GaiaError, GaiaRepoError, GaiaSpecError } from '../errors';
import * as path from 'path';

export class SpecAuthorAgent extends BaseAgent {
  name = 'SpecAuthor';

  async execute(context: AgentContext): Promise<AgentResult> {
    const { job, workspacePath } = context;
    this.logStep(`Generating spec for: ${job.title} [${job.platform}]`);

    try {
      const repoPath = path.join(workspacePath, 'repo');
      const skill = await loadSkill(job.platform, repoPath);
      this.log(`Loaded skill: ${skill.displayName}`);
      const setup = await setupRepository(job, repoPath);
      if (!setup.success) {
        throw new GaiaRepoError(
          `[${job.platform}] Cannot clone repository '${job.repo}' for spec generation. Check GITHUB_TOKEN and repo permissions.`,
          setup.error
        );
      }
      this.logSuccess(setup.output);

      const structureFiles = await getDirectoryStructure(repoPath, 3);
      const structure = structureFiles.map(f => f.relativePath).join('\n');
      this.logStep('Explored repo structure');

      const relevantFiles = await getRelevantFiles(repoPath, job.module, skill.srcDirs, skill.sourceExtension);
      this.log(`Found ${relevantFiles.lib.length} source files, ${relevantFiles.test.length} test files`);

      const pluginLoader = await createPluginLoader(repoPath);
      const repoRules = pluginLoader.getRulesAsContext();
      const promptCtx = skill.getPromptContext(job);
      const spec = await this.generateSpec(job, relevantFiles, structure, promptCtx, repoRules);
      spec.gherkinScenarios = await this.generateGherkinScenarios(job, spec);
      await this.saveSpec(workspacePath, spec, job.id);

      await this.writeHandoff(workspacePath, `# Handoff: SpecAuthor → Implementer

## Job
- **Title**: ${job.title}
- **Platform**: ${job.platform}
- **Repository**: ${job.repo}
- **Target branch**: ${job.targetBranch}
- **Module**: ${job.module || 'N/A'}

## Completed
- Generated TechnicalSpec with ${spec.requirements.length} requirements, ${spec.tasks.length} tasks, ${spec.design.affectedFiles.length} affected files.
- Generated Gherkin scenarios (${spec.gherkinScenarios ? (spec.gherkinScenarios.match(/^\\s*Scenario:/gm) || []).length : 0} scenarios) saved to specs/${job.id}/scenarios.feature.

## Next step
Wait for human approval, then ImplementerAgent should execute the tasks in spec.tasks. If Gherkin scenarios exist, inject them into the implementerSystem prompt so the generated code satisfies the observable acceptance criteria.
`);

      return { success: true, output: 'Specification generated successfully', spec, nextStatus: 'spec_ready' };
    } catch (error) {
      if (error instanceof GaiaError) {
        return { success: false, output: '', error: error.message, errorCode: error.code };
      }
      return { success: false, output: '', error: `Failed to generate spec: ${error}`, errorCode: 'UNKNOWN' };
    }
  }

  private async generateSpec(
    job: AgentContext['job'],
    relevantFiles: { lib: string[]; test: string[]; pubspec: boolean },
    repoStructure: string,
    promptCtx: import('../plugins').PromptContext,
    repoRules?: string
  ): Promise<TechnicalSpec> {
    const criteria = job.acceptanceCriteria.map(ac => `- ${ac.text}`).join('\n');
    const srcFiles = relevantFiles.lib.slice(0, 20).join('\n');

    const userPrompt = `Feature: ${job.title}
Description: ${job.description || ''}
Acceptance Criteria:
${criteria}

Repository structure (top 3 levels):
${repoStructure}

Relevant source files:
${srcFiles}
${job.module ? `\nTarget module: ${job.module}` : ''}

File path conventions for this platform:
${Object.entries(promptCtx.filePatterns).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

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
      const systemContent = repoRules
        ? `# Project-specific rules\n\n${repoRules}\n\n---\n\n${promptCtx.specSystem}`
        : promptCtx.specSystem;
      const response = await callLLM([
        { role: 'system', content: systemContent },
        { role: 'user', content: userPrompt },
      ]);
      this.logSuccess(`Spec generated via ${response.provider} (${response.model})`);
      return extractJSON<TechnicalSpec>(response.text);
    } catch (err) {
      this.logError(`LLM call failed: ${err}`);
      throw new GaiaSpecError(
        `[${job.platform}] LLM failed to generate spec for '${job.title}'`,
        String(err)
      );
    }
  }

  private async generateGherkinScenarios(
    job: AgentContext['job'],
    spec: TechnicalSpec
  ): Promise<string> {
    const criteria = job.acceptanceCriteria.map(ac => `- ${ac.text}`).join('\n');
    const tasks = spec.tasks.map(t => `- [${t.type}] ${t.description}`).join('\n');

    const systemPrompt = `You are a Gherkin author. Your only job is to convert acceptance criteria and implementation tasks into a .feature file.

Rules:
- One Scenario per observable behaviour, including edge cases and errors
- Tag every scenario with @s1, @s2, ... (stable identifiers)
- Every Then must assert something measurable (UI state, stdout, exit code, PR created)
- One When per scenario
- No implementation details (no class or function names)
- Use Given / When / Then / And steps
- Return ONLY the raw .feature file content — no markdown fences, no explanation`;

    const userPrompt = `Feature: ${job.title}
Platform: ${job.platform}

Acceptance Criteria:
${criteria}

Implementation tasks:
${tasks}

Write the complete .feature file.`;

    try {
      const response = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);
      this.logSuccess(`Gherkin scenarios generated (${response.provider})`);
      return response.text.trim();
    } catch (err) {
      this.log(`[warn] Gherkin generation failed (non-blocking): ${err}`);
      return '';
    }
  }

  private async saveSpec(workspacePath: string, spec: TechnicalSpec, jobId: string): Promise<void> {
    const specDir = path.join(workspacePath, 'specs', jobId);
    await writeFile(path.join(specDir, 'requirements.json'), JSON.stringify(spec.requirements, null, 2));
    await writeFile(path.join(specDir, 'design.json'), JSON.stringify(spec.design, null, 2));
    await writeFile(path.join(specDir, 'tasks.json'), JSON.stringify(spec.tasks, null, 2));
    if (spec.gherkinScenarios) {
      await writeFile(path.join(specDir, 'scenarios.feature'), spec.gherkinScenarios);
      this.logSuccess(`Gherkin saved to ${specDir}/scenarios.feature`);
    }
    this.logSuccess(`Spec saved to ${specDir}`);
  }
}
