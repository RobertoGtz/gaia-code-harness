/**
 * @fileoverview Notifier factory
 * @description Reads env vars and returns the appropriate JobNotifier(s).
 *              Multiple notifiers can be active simultaneously (CompositeNotifier).
 *
 * Env vars:
 *   SLACK_WEBHOOK_URL        — enables Slack notifier
 *   GITHUB_CHECKS_TOKEN      — enables GitHub Checks notifier (also needs GITHUB_OWNER + GITHUB_REPO)
 *   NOTIFY_WEBHOOK_URL       — enables generic HTTP webhook notifier
 *   NOTIFY_WEBHOOK_SECRET    — optional HMAC secret for generic notifier
 *   JIRA_BASE_URL            — enables Jira notifier (also needs JIRA_EMAIL + JIRA_API_TOKEN)
 *   JIRA_TRANSITION_MAP      — optional JSON override e.g. {"done":"Resolved","failed":"Blocked"}
 */

export { JobNotifier, JobEvent, JobEventType, NullNotifier } from './base';
export { SlackNotifier }          from './slack';
export { GitHubChecksNotifier }   from './github-checks';
export { GenericWebhookNotifier } from './generic';
export { JiraNotifier }           from './jira';

import { JobNotifier, NullNotifier } from './base';
import { SlackNotifier }             from './slack';
import { GitHubChecksNotifier }      from './github-checks';
import { GenericWebhookNotifier }    from './generic';
import { JiraNotifier }              from './jira';

/** Fans out notifications to all configured notifiers. */
class CompositeNotifier implements JobNotifier {
  constructor(private readonly notifiers: JobNotifier[]) {}

  async notify(event: import('./base').JobEvent): Promise<void> {
    await Promise.allSettled(this.notifiers.map(n => n.notify(event)));
  }
}

/**
 * Build and return the active notifier based on environment variables.
 * Returns NullNotifier if no notification targets are configured.
 */
export function buildNotifier(): JobNotifier {
  const active: JobNotifier[] = [];

  if (process.env.SLACK_WEBHOOK_URL) {
    active.push(new SlackNotifier(process.env.SLACK_WEBHOOK_URL));
    console.log('[Notifier] Slack notifier enabled');
  }

  if (process.env.GITHUB_CHECKS_TOKEN) {
    const owner = process.env.GITHUB_OWNER ?? '';
    const repo  = process.env.GITHUB_REPO  ?? '';
    if (owner && repo) {
      active.push(new GitHubChecksNotifier(process.env.GITHUB_CHECKS_TOKEN, owner, repo));
      console.log(`[Notifier] GitHub Checks notifier enabled (${owner}/${repo})`);
    } else {
      console.warn('[Notifier] GITHUB_CHECKS_TOKEN set but GITHUB_OWNER/GITHUB_REPO missing — skipping');
    }
  }

  if (process.env.NOTIFY_WEBHOOK_URL) {
    active.push(new GenericWebhookNotifier(
      process.env.NOTIFY_WEBHOOK_URL,
      process.env.NOTIFY_WEBHOOK_SECRET,
    ));
    console.log(`[Notifier] Generic webhook notifier enabled → ${process.env.NOTIFY_WEBHOOK_URL}`);
  }

  if (process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN) {
    let transitionMap: Record<string, string> | undefined;
    if (process.env.JIRA_TRANSITION_MAP) {
      try {
        transitionMap = JSON.parse(process.env.JIRA_TRANSITION_MAP);
      } catch {
        console.warn('[Notifier] JIRA_TRANSITION_MAP is not valid JSON — using defaults');
      }
    }
    active.push(new JiraNotifier(
      process.env.JIRA_BASE_URL,
      process.env.JIRA_EMAIL,
      process.env.JIRA_API_TOKEN,
      transitionMap,
    ));
    console.log(`[Notifier] Jira notifier enabled → ${process.env.JIRA_BASE_URL}`);
  }

  if (active.length === 0) return new NullNotifier();
  if (active.length === 1) return active[0];
  return new CompositeNotifier(active);
}
