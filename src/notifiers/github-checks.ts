/**
 * @fileoverview GitHub Checks API notifier
 * @description Creates and updates a GitHub Check Run for the job's commit/PR.
 *              Requires GITHUB_CHECKS_TOKEN (fine-grained PAT with checks:write scope)
 *              and GITHUB_OWNER + GITHUB_REPO env vars.
 *
 *              Maps job events to Check Run status/conclusion:
 *                job.created / implementing / reviewing → status: in_progress
 *                job.pr_created / done                  → status: completed, conclusion: success
 *                job.failed                             → status: completed, conclusion: failure
 */

import { JobNotifier, JobEvent } from './base';

const GITHUB_API = 'https://api.github.com';

export class GitHubChecksNotifier implements JobNotifier {
  private checkRunIds = new Map<string, number>(); // jobId → checkRunId

  constructor(
    private readonly token: string,
    private readonly owner: string,
    private readonly repo:  string,
  ) {}

  async notify(event: JobEvent): Promise<void> {
    try {
      if (event.event === 'job.created') {
        await this.createCheckRun(event);
      } else {
        await this.updateCheckRun(event);
      }
    } catch (err) {
      console.warn(`[GitHubChecksNotifier] ${err}`);
    }
  }

  // ── private ───────────────────────────────────────────────────────────────

  private async createCheckRun(event: JobEvent): Promise<void> {
    const body = {
      name:       `GAIA — ${event.platform}`,
      head_sha:   event.jobId,  // caller should pass the commit SHA as jobId when using CI mode
      status:     'in_progress' as const,
      started_at: event.timestamp,
      output: {
        title:   event.title,
        summary: `Job started. Platform: ${event.platform}. TDD mode: ${event.tddMode ? 'ON' : 'OFF'}.`,
      },
    };

    const res = await this.request('POST', `/repos/${this.owner}/${this.repo}/check-runs`, body);
    if (res.id) {
      this.checkRunIds.set(event.jobId, res.id);
    }
  }

  private async updateCheckRun(event: JobEvent): Promise<void> {
    const checkRunId = this.checkRunIds.get(event.jobId);
    if (!checkRunId) return; // check run not registered (e.g. server restart)

    const terminal = event.event === 'job.pr_created'
      || event.event === 'job.done'
      || event.event === 'job.failed';

    const body: Record<string, unknown> = {
      status:  terminal ? 'completed' : 'in_progress',
      output: {
        title:   event.title,
        summary: this.buildSummary(event),
      },
    };

    if (terminal) {
      body['completed_at'] = event.timestamp;
      body['conclusion']   = event.event === 'job.failed' ? 'failure' : 'success';
      if (event.prUrl) {
        (body['output'] as any).text = `[View Pull Request](${event.prUrl})`;
      }
    }

    await this.request('PATCH', `/repos/${this.owner}/${this.repo}/check-runs/${checkRunId}`, body);
  }

  private buildSummary(event: JobEvent): string {
    const parts = [`**Status:** ${event.status}`];
    if (event.mutationScore !== undefined) {
      parts.push(`**Mutation score:** ${event.mutationScore.toFixed(1)}%`);
    }
    if (event.error) {
      parts.push(`**Error:** ${event.error.slice(0, 300)}`);
    }
    return parts.join('\n');
  }

  private async request(method: string, path: string, body: object): Promise<any> {
    const res = await fetch(`${GITHUB_API}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept':        'application/vnd.github+json',
        'Content-Type':  'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub Checks API ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json().catch(() => ({}));
  }
}
