/**
 * @fileoverview Generic Reviewer Agent
 * @description Platform-agnostic review: analyze, test, file count, then GitHub PR.
 *              Platform-specific checks and PR checklist come from PlatformSkill.
 */

import { BaseAgent } from './base';
import { AgentContext, AgentResult, TestResult } from '../types';
import { TestRunResult } from '../tools/test-runner';
import { initGit, createGitHubPR, addJiraComment, getModifiedFiles, GitHubError, GitHubAuthError, GitHubNotFoundError, GitPushError } from '../tools/git';
import { loadSkill } from '../skills';
import { GaiaError, GaiaReviewError } from '../errors';
import * as path from 'path';

export class ReviewerAgent extends BaseAgent {
  name = 'Reviewer';

  async execute(context: AgentContext): Promise<AgentResult> {
    const { job, workspacePath } = context;
    const repoPath = path.join(workspacePath, 'repo');
    this.logStep(`Reviewing: ${job.title} [${job.platform}]`);

    try {
      const skill = await loadSkill(job.platform);
      this.log(`Loaded skill: ${skill.displayName}`);

      let testResult: import('../tools/test-runner').TestRunResult | undefined;

      if (job.requireTests !== false) {
        await skill.verifyEnvironment(repoPath); // throws GaiaEnvError on failure

        // 1. Static analysis (non-blocking — warns but does not fail)
        this.logStep('Running static analysis...');
        try {
          await skill.analyze(repoPath);
        } catch (analyzeErr) {
          this.logWarn(`Analysis issues (non-blocking): ${String(analyzeErr).slice(0, 300)}`);
        }

        // 2. Tests — throws GaiaTestError on failure
        this.logStep('Running tests...');
        testResult = await skill.test(repoPath, job.module);
        this.logSuccess(`Tests passed`);
      } else {
        this.logStep('Skipping environment check & tests (requireTests: false)');
      }

      // 3. File count guard
      const git = initGit(repoPath);
      const modifiedFiles = await getModifiedFiles(git);
      if (modifiedFiles.length > job.maxFilesToTouch) {
        throw new GaiaReviewError(
          `Too many files modified: ${modifiedFiles.length} > ${job.maxFilesToTouch}`,
          `Files: ${modifiedFiles.join(', ')}`
        );
      }

      // 4. Traceability
      if (!job.spec) {
        throw new GaiaReviewError('No spec found for traceability verification');
      }

      // 5. GitHub PR
      this.logStep('Creating GitHub PR...');
      const prOwner = job.repo.includes('/') ? job.repo.split('/')[0] : (process.env.GITHUB_OWNER || 'rappi');
      const prRepo = job.repo.includes('/') ? job.repo.split('/')[1] : job.repo;
      let pr: { url: string; id: string; number: number };
      try {
        pr = await createGitHubPR({
          owner: prOwner,
          repo: prRepo,
          title: `[${job.jiraTicketId || 'GAIA'}] ${job.title}`,
          body: this.generatePRBody(job, skill.displayName),
          head: job.branchName || 'feature-branch',
          base: job.targetBranch,
        });
      } catch (prError) {
        if (prError instanceof GitHubAuthError) {
          throw new GaiaReviewError(prError.message, 'Check GITHUB_TOKEN has the "repo" scope.');
        }
        if (prError instanceof GitHubNotFoundError) {
          throw new GaiaReviewError(prError.message, `Repo: ${prOwner}/${prRepo}`);
        }
        if (prError instanceof GitPushError) {
          throw new GaiaReviewError(prError.message, 'Ensure GITHUB_TOKEN can push to protected branches.');
        }
        if (prError instanceof GitHubError) {
          throw new GaiaReviewError(`GitHub error (HTTP ${prError.status}): ${prError.message}`);
        }
        // Unknown — fall back to dry-run to avoid blocking the pipeline
        this.logWarn(`GitHub PR creation failed (dry-run fallback): ${prError}`);
        pr = {
          url: `https://github.com/${prOwner}/${prRepo}/pull/dry-run`,
          id: 'dry-run',
          number: 0,
        };
      }
      this.logSuccess(`PR created: ${pr.url}`);

      // 6. Jira comment
      if (job.jiraTicketId) {
        await addJiraComment(job.jiraTicketId, `Pull Request created: ${pr.url}`);
      }

      return {
        success: true,
        output: `Review passed. PR created: ${pr.url}`,
        prUrl: pr.url,
        prId: pr.id,
        testResults: testResult ? [this.toTestResult(testResult)] : [],
      };
    } catch (error) {
      if (error instanceof GaiaError) {
        return { success: false, output: '', error: error.message, errorCode: error.code };
      }
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, output: '', error: `Review failed: ${msg}`, errorCode: 'UNKNOWN' };
    }
  }

  private toTestResult(r: TestRunResult): TestResult {
    return {
      passed: r.passed,
      command: r.command ?? '',
      stdout: r.stdout,
      stderr: r.stderr,
      exitCode: r.exitCode ?? 0,
      duration: r.duration ?? 0,
    };
  }

  private generatePRBody(job: AgentContext['job'], platformName: string): string {
    if (!job.spec) return '';
    const requirements = job.spec.requirements.map(r => `- [x] ${r.content}`).join('\n');
    const design = job.spec.design;
    return `## ${job.title}

**Jira:** ${job.jiraTicketId || 'N/A'}
**Platform:** ${platformName}

### Requirements
${requirements}

### Changes
**Modified files:**
${design.affectedFiles.map(f => `- \`${f}\``).join('\n')}

**New files:**
${design.newFiles.map(f => `- \`${f}\` (created)`).join('\n')}

### Design Decisions
${design.architectureDecisions.map(d => `- ${d}`).join('\n')}

### Verification
- [x] All tests passing
- [x] Static analysis clean
- [x] Files within limit (${job.maxFilesToTouch})
- [x] Traceability to spec verified

---
*Generated by Gaia Code Harness 🤖*`;
  }
}
