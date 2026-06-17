/**
 * @fileoverview Slack notifier — sends job events to a Slack incoming webhook.
 * @description Configure via SLACK_WEBHOOK_URL env var.
 *              Each job event becomes a Slack Block Kit message.
 */

import { JobNotifier, JobEvent, JobEventType } from './base';

const STATUS_EMOJI: Record<JobEventType, string> = {
  'job.created':          '🆕',
  'job.spec_ready':       '📋',
  'job.implementing':     '⚙️',
  'job.reviewing':        '🔍',
  'job.mutation_testing': '🧬',
  'job.pr_created':       '📬',
  'job.done':             '✅',
  'job.failed':           '❌',
  'job.progress':         '🔄',
};

export class SlackNotifier implements JobNotifier {
  constructor(private readonly webhookUrl: string) {}

  async notify(event: JobEvent): Promise<void> {
    try {
      const body = this.buildPayload(event);
      const res = await fetch(this.webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn(`[SlackNotifier] HTTP ${res.status} for event ${event.event}`);
      }
    } catch (err) {
      console.warn(`[SlackNotifier] Failed to send notification: ${err}`);
    }
  }

  private buildPayload(event: JobEvent): object {
    const emoji   = STATUS_EMOJI[event.event] ?? '🔔';
    const header  = `${emoji} *GAIA* — ${event.title}`;
    const fields  = this.buildFields(event);

    const blocks: object[] = [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: header },
      },
      {
        type: 'section',
        fields,
      },
    ];

    if (event.error) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Error:*\n\`\`\`${event.error.slice(0, 400)}\`\`\`` },
      });
    }

    if (event.prUrl) {
      blocks.push({
        type: 'actions',
        elements: [{
          type:      'button',
          text:      { type: 'plain_text', text: '🔗 View PR' },
          url:       event.prUrl,
          style:     'primary',
        }],
      });
    }

    blocks.push({ type: 'divider' });

    return { blocks };
  }

  private buildFields(event: JobEvent): object[] {
    const fields: object[] = [
      { type: 'mrkdwn', text: `*Status*\n${event.status}` },
      { type: 'mrkdwn', text: `*Platform*\n${event.platform}` },
    ];

    if (event.tddMode !== undefined) {
      fields.push({ type: 'mrkdwn', text: `*TDD Mode*\n${event.tddMode ? 'ON' : 'OFF'}` });
    }

    if (event.mutationScore !== undefined) {
      const score  = event.mutationScore.toFixed(1);
      const badge  = event.mutationScore >= 80 ? '✅' : '⚠️';
      fields.push({ type: 'mrkdwn', text: `*Mutation Score*\n${badge} ${score}%` });
    }

    fields.push({ type: 'mrkdwn', text: `*Job ID*\n\`${event.jobId.slice(0, 8)}\`` });
    fields.push({ type: 'mrkdwn', text: `*Time*\n${new Date(event.timestamp).toLocaleTimeString()}` });

    return fields;
  }
}
