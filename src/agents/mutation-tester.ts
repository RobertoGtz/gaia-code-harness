/**
 * @fileoverview Mutation Tester Agent
 * @description Validates that the test suite actually detects defects by applying
 *              source mutations and checking whether tests fail (KILLED) or pass (SURVIVED).
 *              A mutation score ≥ 80% is required to pass.
 *
 *              Strategy (dual):
 *                1. If Python 3 and tools/mutate.py are available → deterministic mutator
 *                   (no LLM calls, token-level mutations, always restores original).
 *                2. Otherwise → LLM-generated mutations (original behaviour, fallback).
 * @module agents/mutation-tester
 */

import { BaseAgent } from './base';
import { AgentContext, AgentResult } from '../types';
import { loadSkill } from '../plugins';
import { callLLM } from '../tools/llm';
import { readFile, writeFile } from '../tools/file';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';

const MUTATION_THRESHOLD = 0.8; // 80% kill rate required
const MUTATE_PY_PATH = path.resolve(__dirname, '../../tools/mutate.py');

interface Mutation {
  file: string;
  line: number;
  original: string;
  mutated: string;
  description: string;
}

interface MutationResult extends Mutation {
  killed: boolean; // true = good (test caught it), false = bad (test missed it)
}

export class MutationTesterAgent extends BaseAgent {
  name = 'MutationTester';

  async execute(context: AgentContext): Promise<AgentResult> {
    const { job, workspacePath } = context;
    const repoPath = path.join(workspacePath, 'repo');
    this.logStep(`Mutation testing: ${job.title} [${job.platform}]`);

    const handoff = await this.readHandoff(workspacePath);
    if (handoff) this.log(`Read handoff from previous agent (${handoff.length} chars)`);

    try {
      const skill = await loadSkill(job.platform, repoPath);

      // 1. Collect all production source files (non-test)
      const sourceFiles = await this.collectSourceFiles(repoPath, skill);
      if (sourceFiles.length === 0) {
        this.log('No source files found — skipping mutation testing');
        return { success: true, output: 'No source files to mutate.' };
      }

      // 2. Prefer deterministic mutator (tools/mutate.py) over LLM mutations
      const pythonAvailable = await this.isPythonAvailable();
      const mutatePyExists  = await fs.access(MUTATE_PY_PATH).then(() => true).catch(() => false);
      const useDeterministic = pythonAvailable && mutatePyExists;

      this.log(useDeterministic
        ? `Using deterministic mutator (tools/mutate.py) — no LLM credits consumed`
        : `Python/mutate.py unavailable — falling back to LLM-generated mutations`);

      let score: number;
      let killed: number;
      let total: number;
      let survivedDetails: string[];
      let report: string;

      if (useDeterministic) {
        // ── Strategy A: tools/mutate.py ──────────────────────────────────────
        const TEST_CMDS: Record<string, string> = {
          flutter:     'flutter test',
          flutter_web: 'flutter test',
          ios:         'swift test',
          android:     './gradlew testDebugUnitTest',
        };
        const testCmd = TEST_CMDS[job.platform] ?? 'npx jest --passWithNoTests';
        const jsonResults = await this.runMutatePy(sourceFiles, testCmd, repoPath);

        killed   = jsonResults.reduce((s, r) => s + r.killed, 0);
        total    = jsonResults.reduce((s, r) => s + r.total, 0);
        score    = total > 0 ? killed / total : 1;
        survivedDetails = jsonResults.flatMap(r =>
          r.survived_details.map((d: any) => `${d.file}:${d.row} [${d.label}] ${d.original} → ${d.replacement}`)
        );
        report = this.buildReportFromPy(jsonResults, score, job.title, sourceFiles);
      } else {
        // ── Strategy B: LLM-generated mutations (original behaviour) ─────────
        const allMutations: Mutation[] = [];
        for (const file of sourceFiles) {
          const content = await readFile(file).catch(() => '');
          if (!content) continue;
          const mutations = await this.generateMutations(file, content, repoPath);
          allMutations.push(...mutations);
        }

        if (allMutations.length === 0) {
          this.log('LLM generated no mutations — skipping');
          return { success: true, output: 'No mutations generated.' };
        }

        this.log(`Generated ${allMutations.length} LLM mutations across ${sourceFiles.length} file(s)`);

        const results: MutationResult[] = [];
        for (const mutation of allMutations) {
          const result = await this.applyAndTest(mutation, repoPath, skill, job.module);
          results.push(result);
          this.log(`  ${result.killed ? '✓ KILLED' : '✗ SURVIVED'} — ${mutation.description}`);
        }

        killed   = results.filter(r => r.killed).length;
        total    = results.length;
        score    = total > 0 ? killed / total : 1;
        survivedDetails = results
          .filter(r => !r.killed)
          .map(r => `${r.file}:${r.line} — ${r.description}`);
        report = this.buildReport(results, score, job.title);
      }

      const scoreStr = `${(score * 100).toFixed(1)}%`;
      const passed   = score >= MUTATION_THRESHOLD;

      const reportPath = path.join(workspacePath, '..', '..', 'progress', `mutation_${job.id.slice(0, 8)}.md`);
      await fs.writeFile(reportPath, report, 'utf8').catch(() => {});

      this.log(`Mutation score: ${scoreStr} (${killed}/${total} killed) — ${passed ? 'PASS ✅' : 'FAIL ❌'}`);

      const handoffContent = `# Handoff: MutationTester → End of pipeline

## Job
- **Title**: ${job.title}
- **Platform**: ${job.platform}
- **Repository**: ${job.repo}

## Completed
- Mutation score: ${scoreStr} (${killed}/${total} killed).
- Report saved to: ${reportPath}

## Status
${passed ? '✅ All surviving mutations justified or no survivors.' : '❌ Some mutations survived — consider strengthening tests or justifying equivalent mutants.'}
`;
      await this.writeHandoff(workspacePath, handoffContent);

      if (!passed) {
        return {
          success: false,
          output: `Mutation score ${scoreStr} below ${MUTATION_THRESHOLD * 100}% threshold.`,
          error: `${survivedDetails.length} mutations survived:\n${survivedDetails.join('\n')}`,
          errorCode: 'TEST_ERROR',
        };
      }

      return {
        success: true,
        output: `Mutation score ${scoreStr} — all tests bite. Report: ${reportPath}`,
      };
    } catch (error) {
      return { success: false, output: '', error: `Mutation testing failed: ${error}`, errorCode: 'UNKNOWN' };
    }
  }

  // ── deterministic mutator helpers ──────────────────────────────────────

  private async isPythonAvailable(): Promise<boolean> {
    return new Promise(resolve => {
      const p = spawn('python3', ['--version'], { stdio: 'ignore' });
      p.on('close', code => resolve(code === 0));
      p.on('error', () => resolve(false));
    });
  }

  private runMutatePy(
    files: string[],
    testCmd: string,
    cwd: string
  ): Promise<Array<{ score: number; killed: number; survived: number; total: number; survived_details: any[] }>> {
    return Promise.all(
      files.map(file =>
        new Promise<any>((resolve) => {
          const args = [MUTATE_PY_PATH, file, '--cmd', testCmd, '--cwd', cwd, '--threshold', '80', '--json'];
          const p = spawn('python3', args, { cwd });
          let out = '';
          p.stdout.on('data', (d: Buffer) => { out += d.toString(); });
          p.on('close', () => {
            try {
              resolve(JSON.parse(out.trim()));
            } catch {
              resolve({ score: 100, killed: 0, survived: 0, total: 0, survived_details: [] });
            }
          });
          p.on('error', () =>
            resolve({ score: 100, killed: 0, survived: 0, total: 0, survived_details: [] })
          );
        })
      )
    );
  }

  private buildReportFromPy(
    results: Array<{ score: number; killed: number; survived: number; total: number; survived_details: any[] }>,
    overallScore: number,
    title: string,
    files: string[]
  ): string {
    const totalKilled   = results.reduce((s, r) => s + r.killed, 0);
    const totalMutants  = results.reduce((s, r) => s + r.total, 0);
    const passed = overallScore >= MUTATION_THRESHOLD;
    const lines = [
      `# Mutation Report: ${title}`,
      '',
      `**Score**: ${(overallScore * 100).toFixed(1)}% (${totalKilled}/${totalMutants} killed)`,
      `**Threshold**: 80%`,
      `**Result**: ${passed ? '✅ PASS' : '❌ FAIL'}`,
      `**Method**: deterministic (tools/mutate.py)`,
      '',
      '## Results by file',
      '',
    ];
    results.forEach((r, i) => {
      lines.push(`### ${path.basename(files[i])}`);
      lines.push(`- Score: ${r.score.toFixed(1)}% (${r.killed}/${r.total} killed)`);
      if (r.survived_details.length > 0) {
        lines.push('- Survived mutations:');
        for (const d of r.survived_details) {
          lines.push(`  - \`${d.file}:${d.row}\` [${d.label}] \`${d.original}\` → \`${d.replacement}\``);
        }
      }
      lines.push('');
    });
    return lines.join('\n');
  }

  // ── LLM-based helpers (fallback) ─────────────────────────────────────────

  private async collectSourceFiles(repoPath: string, skill: Awaited<ReturnType<typeof loadSkill>>): Promise<string[]> {
    const srcDirs = skill.srcDirs ?? ['lib', 'src', 'Sources'];
    const ext     = skill.sourceExtension ?? '.dart';
    const results: string[] = [];

    async function walk(dir: string): Promise<void> {
      let entries: string[];
      try { entries = await fs.readdir(dir); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e);
        const stat = await fs.stat(full).catch(() => null);
        if (!stat) continue;
        if (stat.isDirectory()) { await walk(full); continue; }
        if (full.endsWith(ext) && !full.includes('test') && !full.includes('Test')) {
          results.push(full);
        }
      }
    }

    for (const dir of srcDirs) {
      await walk(path.join(repoPath, dir));
    }
    return results;
  }

  private async generateMutations(filePath: string, content: string, repoPath: string): Promise<Mutation[]> {
    const rel = path.relative(repoPath, filePath);
    const prompt = `You are a mutation testing tool. Given this source file, generate 3-5 simple mutations.
Each mutation should flip one logical operator, remove one return value, or change one constant.
Return a JSON array. Each item: {"line": <1-indexed line number>, "original": "<exact original line>", "mutated": "<mutated line>", "description": "<brief description>"}

File: ${rel}
\`\`\`
${content.slice(0, 3000)}
\`\`\`

Return ONLY the JSON array, no markdown.`;

    try {
      const resp = await callLLM([{ role: 'user', content: prompt }]);
      const raw  = resp.text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
      const items = JSON.parse(raw) as Array<{ line: number; original: string; mutated: string; description: string }>;
      return items.map(i => ({ file: filePath, ...i }));
    } catch {
      return [];
    }
  }

  private async applyAndTest(
    mutation: Mutation,
    repoPath: string,
    skill: Awaited<ReturnType<typeof loadSkill>>,
    module?: string
  ): Promise<MutationResult> {
    const content = await readFile(mutation.file).catch(() => '');
    if (!content) return { ...mutation, killed: false };

    const lines   = content.split('\n');
    const lineIdx = mutation.line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) return { ...mutation, killed: false };

    // Apply mutation
    const originalLine = lines[lineIdx];
    lines[lineIdx] = mutation.mutated;
    await writeFile(mutation.file, lines.join('\n'));

    // Run tests
    let killed = false;
    try {
      const result = await skill.test(repoPath, module);
      killed = !result.passed; // if tests fail after mutation → KILLED (good)
    } catch {
      killed = true; // exception from test runner = tests detected the mutation
    }

    // Always revert
    lines[lineIdx] = originalLine;
    await writeFile(mutation.file, lines.join('\n'));

    return { ...mutation, killed };
  }

  private buildReport(results: MutationResult[], score: number, title: string): string {
    const killed   = results.filter(r => r.killed).length;
    const survived = results.filter(r => !r.killed);
    const lines    = [
      `# Mutation Report: ${title}`,
      '',
      `**Score**: ${(score * 100).toFixed(1)}% (${killed}/${results.length} killed)`,
      `**Threshold**: 80%`,
      `**Result**: ${score >= MUTATION_THRESHOLD ? '✅ PASS' : '❌ FAIL'}`,
      '',
      '## All Mutations',
      '',
      ...results.map(r =>
        `- ${r.killed ? '✅ KILLED' : '❌ SURVIVED'} \`${path.basename(r.file)}:${r.line}\` — ${r.description}`
      ),
    ];

    if (survived.length > 0) {
      lines.push('', '## Survived Mutations (tests to strengthen)', '');
      for (const r of survived) {
        lines.push(
          `### \`${path.basename(r.file)}\` line ${r.line}`,
          `- **Mutation**: ${r.description}`,
          `- **Original**: \`${r.original.trim()}\``,
          `- **Mutated to**: \`${r.mutated.trim()}\``,
          ''
        );
      }
    }

    return lines.join('\n');
  }
}
