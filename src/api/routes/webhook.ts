/**
 * @fileoverview Webhook trigger route — POST /webhook/trigger
 * @description Accepts inbound webhooks from Jira, Slack, or any HTTP source
 *              and creates + launches a GAIA job automatically.
 *
 * Supported payload shapes:
 *   - Jira issue webhook  (issue_created / issue_updated)
 *   - Slack slash command (/gaia <platform> <repo> <title>)
 *   - Generic GAIA JSON   (same body as POST /jobs)
 *
 * Security: set WEBHOOK_SECRET env var to validate X-GAIA-Signature header
 *           (HMAC-SHA256, same scheme as GenericWebhookNotifier outbound).
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';
import { createJob }                                  from '../../state';
import { orchestrateJob }                             from '../../harness/leader';
import { buildNotifier }                              from '../../notifiers';
import { fetchJiraTicket, JiraError, JiraConfigError, JiraAuthError, JiraNotFoundError } from '../../tools/jira';
import { Platform, CreateJobRequest, CodeGenerationJob } from '../../types';

// ─── Payload parsers ────────────────────────────────────────────────────────

interface NormalizedTrigger {
  title:       string;
  platform:    Platform;
  repo:        string;
  targetBranch: string;
  jiraTicketId?: string;
  jiraEpicId?:   string;
  figmaUrl?:     string;
  description?:  string;
  module?:       string;
  tddMode:     boolean;
  requireTests: boolean;
  maxFilesToTouch: number;
  acceptanceCriteria?: Array<{ id?: string; text: string }>;
}

export function parseJiraWebhook(body: any): NormalizedTrigger | null {
  const issue = body?.issue;
  if (!issue) return null;

  const summary  = issue.fields?.summary ?? 'Jira task';
  const labels: string[] = issue.fields?.labels ?? [];
  const platform = (labels.find((l: string) =>
    ['flutter', 'flutter_web', 'ios', 'android'].includes(l)) ?? 'flutter') as Platform;
  const repo     = issue.fields?.customfield_repo
                   ?? process.env.DEFAULT_REPO
                   ?? '';
  const tddMode  = labels.includes('tdd');

  return {
    title:        summary,
    platform,
    repo,
    targetBranch: 'develop',
    jiraTicketId: issue.key,
    tddMode,
    requireTests: !labels.includes('skip-tests'),
    maxFilesToTouch: 5,
  };
}

export function parseSlackCommand(body: any): NormalizedTrigger | null {
  // Slack slash command sends application/x-www-form-urlencoded
  // Expected text: "<platform> <repo> <title...>"
  const text: string = body?.text ?? '';
  const parts = text.trim().split(/\s+/);
  if (parts.length < 3) return null;

  const [platform, repo, ...titleParts] = parts;
  const validPlatforms: Platform[] = ['flutter', 'flutter_web', 'ios', 'android'];
  if (!validPlatforms.includes(platform as Platform)) return null;

  return {
    title:        titleParts.join(' '),
    platform:     platform as Platform,
    repo,
    targetBranch: 'develop',
    tddMode:      false,
    requireTests: true,
    maxFilesToTouch: 5,
  };
}

export function parseGenericBody(body: any): NormalizedTrigger | null {
  if (!body?.title || !body?.platform || !body?.repo) return null;
  return {
    title:             body.title,
    platform:          body.platform as Platform,
    repo:              body.repo,
    targetBranch:      body.targetBranch ?? 'develop',
    jiraTicketId:      body.jiraTicketId,
    jiraEpicId:        body.jiraEpicId,
    figmaUrl:          body.figmaUrl,
    description:       body.description,
    module:            body.module,
    tddMode:           body.tddMode === true,
    requireTests:      body.requireTests !== false,
    maxFilesToTouch:   typeof body.maxFilesToTouch === 'number' ? body.maxFilesToTouch : 5,
    acceptanceCriteria: body.acceptanceCriteria,
  };
}

function detectAndParse(body: any, headers: Record<string, string | string[] | undefined>): NormalizedTrigger | null {
  const ua = String(headers['user-agent'] ?? '');

  if (headers['x-atlassian-token'] || body?.webhookEvent?.startsWith('jira:')) {
    return parseJiraWebhook(body);
  }
  if (ua.includes('Slackbot') || body?.command?.startsWith('/')) {
    return parseSlackCommand(body);
  }
  return parseGenericBody(body);
}

// ─── Signature verification ─────────────────────────────────────────────────

function verifySignature(raw: string, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── Route registration ─────────────────────────────────────────────────────

export async function setupWebhookRoutes(app: FastifyInstance): Promise<void> {
  const secret   = process.env.WEBHOOK_SECRET;
  const notifier = buildNotifier();

  app.post('/webhook/trigger', async (req: FastifyRequest, reply: FastifyReply) => {
    // Optional signature verification
    if (secret) {
      const sig = req.headers['x-gaia-signature'] as string | undefined;
      const raw = JSON.stringify(req.body);
      if (!verifySignature(raw, sig, secret)) {
        return reply.status(401).send({ error: 'Invalid webhook signature' });
      }
    }

    const trigger = detectAndParse(req.body as any, req.headers as any);
    if (!trigger) {
      return reply.status(400).send({
        error: 'Could not parse webhook payload',
        hint:  'Supported: Jira issue webhook, Slack slash command, or generic GAIA JSON',
      });
    }

    if (!trigger.repo) {
      return reply.status(400).send({
        error: 'Cannot determine target repository',
        hint:  'Set DEFAULT_REPO env var or include "repo" in the payload',
      });
    }

    // Enrich trigger with full Jira data if we have a ticket key but no ACs
    if (trigger.jiraTicketId && (!trigger.acceptanceCriteria || trigger.acceptanceCriteria.length === 0)) {
      try {
        const ticket = await fetchJiraTicket(trigger.jiraTicketId);
        if (ticket.acceptanceCriteria.length > 0) {
          trigger.acceptanceCriteria = ticket.acceptanceCriteria.map(t => ({ text: t }));
        }
        if (ticket.platform)  trigger.platform  = ticket.platform;
        if (ticket.repo)      trigger.repo       = ticket.repo;
        if (ticket.title)     trigger.title      = ticket.title;
        if (ticket.epicKey)   trigger.jiraEpicId = ticket.epicKey;
        if (ticket.figmaUrl)  trigger.figmaUrl   = ticket.figmaUrl;
      } catch (err) {
        // Non-blocking: if Jira fetch fails, proceed with what we have.
        // Auth/not-found/config errors are logged clearly so operators can fix credentials.
        if (err instanceof JiraConfigError || err instanceof JiraAuthError || err instanceof JiraNotFoundError) {
          console.warn(`[webhook] Jira enrichment skipped for ${trigger.jiraTicketId}: ${err instanceof JiraConfigError ? 'missing config' : err.message}`);
        } else if (err instanceof JiraError) {
          console.warn(`[webhook] Jira enrichment failed for ${trigger.jiraTicketId}: HTTP ${err.status} — ${err.message}`);
        } else {
          console.warn(`[webhook] Jira enrichment failed for ${trigger.jiraTicketId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // Create job in Postgres (same shape as POST /jobs flat-body path)
    type JobData = Omit<CodeGenerationJob, 'id' | 'status' | 'progressLogs' | 'createdAt' | 'updatedAt'>;
    const jobData: JobData = {
      title:              trigger.title,
      platform:           trigger.platform,
      repo:               trigger.repo,
      targetBranch:       trigger.targetBranch,
      jiraTicketId:       trigger.jiraTicketId,
      jiraEpicId:         trigger.jiraEpicId,
      figmaUrl:           trigger.figmaUrl,
      description:        trigger.description,
      module:             trigger.module,
      tddMode:            trigger.tddMode,
      initiativeId:       `init-${Date.now()}`,
      maxFilesToTouch:    trigger.maxFilesToTouch,
      requireTests:       trigger.requireTests,
      acceptanceCriteria: (trigger.acceptanceCriteria ?? []).map((ac, i) => ({
        id:       ac.id ?? `ac-${i}`,
        text:     ac.text,
        testable: true,
      })),
    };
    const job = await createJob(jobData);

    // Launch pipeline asynchronously (non-blocking — same as POST /jobs)
    orchestrateJob(job.id, notifier).catch(err =>
      console.error(`[webhook] orchestrateJob failed for ${job.id}: ${err}`)
    );

    return reply.status(202).send({
      jobId:    job.id,
      status:   'accepted',
      title:    trigger.title,
      platform: trigger.platform,
      tddMode:  trigger.tddMode,
      message:  'Job created and pipeline started',
    });
  });
}
