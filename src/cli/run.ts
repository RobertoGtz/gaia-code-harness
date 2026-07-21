#!/usr/bin/env node
/**
 * @fileoverview CLI entry point — Mode B (CLI + disk backend)
 * @description Runs a single job from a JSON file or inline args, using the
 *              DiskBackend. Designed for local development and Claude Code agent use.
 *
 * Usage:
 *   npx ts-node src/cli/run.ts path/to/job.json
 *   npx ts-node src/cli/run.ts --job path/to/job.json
 *   npx ts-node src/cli/run.ts '{"title":"...", "platform":"ios", ...}'
 *   npx ts-node src/cli/run.ts job.json --approve      # auto-approve spec and run full pipeline
 *   npx ts-node src/cli/run.ts job.json --tdd --approve # Red-Green-Refactor mode
 *   npx ts-node src/cli/run.ts --id <job-id> --reject "feedback" # reject spec and regenerate with feedback
 *   npx ts-node src/cli/run.ts --jira PROJ-123 --approve      # fetch from Jira and run full pipeline
 *   npx ts-node src/cli/run.ts --id <existing-job-id>         # resume
 *   npx ts-node src/cli/run.ts --id <existing-job-id> --retry # retry from review_error/test_error/failed
 *   npx ts-node src/cli/run.ts --list                         # show all jobs
 *
 * @module cli/run
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { setStateBackend } from '../state';
import { DiskBackend } from '../state/disk-backend';
import { orchestrateJob } from '../harness/leader';
import { CodeGenerationJob, Platform, JobStatus } from '../types';
import { fetchJiraTicket, JiraError, JiraConfigError, JiraAuthError, JiraNotFoundError } from '../tools/jira';

// ── Bootstrap ────────────────────────────────────────────────────────────────

// Expose harness root so custom plugin agents can resolve internal modules
process.env.GAIA_HARNESS_ROOT = process.env.GAIA_HARNESS_ROOT
  || path.resolve(__dirname, '../..');

// ── CLI args ────────────────────────────────────────────────────────────────

export function parseArgs(argv: string[]) {
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (name: string): boolean => argv.includes(name);
  return { flag, has };
}

const RETRYABLE_STATUSES: JobStatus[] = ['build_error', 'review_error', 'test_error', 'failed'];

export async function retryJob(jobId: string, backend: DiskBackend): Promise<void> {
  const job = await backend.getJob(jobId);
  if (!job) {
    console.error(`Job ${jobId} not found`);
    return;
  }
  if (!RETRYABLE_STATUSES.includes(job.status)) {
    console.log(`Job status is ${job.status}, not retryable.`);
    return;
  }
  console.log(`Retrying job ${jobId} from ${job.status}...`);
  await backend.updateJobStatus(jobId, 'implementing');
  await orchestrateJob(jobId);
}

export async function approveAndResume(jobId: string, backend: DiskBackend): Promise<void> {
  const job = await backend.getJob(jobId);
  if (!job) {
    console.error(`Job ${jobId} not found`);
    return;
  }
  if (job.status === 'spec_ready') {
    console.log('Auto-approving spec...');
    await backend.updateJobStatus(jobId, 'spec_approved');
    await orchestrateJob(jobId);
  } else if (job.status === 'pr_created' || job.status === 'done') {
    console.log(`Job already finished: ${job.status}`);
  } else {
    console.log(`Job status is ${job.status}, not auto-approving.`);
  }
}

const MAX_SPEC_RETRIES = 3;

export async function rejectAndResume(jobId: string, feedback: string, backend: DiskBackend): Promise<void> {
  const job = await backend.getJob(jobId);
  if (!job) {
    console.error(`Job ${jobId} not found`);
    return;
  }
  if (job.status !== 'spec_ready') {
    console.log(`Job status is ${job.status}, not spec_ready. Cannot reject spec.`);
    return;
  }
  const retryCount = job.specRetryCount ?? 0;
  if (retryCount >= MAX_SPEC_RETRIES) {
    console.error(`Maximum spec retry attempts (${MAX_SPEC_RETRIES}) reached. Create a new job or use --retry.`);
    return;
  }
  console.log(`Rejecting spec (retry ${retryCount + 1}/${MAX_SPEC_RETRIES}) with feedback: ${feedback}`);
  await backend.updateJobStatus(jobId, 'spec_generating', {
    specFeedback: feedback,
    specRetryCount: retryCount + 1,
  });
  await orchestrateJob(jobId);
}

export async function main(
  argv: string[] = process.argv.slice(2),
  deps: { backend?: DiskBackend } = {}
): Promise<void> {
  const backend = deps.backend ?? new DiskBackend();
  setStateBackend(backend);
  const { flag, has } = parseArgs(argv);
  // List mode
  if (has('--list')) {
    const jobs = await backend.listJobs();
    if (jobs.length === 0) { console.log('No jobs found.'); return; }
    console.log('\nJobs:\n');
    for (const j of jobs) {
      console.log(`  [${j.status.padEnd(18)}] ${j.id.slice(0, 8)}  ${j.title}  (${j.platform})`);
    }
    return;
  }

  // Resume existing job
  const existingId = flag('--id');
  if (existingId) {
    const rejectFeedback = flag('--reject');
    if (has('--retry')) {
      await retryJob(existingId, backend);
    } else if (has('--reject') || rejectFeedback) {
      await rejectAndResume(existingId, rejectFeedback ?? '', backend);
    } else {
      console.log(`Resuming job ${existingId}…`);
      await orchestrateJob(existingId);
      if (has('--approve')) {
        await approveAndResume(existingId, backend);
      }
    }
    return;
  }

  // Jira-only mode: --jira PROJ-123
  const jiraKey = flag('--jira');
  if (jiraKey) {
    console.log(`Fetching Jira ticket: ${jiraKey}…`);
    const ticket = await fetchJiraTicket(jiraKey);
    if (!ticket.platform) {
      console.error(`Error: Could not infer platform from Jira ticket ${jiraKey}. Add a platform label (flutter, ios, android).`);
      process.exit(1);
    }
    const job = await backend.createJob({
      jiraTicketId:    jiraKey,
      jiraEpicId:      ticket.epicKey,
      initiativeId:    'cli',
      title:           ticket.title,
      platform:        ticket.platform,
      repo:            ticket.repo || process.env.DEFAULT_REPO || '',
      targetBranch:    ticket.targetBranch || 'develop',
      description:     ticket.description,
      acceptanceCriteria: ticket.acceptanceCriteria.map((text, i) => ({
        id: `ac-${i + 1}`, text, testable: true,
      })),
      figmaUrl:        ticket.figmaUrl,
      maxFilesToTouch: 5,
      requireTests:    true,
      tddMode:         has('--tdd'),
    });
    console.log(`\nJob created from Jira: ${job.id}`);
    console.log(`  Title:    ${ticket.title}`);
    console.log(`  Platform: ${ticket.platform}`);
    console.log(`  ACs:      ${ticket.acceptanceCriteria.length}`);
    console.log(`  Progress: progress/${job.id}.md\n`);
    await orchestrateJob(job.id);
    if (has('--approve')) {
      await approveAndResume(job.id, backend);
    }
    return;
  }

  // Create new job from --job flag or a positional argument (file path / inline JSON)
  const jobArg = flag('--job') ?? argv.find(a => !a.startsWith('-') && (a.startsWith('{') || a.endsWith('.json')));
  if (!jobArg) {
    console.error('Usage: run.ts <json-file-or-inline-json> [--approve|--reject "feedback"]  |  --job <json-file-or-inline-json> [--approve|--reject "feedback"]  |  --jira <PROJ-123> [--approve]  |  --id <job-id> [--approve|--reject "feedback"|--retry]  |  --list');
    process.exit(1);
  }

  let raw: Record<string, unknown>;
  if (jobArg.trim().startsWith('{')) {
    raw = JSON.parse(jobArg);
  } else {
    raw = JSON.parse(fs.readFileSync(path.resolve(jobArg), 'utf8'));
  }

  // If JSON has jiraTicketId but no platform/title, fetch from Jira
  if (raw.jiraTicketId && !raw.platform && !raw.title) {
    console.log(`Fetching Jira ticket: ${raw.jiraTicketId}…`);
    const ticket = await fetchJiraTicket(raw.jiraTicketId as string);
    if (!ticket.platform) {
      console.error(`Error: Could not infer platform from Jira ticket ${raw.jiraTicketId}. Add a platform label.`);
      process.exit(1);
    }
    raw.title = ticket.title;
    raw.platform = ticket.platform;
    raw.repo = raw.repo || ticket.repo;
    raw.description = raw.description || ticket.description;
    raw.acceptanceCriteria = raw.acceptanceCriteria || ticket.acceptanceCriteria;
    if (ticket.figmaUrl) raw.figmaUrl = ticket.figmaUrl;
  }

  const acceptanceCriteria = ((raw.acceptanceCriteria ?? []) as string[]).map((t, i) => ({
    id: `ac-${i + 1}`,
    text: t,
    testable: true,
  }));

  const jobInit = {
    jiraTicketId:         raw.jiraTicketId as string | undefined,
    jiraEpicId:           raw.jiraEpicId   as string | undefined,
    initiativeId:         (raw.initiativeId as string | undefined) ?? 'cli',
    title:                raw.title as string,
    platform:             raw.platform as Platform,
    repo:                 raw.repo as string,
    module:               raw.module as string | undefined,
    targetBranch:         (raw.targetBranch as string | undefined) ?? 'develop',
    description:          raw.description as string | undefined,
    figmaUrl:             raw.figmaUrl    as string | undefined,
    acceptanceCriteria,
    maxFilesToTouch:      (raw.maxFilesToTouch as number | undefined) ?? 5,
    requireTests:         (raw.requireTests as boolean | undefined) ?? true,
    tddMode:              has('--tdd') || (raw.tddMode as boolean | undefined) || false,
    buildStrategy:        raw.buildStrategy as CodeGenerationJob['buildStrategy'],
    requestSource:        'cli',
    status:               'pending' as const,
    progressLogs:         [] as string[],
  } satisfies Omit<CodeGenerationJob, 'id' | 'createdAt' | 'updatedAt'>;

  const job = await backend.createJob(jobInit);
  console.log(`\nJob created: ${job.id}`);
  console.log(`Progress log: progress/${job.id}.md\n`);

  await orchestrateJob(job.id);
  const rejectFeedback = flag('--reject');
  if (has('--approve')) {
    await approveAndResume(job.id, backend);
  } else if (has('--reject') || rejectFeedback) {
    await rejectAndResume(job.id, rejectFeedback ?? '', backend);
  }
}

if (require.main === module) {
  main().catch(err => {
    if (err instanceof JiraConfigError) {
      console.error(`\n${err.message}`);
      console.error('Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env');
    } else if (err instanceof JiraAuthError) {
      console.error(`\n${err.message}`);
      console.error('Verify your JIRA_EMAIL and JIRA_API_TOKEN are correct and have read access to the project.');
    } else if (err instanceof JiraNotFoundError) {
      console.error(`\n${err.message}`);
    } else if (err instanceof JiraError) {
      console.error(`\n[Jira] ${err.message} (HTTP ${err.status})`);
    } else {
      console.error('Fatal:', err);
    }
    process.exit(1);
  });
}
