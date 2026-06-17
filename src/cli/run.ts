#!/usr/bin/env node
/**
 * @fileoverview CLI entry point for Claude Code / local mode
 * @description Runs a single job from a JSON file or inline args, using the
 *              disk state backend. Designed to be invoked by Claude Code agents.
 *
 * Usage:
 *   npx ts-node src/cli/run.ts --job path/to/job.json
 *   npx ts-node src/cli/run.ts --job '{"title":"...", "platform":"ios", ...}'
 *   npx ts-node src/cli/run.ts --id <existing-job-id>  # resume
 *   npx ts-node src/cli/run.ts --list                  # show all jobs
 *
 * @module cli/run
 */

import * as fs from 'fs';
import * as path from 'path';
import { setStateBackend } from '../state';
import { DiskBackend } from '../state/disk-backend';
import { orchestrateJob } from '../harness/leader';
import { CodeGenerationJob, Platform } from '../types';

// ── Bootstrap ────────────────────────────────────────────────────────────────

// Expose harness root so custom plugin agents can resolve internal modules
process.env.GAIA_HARNESS_ROOT = process.env.GAIA_HARNESS_ROOT
  || path.resolve(__dirname, '../..');

const backend = new DiskBackend();
setStateBackend(backend);

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name: string): boolean => args.includes(name);

async function main(): Promise<void> {
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
    console.log(`Resuming job ${existingId}…`);
    await orchestrateJob(existingId);
    return;
  }

  // Create new job from --job flag
  const jobArg = flag('--job');
  if (!jobArg) {
    console.error('Usage: run.ts --job <json-file-or-inline-json>  |  --id <job-id>  |  --list');
    process.exit(1);
  }

  let raw: Record<string, unknown>;
  if (jobArg.trim().startsWith('{')) {
    raw = JSON.parse(jobArg);
  } else {
    raw = JSON.parse(fs.readFileSync(path.resolve(jobArg), 'utf8'));
  }

  const acceptanceCriteria = ((raw.acceptanceCriteria ?? []) as string[]).map((t, i) => ({
    id: `ac-${i + 1}`,
    text: t,
    testable: true,
  }));

  const jobInit = {
    jiraTicketId:         raw.jiraTicketId as string | undefined,
    initiativeId:         (raw.initiativeId as string | undefined) ?? 'cli',
    title:                raw.title as string,
    platform:             raw.platform as Platform,
    repo:                 raw.repo as string,
    module:               raw.module as string | undefined,
    targetBranch:         (raw.targetBranch as string | undefined) ?? 'develop',
    description:          raw.description as string | undefined,
    acceptanceCriteria,
    maxFilesToTouch:      (raw.maxFilesToTouch as number | undefined) ?? 5,
    requireTests:         (raw.requireTests as boolean | undefined) ?? true,
    status:               'pending' as const,
    progressLogs:         [] as string[],
  } satisfies Omit<CodeGenerationJob, 'id' | 'createdAt' | 'updatedAt'>;

  const job = await backend.createJob(jobInit);
  console.log(`\nJob created: ${job.id}`);
  console.log(`Progress log: progress/${job.id}.md\n`);

  await orchestrateJob(job.id);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
