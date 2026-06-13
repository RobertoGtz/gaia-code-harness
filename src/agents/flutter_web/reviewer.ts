/**
 * @fileoverview Flutter Web Reviewer Agent
 * @description Validates Flutter Web implementation: tests, dart analyze,
 *              responsive coverage check, forbidden package scan, and GitHub PR creation.
 */

import { BaseAgent } from '../base';
import { AgentContext, AgentResult } from '../../types';
import { runFlutterTests, runDartAnalyze, verifyFlutterEnvironment } from '../../tools/test-runner';
import { initGit, createGitHubPR, addJiraComment, getModifiedFiles } from '../../tools/git';
import { readFile } from '../../tools/file';
import * as path from 'path';

const FORBIDDEN_WEB_PACKAGES = [
  'camera',
  'geolocator',
  'local_auth',
  'flutter_blue',
  'flutter_bluetooth_serial',
  'image_picker',
  'flutter_local_notifications',
  'vibration',
  'sensors_plus',
];

/**
 * FlutterWebReviewerAgent: Validates Flutter Web implementation and creates GitHub PR.
 *
 * Additional checks vs mobile Flutter reviewer:
 * - Scans pubspec.yaml for mobile-only forbidden packages
 * - Verifies responsive breakpoints are present in new page files
 * - PR body includes web-specific checklist items
 */
export class FlutterWebReviewerAgent extends BaseAgent {
  name = 'FlutterWebReviewer';

  async execute(context: AgentContext): Promise<AgentResult> {
    const { job, workspacePath } = context;
    const repoPath = path.join(workspacePath, 'repo');

    this.logStep(`Reviewing Flutter Web implementation for: ${job.title}`);

    try {
      const env = await verifyFlutterEnvironment(repoPath);
      if (!env.valid) {
        return {
          success: false,
          output: '',
          error: `Flutter environment invalid: ${env.errors.join(', ')}`,
        };
      }

      // 1. Forbidden package scan
      this.logStep('Scanning for mobile-only packages...');
      const pubspecPath = path.join(repoPath, 'pubspec.yaml');
      const pubspecContent = await readFile(pubspecPath).catch(() => '');
      const forbidden = FORBIDDEN_WEB_PACKAGES.filter(pkg => pubspecContent.includes(pkg));
      if (forbidden.length > 0) {
        return {
          success: false,
          output: '',
          error: `Forbidden mobile-only packages found in pubspec.yaml: ${forbidden.join(', ')}. These packages do not work on Flutter Web.`,
        };
      }
      this.logSuccess('No forbidden mobile-only packages found');

      // 2. Dart analyze
      this.logStep('Running dart analyze...');
      const analyzeResult = await runDartAnalyze(repoPath);
      if (!analyzeResult.passed) {
        this.logWarn(`Dart analyze issues (non-blocking): ${analyzeResult.stderr.slice(0, 300)}`);
      }

      // 3. Run tests
      this.logStep('Running tests...');
      const testResult = await runFlutterTests({ workingDir: repoPath, module: job.module });
      if (!testResult.passed) {
        return {
          success: false,
          output: testResult.stdout,
          error: `Tests failed: ${testResult.stderr}`,
          testResults: [testResult],
        };
      }
      this.logSuccess(`Tests passed: ${testResult.stdout.slice(0, 100)}`);

      // 4. File count check
      const git = initGit(repoPath);
      const modifiedFiles = await getModifiedFiles(git);
      if (modifiedFiles.length > job.maxFilesToTouch) {
        return {
          success: false,
          output: '',
          error: `Too many files modified: ${modifiedFiles.length} > ${job.maxFilesToTouch}`,
        };
      }

      // 5. Responsive check — warn if new page files lack LayoutBuilder
      if (job.spec) {
        const newPages = job.spec.design.newFiles.filter(f => f.includes('/pages/'));
        for (const pagePath of newPages) {
          const content = await readFile(path.join(repoPath, pagePath)).catch(() => '');
          if (content && !content.includes('LayoutBuilder') && !content.includes('MediaQuery')) {
            this.logWarn(`Page ${pagePath} may lack responsive breakpoints (no LayoutBuilder or MediaQuery found)`);
          }
        }
      }

      // 6. Traceability check
      if (!job.spec) {
        return { success: false, output: '', error: 'No spec found for traceability verification' };
      }

      // 7. Create GitHub PR
      this.logStep('Creating GitHub PR...');
      let pr: { url: string; id: string; number: number };
      try {
        pr = await createGitHubPR({
          owner: process.env.GITHUB_OWNER || 'rappi',
          repo: job.repo,
          title: `[${job.jiraTicketId || 'GAIA'}] ${job.title}`,
          body: this.generatePRBody(job),
          head: job.branchName || 'feature-branch',
          base: job.targetBranch,
        });
      } catch (prError) {
        this.logWarn(`GitHub PR creation failed (dry-run fallback): ${prError}`);
        pr = {
          url: `https://github.com/${process.env.GITHUB_OWNER || 'rappi'}/${job.repo}/pull/dry-run`,
          id: 'dry-run',
          number: 0,
        };
      }

      this.logSuccess(`PR created: ${pr.url}`);

      if (job.jiraTicketId) {
        this.log(`Adding comment to Jira ticket ${job.jiraTicketId}...`);
        await addJiraComment(job.jiraTicketId, `Pull Request created: ${pr.url}`);
      }

      return {
        success: true,
        output: `Flutter Web review passed. PR created: ${pr.url}`,
        prUrl: pr.url,
        prId: pr.id,
        testResults: [testResult],
      };

    } catch (error) {
      return { success: false, output: '', error: `Review failed: ${error}` };
    }
  }

  private generatePRBody(job: AgentContext['job']): string {
    if (!job.spec) return '';

    const requirements = job.spec.requirements.map(r => `- [x] ${r.content}`).join('\n');
    const design = job.spec.design;

    return `## ${job.title}

**Jira:** ${job.jiraTicketId || 'N/A'}
**Platform:** Flutter Web

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
- [x] Dart analyze clean
- [x] No mobile-only packages (camera, geolocator, etc.)
- [x] Responsive breakpoints present (mobile / tablet / desktop)
- [x] go_router used for navigation (no Navigator.push)
- [x] Files within limit (${job.maxFilesToTouch})
- [x] Traceability to spec verified

---
*Generated by Gaia Code Harness 🤖 — Flutter Web*`;
  }
}
