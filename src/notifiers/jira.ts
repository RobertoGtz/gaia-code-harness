/**
 * @fileoverview Jira notifier — writes comments and transitions tickets on job events.
 * @description Configure via:
 *   JIRA_BASE_URL       — e.g. https://your-org.atlassian.net
 *   JIRA_EMAIL          — Jira user email (basic auth)
 *   JIRA_API_TOKEN      — Jira API token
 *   JIRA_TRANSITION_MAP — optional JSON map overriding default transition names
 *
 * Default transition mapping:
 *   job.implementing  → "In Progress"
 *   job.done          → "Done"
 *   job.failed        → "Blocked"
 */

import { JobNotifier, JobEvent } from './base';

interface JiraTransitionMap {
  implementing?: string;
  done?:         string;
  failed?:       string;
}

const DEFAULT_TRANSITIONS: Required<JiraTransitionMap> = {
  implementing: 'In Progress',
  done:         'Done',
  failed:       'Blocked',
};

export class JiraNotifier implements JobNotifier {
  private readonly baseUrl:     string;
  private readonly authHeader:  string;
  private readonly transitions: Required<JiraTransitionMap>;

  constructor(
    baseUrl:    string,
    email:      string,
    apiToken:   string,
    transitionMap?: JiraTransitionMap,
  ) {
    this.baseUrl    = baseUrl.replace(/\/$/, '');
    this.authHeader = 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64');
    this.transitions = { ...DEFAULT_TRANSITIONS, ...transitionMap };
  }

  async notify(event: JobEvent): Promise<void> {
    const ticketId = this.extractTicketId(event);
    if (!ticketId) return;

    try {
      switch (event.event) {
        case 'job.spec_ready':
          await this.addComment(ticketId, this.buildSpecReadyComment(event));
          break;

        case 'job.implementing':
          await this.transitionIssue(ticketId, this.transitions.implementing);
          await this.addComment(ticketId, this.buildImplementingComment(event));
          break;

        case 'job.pr_created':
        case 'job.done':
          await this.transitionIssue(ticketId, this.transitions.done);
          await this.addComment(ticketId, this.buildDoneComment(event));
          break;

        case 'job.failed':
          await this.transitionIssue(ticketId, this.transitions.failed);
          await this.addComment(ticketId, this.buildFailedComment(event));
          break;
      }
    } catch (err) {
      console.warn(`[JiraNotifier] Failed to update ticket ${ticketId}: ${err}`);
    }
  }

  // ─── Jira REST API helpers ────────────────────────────────────────────────

  private async addComment(issueKey: string, body: string): Promise<void> {
    const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/comment`;
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Authorization': this.authHeader,
        'Accept':        'application/json',
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        body: {
          type:    'doc',
          version: 1,
          content: [{
            type:    'paragraph',
            content: [{ type: 'text', text: body }],
          }],
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[JiraNotifier] addComment HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  private async transitionIssue(issueKey: string, transitionName: string): Promise<void> {
    const transitionId = await this.resolveTransitionId(issueKey, transitionName);
    if (!transitionId) {
      console.warn(`[JiraNotifier] Transition "${transitionName}" not found for ${issueKey} — skipping`);
      return;
    }
    const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/transitions`;
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Authorization': this.authHeader,
        'Accept':        'application/json',
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[JiraNotifier] transitionIssue HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  private async resolveTransitionId(issueKey: string, name: string): Promise<string | null> {
    const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/transitions`;
    const res = await fetch(url, {
      headers: { 'Authorization': this.authHeader, 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json() as { transitions: Array<{ id: string; name: string }> };
    const match = data.transitions.find(
      t => t.name.toLowerCase() === name.toLowerCase(),
    );
    return match?.id ?? null;
  }

  // ─── Comment builders ─────────────────────────────────────────────────────

  private buildSpecReadyComment(event: JobEvent): string {
    return [
      `📋 GAIA — Spec generated and awaiting approval`,
      ``,
      `Title:    ${event.title}`,
      `Platform: ${event.platform}${event.tddMode ? '  •  TDD: ON' : ''}`,
      `Job ID:   ${event.jobId}`,
      ``,
      `The technical spec has been generated. Please review and approve via:`,
      `POST /jobs/${event.jobId}/approve`,
    ].join('\n');
  }

  private buildImplementingComment(event: JobEvent): string {
    return [
      `⚙️ GAIA — Implementation started`,
      ``,
      `Title:    ${event.title}`,
      `Platform: ${event.platform}`,
      `Job ID:   ${event.jobId}`,
    ].join('\n');
  }

  private buildDoneComment(event: JobEvent): string {
    const lines = [
      `✅ GAIA — Job completed`,
      ``,
      `Title:    ${event.title}`,
      `Platform: ${event.platform}`,
      `Job ID:   ${event.jobId}`,
    ];
    if (event.prUrl) {
      lines.push(``, `Pull Request: ${event.prUrl}`);
    }
    if (event.mutationScore !== undefined) {
      const badge = event.mutationScore >= 80 ? '✅' : '⚠️';
      lines.push(`Mutation score: ${badge} ${event.mutationScore.toFixed(1)}%`);
    }
    return lines.join('\n');
  }

  private buildFailedComment(event: JobEvent): string {
    const lines = [
      `❌ GAIA — Job failed`,
      ``,
      `Title:    ${event.title}`,
      `Platform: ${event.platform}`,
      `Job ID:   ${event.jobId}`,
      `Status:   ${event.status}`,
    ];
    if (event.error) {
      lines.push(``, `Error:`, event.error.slice(0, 500));
    }
    lines.push(``, `Retry via: POST /jobs/${event.jobId}/retry`);
    return lines.join('\n');
  }

  // ─── Ticket ID extraction ─────────────────────────────────────────────────

  /**
   * Extracts a Jira ticket ID from the event.
   * Falls back to parsing "PROJ-123" from the job title.
   */
  private extractTicketId(event: JobEvent): string | null {
    const jiraKeyPattern = /[A-Z][A-Z0-9]+-\d+/;
    const fromTitle = event.title?.match(jiraKeyPattern)?.[0];
    return fromTitle ?? null;
  }
}
