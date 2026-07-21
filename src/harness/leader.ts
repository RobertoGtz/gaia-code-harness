/**
 * @fileoverview Leader - Main orchestrator for job processing
 * @description State machine that coordinates agents through the job lifecycle
 * @module harness/leader
 */

import { getJob, updateJobStatus, addProgressLog, setErrorContext } from '../state';
import { getAgentsForPlatform } from '../agents/registry';
import { AgentContext, JobStatus, CodeGenerationJob, ErrorCode, ErrorContext } from '../types';
import { JobNotifier, JobEvent, NullNotifier } from '../notifiers';
import { fetchJiraTicket, JiraError, JiraConfigError, JiraAuthError, JiraNotFoundError } from '../tools/jira';
import * as path from 'path';

// Base path where repos will be cloned/worked on
const WORKSPACE_BASE = process.env.REPOS_BASE_PATH || '/tmp/gaia-workspace';

// ─── Terminal helpers ──────────────────────────────────────────────────────
const R = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  blue:    '\x1b[34m',
  gray:    '\x1b[90m',
  white:   '\x1b[37m',
  magenta: '\x1b[35m',
};

const STATUS_COLOR: Partial<Record<JobStatus, string>> = {
  pending:           R.gray,
  fetching_jira:     R.cyan,
  spec_generating:   R.cyan,
  spec_ready:        R.yellow,
  spec_approved:     R.green,
  implementing:      R.blue,
  reviewing:         R.magenta,
  pr_created:        R.green,
  done:              R.green,
  failed:            R.red,
  env_error:         R.red,
  repo_error:        R.red,
  build_error:       R.red,
  test_error:        R.yellow,
  review_error:      R.yellow,
  spec_error:        R.red,
};

/** Map ErrorCode → granular JobStatus */
const ERROR_STATUS: Record<ErrorCode, JobStatus> = {
  ENV_ERROR:    'env_error',
  REPO_ERROR:   'repo_error',
  BUILD_ERROR:  'build_error',
  TEST_ERROR:   'test_error',
  REVIEW_ERROR: 'review_error',
  SPEC_ERROR:   'spec_error',
  UNKNOWN:      'failed',
};

/** Which error statuses can be directly retried without human intervention */
const RETRYABLE_ERROR_STATUSES = new Set<JobStatus>([
  'test_error',
  'review_error',
  'failed',
]);

/**
 * Returns true if the job's request source allows closed-loop automatic retries.
 * In Mode B (CLI), the human is the feedback loop, so auto-retry stops after
 * the first ImplementerAgent attempt.
 */
function supportsAutoRetry(job: CodeGenerationJob): boolean {
  return job.requestSource !== 'cli';
}

function ts(): string {
  return `${R.gray}${new Date().toLocaleTimeString('en-GB')}${R.reset}`;
}

function banner(title: string, jobId: string, status: JobStatus): void {
  const color = STATUS_COLOR[status] ?? R.white;
  const line = '─'.repeat(60);
  console.log(`\n${R.bold}${color}${line}${R.reset}`);
  console.log(`${R.bold}${color}  GAIA  ▶  ${title.toUpperCase()}${R.reset}`);
  console.log(`${R.gray}  Job: ${jobId}${R.reset}`);
  console.log(`${R.bold}${color}${line}${R.reset}\n`);
}

function leaderLog(msg: string): void {
  console.log(`${ts()} ${R.bold}${R.white}[Leader]${R.reset} ${msg}`);
}

function leaderSuccess(msg: string): void {
  console.log(`${ts()} ${R.bold}${R.white}[Leader]${R.reset} ${R.green}✔ ${msg}${R.reset}`);
}

function leaderWarn(msg: string): void {
  console.log(`${ts()} ${R.bold}${R.white}[Leader]${R.reset} ${R.yellow}⚠ ${msg}${R.reset}`);
}

function leaderError(msg: string): void {
  console.error(`${ts()} ${R.bold}${R.white}[Leader]${R.reset} ${R.red}✖ ${msg}${R.reset}`);
}

function leaderJSON(label: string, data: unknown): void {
  const pretty = JSON.stringify(data, null, 2)
    .split('\n')
    .map((l, i) => i === 0 ? l : `         ${l}`)
    .join('\n');
  console.log(`${ts()} ${R.bold}${R.white}[Leader]${R.reset} ${R.gray}${label}:${R.reset}\n         ${pretty}`);
}

/**
 * Main orchestrator function that manages the job lifecycle.
 * Decides which agent to execute based on the current job status.
 * Implements a state machine with 13 possible states (including 6 granular error states).
 * 
 * @param jobId - UUID of the job to process
 * @throws Error if job not found or unexpected error occurs
 * @example
 * await orchestrateJob('550e8400-e29b-41d4-a716-446655440000');
 * // Processes job based on current status
 */
export async function orchestrateJob(
  jobId: string,
  notifier: JobNotifier = new NullNotifier(),
): Promise<void> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  leaderLog(`Processing job ${R.bold}${jobId}${R.reset} — status: ${R.cyan}${job.status}${R.reset}`);

  const emit = (event: JobEvent['event'], extra: Partial<JobEvent> = {}) =>
    notifier.notify({
      jobId,
      event,
      status:    job.status,
      title:     job.title,
      platform:  job.platform,
      timestamp: new Date().toISOString(),
      tddMode:   job.tddMode,
      ...extra,
    }).catch(() => {});

  try {
    switch (job.status) {
      case 'pending':
        await emit('job.created');
        await handlePending(job);
        break;
      case 'fetching_jira':
        await handleFetchingJira(job);
        break;
      case 'spec_generating':
        await handleSpecGenerating(job);
        break;
      case 'spec_ready':
        leaderWarn(`Job ${jobId} waiting for human approval (spec_ready)`);
        await emit('job.spec_ready');
        break;
      case 'spec_approved':
        await handleSpecApproved(job);
        break;
      case 'implementing':
        await emit('job.implementing');
        await handleImplementing(job);
        break;
      case 'reviewing':
        await emit('job.reviewing');
        await handleReviewing(job);
        break;
      case 'pr_created':
        await handlePRCreated(job, notifier);
        break;
      case 'done':
        leaderSuccess(`Job ${jobId} already completed`);
        break;
      // ── Granular error states ──────────────────────────────────────────
      case 'env_error':
        leaderError(`Job ${jobId} — ENV_ERROR: platform toolchain missing. Fix the environment and retry.`);
        break;
      case 'repo_error':
        leaderError(`Job ${jobId} — REPO_ERROR: repository access failed. Check credentials/permissions and retry.`);
        break;
      case 'build_error':
        leaderError(`Job ${jobId} — BUILD_ERROR: dependency resolution failed. Fix dependencies and retry.`);
        break;
      case 'test_error':
        leaderError(`Job ${jobId} — TEST_ERROR: tests/lint failed. Will retry implementation.`);
        break;
      case 'review_error':
        leaderError(`Job ${jobId} — REVIEW_ERROR: reviewer validation failed. Will retry.`);
        break;
      case 'spec_error':
        leaderError(`Job ${jobId} — SPEC_ERROR: spec generation failed. Check LLM config and retry.`);
        break;
      case 'failed':
        leaderError(`Job ${jobId} failed — waiting for retry`);
        await emit('job.failed');
        break;
      default:
        throw new Error(`Unknown status: ${job.status}`);
    }
  } catch (error) {
    leaderError(`Error processing job ${jobId}: ${error}`);
    await addProgressLog(jobId, `Error: ${error}`);
    await updateJobStatus(jobId, 'failed');
    await notifier.notify({
      jobId,
      event:     'job.failed',
      status:    'failed',
      title:     job.title,
      platform:  job.platform,
      timestamp: new Date().toISOString(),
      tddMode:   job.tddMode,
      error:     String(error),
    }).catch(() => {});
  }
}

/**
 * Handler for 'pending' state.
 * Initializes job processing and determines next state based on available context.
 * If acceptance criteria provided → spec_generating
 * If only Jira ticket ID → fetching_jira
 * 
 * @param job - The job to process
 * @example
 * await handlePending(job);
 * // Transitions to 'fetching_jira' or 'spec_generating'
 */
async function handlePending(job: CodeGenerationJob): Promise<void> {
  banner('Job Received', job.id, 'pending');
  leaderLog(`Platform: ${R.bold}${job.platform}${R.reset} | Ticket: ${R.cyan}${job.jiraTicketId || 'N/A'}${R.reset}`);
  await updateJobStatus(job.id, 'fetching_jira', { currentAgent: 'Leader' });
  await addProgressLog(job.id, 'Starting job orchestration');
  
  // Full context provided — skip directly to spec generation
  // Jira-only payload — fetch ticket data first
  if (job.acceptanceCriteria.length > 0) {
    await updateJobStatus(job.id, 'spec_generating');
    await orchestrateJob(job.id); // re-enter
  } else {
    // Need to fetch from Jira before spec generation
    await orchestrateJob(job.id); // re-enter
  }
}

/**
 * Handler for 'fetching_jira' state.
 * Fetches ticket information from Jira API via MCP.
 * Extracts: title, description, acceptance criteria, Figma links, priority.
 * 
 * @param job - The job with jiraTicketId or jiraEpicId
 * @throws Error if Jira fetch fails
 * @example
 * await handleFetchingJira(job);
 * // Fetches: { title, description, acceptanceCriteria[], figmaUrl }
 */
async function handleFetchingJira(job: CodeGenerationJob): Promise<void> {
  banner('Fetching Jira Ticket', job.id, 'fetching_jira');
  await updateJobStatus(job.id, 'fetching_jira', { currentAgent: 'JiraFetcher' });
  
  const ticketKey = job.jiraTicketId || job.jiraEpicId;
  if (!ticketKey) {
    throw new Error('No jiraTicketId or jiraEpicId to fetch');
  }

  try {
    await addProgressLog(job.id, `Fetching Jira ticket: ${ticketKey}`);
    const ticket = await fetchJiraTicket(ticketKey);

    // Enrich job with Jira data
    const enriched: Partial<CodeGenerationJob> = {
      title: ticket.title || job.title,
      description: ticket.description || job.description,
      figmaUrl: ticket.figmaUrl || job.figmaUrl,
    };

    if (ticket.platform && !job.platform) {
      enriched.platform = ticket.platform;
    }
    if (ticket.repo) {
      enriched.repo = ticket.repo;
    }
    if (ticket.acceptanceCriteria.length > 0) {
      enriched.acceptanceCriteria = ticket.acceptanceCriteria.map((text, i) => ({
        id: `ac-${i}`,
        text,
        testable: true,
      }));
    }
    if (ticket.epicKey) {
      enriched.jiraEpicId = ticket.epicKey;
    }

    await addProgressLog(job.id, `Jira ticket fetched: "${ticket.title}" [${ticket.platform || 'no platform label'}] — ${ticket.acceptanceCriteria.length} ACs`);
    await updateJobStatus(job.id, 'spec_generating', enriched);
    
    // Continue pipeline
    await orchestrateJob(job.id);
  } catch (error) {
    let message: string;
    if (error instanceof JiraConfigError) {
      message = `Jira configuration missing. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env`;
    } else if (error instanceof JiraAuthError) {
      message = `Jira authentication failed for ${ticketKey}. Verify JIRA_EMAIL and JIRA_API_TOKEN.`;
    } else if (error instanceof JiraNotFoundError) {
      message = `Jira ticket ${ticketKey} not found. Check the key and project permissions.`;
    } else if (error instanceof JiraError) {
      message = `Jira error for ${ticketKey}: ${error.message}`;
    } else {
      message = `Failed to fetch Jira info for ${ticketKey}: ${error instanceof Error ? error.message : String(error)}`;
    }
    await addProgressLog(job.id, `Failed to fetch Jira: ${message}`);
    throw new Error(message);
  }
}

/**
 * Handler for 'spec_generating' state.
 * Executes SpecAuthorAgent to generate technical specification from requirements.
 * Explores repo structure, identifies relevant files, generates tasks.
 * Result saved to disk and DB, then pauses for human approval.
 * 
 * @param job - The job with acceptance criteria
 * @throws Error if spec generation fails
 * @example
 * await handleSpecGenerating(job);
 * // Generates spec with: requirements, design, tasks, risks
 * // Transitions to 'spec_ready' (waits for human approval)
 */
async function handleSpecGenerating(job: CodeGenerationJob): Promise<void> {
  banner('Generating Technical Spec', job.id, 'spec_generating');
  await updateJobStatus(job.id, 'spec_generating', { currentAgent: 'SpecAuthor' });
  await addProgressLog(job.id, 'Generating technical specification');

  const workspacePath = path.join(WORKSPACE_BASE, job.id);
  const context: AgentContext = {
    job,
    workspacePath,
  };

  const agents = getAgentsForPlatform(job.platform);
  const result = await agents.specAuthor.execute(context);

  if (!result.success) {
    const errorCode = result.errorCode ?? 'UNKNOWN';
    const errorStatus = ERROR_STATUS[errorCode] ?? 'spec_error';
    const ctx: ErrorContext = {
      code: errorCode,
      stage: 'spec_generating',
      message: result.error ?? 'SpecAuthor failed',
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };
    await setErrorContext(job.id, ctx);
    await updateJobStatus(job.id, errorStatus);
    printErrorBox(job, ctx);
    return;
  }

  leaderSuccess(`Specification generated — ${result.spec?.requirements.length || 0} requirements, ${result.spec?.tasks.length || 0} tasks`);
  if (result.spec) {
    leaderJSON('Spec tasks', result.spec.tasks.map(t => ({ id: t.id, type: t.type, file: t.filePath, description: t.description })));
  }
  await addProgressLog(job.id, 'Specification generated');
  await addProgressLog(job.id, `Requirements: ${result.spec?.requirements.length || 0}`);
  await addProgressLog(job.id, `Tasks: ${result.spec?.tasks.length || 0}`);
  
  // Save spec and pause — pipeline resumes when POST /jobs/:id/approve is called
  await updateJobStatus(job.id, 'spec_ready', { spec: result.spec });
  leaderWarn('Spec ready — waiting for human approval (POST /jobs/:id/approve)');
  await addProgressLog(job.id, 'Waiting for human approval of spec');
}

/**
 * Handler for 'implementing' state.
 * Executes ImplementerAgent to modify code according to approved spec.
 * Includes retry logic: attempts up to 3 times on failure.
 * Steps: verify platform env → create branch → resolve deps → write code → tests → commit & push.
 * 
 * @param job - The job with approved spec
 * @throws Error after 3 failed retries
 * @example
 * await handleImplementing(job);
 * // Modifies files, runs tests, commits changes
 * // Transitions to 'reviewing' on success
 */
async function handleImplementing(job: CodeGenerationJob): Promise<void> {
  // If we got here from a retry after review failure
  // or from spec_approved, run the implementation
  const workspacePath = path.join(WORKSPACE_BASE, job.id);
  const context: AgentContext = {
    job,
    workspacePath,
  };

  const agents = getAgentsForPlatform(job.platform);
  const result = job.tddMode
    ? await agents.implementer.executeTDD(context)
    : await agents.implementer.execute(context);

  if (!result.success) {
    const errorCode = result.errorCode ?? 'UNKNOWN';
    const errorStatus = ERROR_STATUS[errorCode];
    const retryCount = job.progressLogs.filter(l => l.includes('Implementation retry')).length;

    const ctx: ErrorContext = {
      code: errorCode,
      stage: 'implementing',
      message: result.error ?? 'Unknown error',
      timestamp: new Date().toISOString(),
      retryCount,
    };
    await setErrorContext(job.id, ctx);

    // test_error and unknown/failed can retry up to 3 times automatically,
    // unless the job was created from the CLI, where the human closes the loop.
    if (supportsAutoRetry(job) && RETRYABLE_ERROR_STATUSES.has(errorStatus) && retryCount < 3) {
      await addProgressLog(job.id, `Implementation retry ${retryCount + 1}/3 [${errorCode}]`);
      await addProgressLog(job.id, `Error: ${result.error}`);
      // Closed-loop: surface the error to ImplementerAgent in the next iteration
      await updateJobStatus(job.id, 'implementing', { reviewFeedback: result.error ?? 'Implementation failed' });
      await orchestrateJob(job.id);
      return;
    }

    // Non-retryable or max retries reached → granular error state
    leaderError(`Implementation failed [${errorCode}]: ${result.error}`);
    await addProgressLog(job.id, `Failed [${errorCode}]: ${result.error}`);
    await updateJobStatus(job.id, errorStatus);
    printErrorBox(job, ctx);
    return;
  }

  leaderSuccess(`Implementation complete — ${result.changes?.length || 0} files modified, branch: ${R.cyan}${result.branchName || 'unknown'}${R.reset}`);
  if (result.changes && result.changes.length > 0) {
    leaderJSON('Files changed', result.changes.map(c => ({ file: c.path, op: c.operation })));
  }
  await addProgressLog(job.id, 'Implementation completed');
  await addProgressLog(job.id, `Files modified: ${result.changes?.length || 0}`);

  // Persist the branch name so the reviewer knows which branch to target for the PR
  if (result.branchName) {
    await updateJobStatus(job.id, 'reviewing', { branchName: result.branchName });
  } else {
    await updateJobStatus(job.id, 'reviewing');
  }
  await orchestrateJob(job.id);
}

/**
 * Handler for 'spec_approved' state.
 * Transitions to 'implementing' and delegates to handleImplementing.
 */
async function handleSpecApproved(job: CodeGenerationJob): Promise<void> {
  banner('Spec Approved — Starting Implementation', job.id, 'spec_approved');
  await updateJobStatus(job.id, 'implementing', { currentAgent: 'Implementer' });
  await addProgressLog(job.id, 'Starting implementation');

  // Delegate to handleImplementing
  await handleImplementing(job);
}

/**
 * Handler for 'reviewing' state.
 * Executes ReviewerAgent to validate implementation and create GitHub PR.
 * Validations: static analysis, platform tests, file count, traceability.
 * On failure: returns to 'implementing' for retry.
 * On success: creates PR, comments on Jira, transitions to 'pr_created'.
 * 
 * @param job - The job with implemented code
 * @example
 * await handleReviewing(job);
 * // Validates: tests pass, lint clean, files within limit
 * // Creates PR, transitions to 'pr_created'
 */
async function handleReviewing(job: CodeGenerationJob): Promise<void> {
  banner('Code Review & PR Creation', job.id, 'reviewing');
  await updateJobStatus(job.id, 'reviewing', { currentAgent: 'Reviewer', branchName: job.branchName });
  await addProgressLog(job.id, 'Reviewing implementation');

  const workspacePath = path.join(WORKSPACE_BASE, job.id);
  const context: AgentContext = {
    job,
    workspacePath,
  };

  const agents = getAgentsForPlatform(job.platform);
  const result = await agents.reviewer.execute(context);

  if (!result.success) {
    const errorCode = result.errorCode ?? 'UNKNOWN';
    const errorStatus = ERROR_STATUS[errorCode];
    const retryCount = job.progressLogs.filter(l => l.includes('Review retry')).length;

    const ctx: ErrorContext = {
      code: errorCode,
      stage: 'reviewing',
      message: result.error ?? 'Unknown review failure',
      timestamp: new Date().toISOString(),
      retryCount,
    };
    await setErrorContext(job.id, ctx);
    leaderError(`Review failed [${errorCode}]: ${result.error}`);
    await addProgressLog(job.id, `Review failed [${errorCode}]: ${result.error}`);

    const MAX_REVIEW_RETRIES = 5;
    if ((errorCode === 'REVIEW_ERROR' || errorCode === 'TEST_ERROR') && retryCount < MAX_REVIEW_RETRIES) {
      // Closed-loop: reviewer feedback is sent back to ImplementerAgent for retry
      await addProgressLog(job.id, `Review retry ${retryCount + 1}/${MAX_REVIEW_RETRIES} — returning to implementing with feedback`);
      await updateJobStatus(job.id, 'implementing', { reviewFeedback: result.error });
      await orchestrateJob(job.id);
      return;
    }

    // Other failures or max retries — set granular error state
    await updateJobStatus(job.id, errorStatus);
    printErrorBox(job, ctx);
    return;
  }

  leaderSuccess(`Review passed`);
  leaderJSON('Pull Request', { url: result.prUrl, id: result.prId, branch: result.branchName });
  await addProgressLog(job.id, 'Review passed');
  await addProgressLog(job.id, `PR created: ${result.prUrl}`);

  await updateJobStatus(job.id, 'pr_created', {
    prUrl: result.prUrl,
    prId: result.prId,
    branchName: result.branchName,
  });

  // Run mutation tester before marking done
  const workspacePathM = path.join(WORKSPACE_BASE, job.id);
  const mutCtx: AgentContext = { job, workspacePath: workspacePathM };
  leaderLog('Running mutation tester...');
  const mutResult = await agents.mutationTester.execute(mutCtx);
  if (!mutResult.success) {
    const mutRetryCount = job.progressLogs.filter(l => l.includes('Mutation retry')).length;
    const MAX_MUTATION_RETRIES = 2;
    if (mutResult.errorCode === 'TEST_ERROR' && mutRetryCount < MAX_MUTATION_RETRIES) {
      leaderWarn(`Mutation score below threshold — retrying implementation with feedback`);
      await addProgressLog(job.id, `Mutation retry ${mutRetryCount + 1}/${MAX_MUTATION_RETRIES} — returning to implementing with feedback`);
      await updateJobStatus(job.id, 'implementing', { reviewFeedback: mutResult.error });
      await orchestrateJob(job.id);
      return;
    }
    leaderWarn(`Mutation score below threshold: ${mutResult.error}`);
    await addProgressLog(job.id, `Mutation test: ${mutResult.error ?? 'score below threshold'}`);
  } else {
    leaderSuccess(`Mutation test passed: ${mutResult.output}`);
    await addProgressLog(job.id, `Mutation test: ${mutResult.output}`);
  }

  // Reload job so handlePRCreated has up-to-date prUrl/branchName
  const updatedJob = await getJob(job.id);
  await handlePRCreated(updatedJob ?? job);
}

/**
 * Handler for 'pr_created' state.
 * Finalizes job, prints detailed demo summary, marks as done.
 */
async function handlePRCreated(job: CodeGenerationJob, notifier?: JobNotifier): Promise<void> {
  if (job.jiraTicketId) {
    leaderLog(`Jira ticket ${R.cyan}${job.jiraTicketId}${R.reset} updated with PR link`);
    await addProgressLog(job.id, `Updated Jira ticket ${job.jiraTicketId} with PR link`);
  }

  await updateJobStatus(job.id, 'done');
  await addProgressLog(job.id, 'Job completed successfully');

  if (notifier) {
    await notifier.notify({
      jobId:     job.id,
      event:     'job.done',
      status:    'done',
      title:     job.title,
      platform:  job.platform,
      timestamp: new Date().toISOString(),
      tddMode:   job.tddMode,
      prUrl:     job.prUrl,
    }).catch(() => {});
  }

  // ── Box summary ───────────────────────────────────────────────────
  // Use terminal width when available, but keep the box within sane bounds.
  const W   = Math.min(110, Math.max(70, process.stdout.columns - 4)); // inner width
  const B   = R.green;                              // box color
  const RST = R.reset;

  // Box-drawing helpers
  const top    = `${B}╔${'═'.repeat(W)}╗${RST}`;
  const bot    = `${B}╚${'═'.repeat(W)}╝${RST}`;
  const sep    = `${B}╠${'═'.repeat(W)}╣${RST}`;
  const blank  = `${B}║${' '.repeat(W)}║${RST}`;
  const divRow = `${B}║  ${R.gray}${'─'.repeat(W - 4)}${RST}  ${B}║${RST}`;

  /** Print a line that fills exactly W inner chars */
  const ln = (content: string) => {
    const visible = stripAnsi(content).length;
    const pad = Math.max(0, W - 2 - visible);
    console.log(`${B}║${RST} ${content}${' '.repeat(pad)} ${B}║${RST}`);
  };

  /** Truncate plain text to fit, keeping room for label and borders */
  const trunc = (text: string, maxLen: number) =>
    text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;

  /** Section header inside the box */
  const section = (title: string) => {
    console.log(sep);
    ln(`${R.bold}${R.white}${title}${RST}`);
    console.log(divRow);
  };

  /** Key-value row — value is truncated to fit in the box */
  const kv = (label: string, value: string, color: string = '') => {
    const labelW   = 16;
    const maxVal   = W - 2 - labelW - 1;        // remaining visible space
    const plainVal = stripAnsi(value);
    const safeVal  = trunc(plainVal, maxVal);
    // Re-wrap with the original color if plain text was used
    const displayVal = color ? `${color}${safeVal}${RST}` : safeVal;
    ln(`${R.gray}${label.padEnd(labelW)}${RST}${displayVal}`);
  };

  const durationMs  = new Date().getTime() - new Date(job.createdAt).getTime();
  const durationSec = (durationMs / 1000).toFixed(1);

  const platformLabel: Record<string, string> = {
    flutter:     'Flutter',
    flutter_web: 'Flutter Web',
    ios:         'iOS',
    android:     'Android',
  };

  // ── Header ──
  console.log(`\n${top}`);
  console.log(blank);
  ln(`${R.bold}${R.green}✅  GAIA — JOB COMPLETED SUCCESSFULLY${RST}`);
  ln(`${R.gray}${new Date().toLocaleString('en-GB')}  ·  ${durationSec}s total${RST}`);
  console.log(blank);

  // ── Job details ──
  section('JOB DETAILS');
  kv('Ticket',      job.jiraTicketId || 'N/A',                          R.cyan);
  kv('Title',       job.title,                                           R.white);
  kv('Platform',    platformLabel[job.platform] ?? job.platform,         R.cyan);
  kv('Repository',  job.repo,                                            R.blue);
  kv('Branch',      job.branchName || 'N/A',                             R.yellow);
  kv('Base branch', job.targetBranch,                                    R.gray);
  console.log(blank);

  // ── Acceptance criteria ──
  if (job.acceptanceCriteria?.length) {
    section(`ACCEPTANCE CRITERIA  (${job.acceptanceCriteria.length})`);
    job.acceptanceCriteria.forEach(ac => {
      ln(`${R.green}✔${RST}  ${R.gray}[${ac.id}]${RST} ${ac.text}`);
    });
    console.log(blank);
  }

  // ── Gherkin scenarios ──
  if (job.spec?.gherkinScenarios) {
    const scenarioCount = (job.spec.gherkinScenarios.match(/^\s*Scenario:/gm) || []).length;
    section(`GHERKIN SCENARIOS  (${scenarioCount})`);
    ln(`${R.cyan}scenarios.feature${RST}  ${R.gray}— ${scenarioCount} scenario${scenarioCount !== 1 ? 's' : ''} generated${RST}`);
    console.log(blank);
  }

  // ── Implemented tasks ──
  if (job.spec?.tasks?.length) {
    section(`IMPLEMENTED TASKS  (${job.spec.tasks.length})`);
    job.spec.tasks.forEach(t => {
      const icon =
        t.type === 'create'   ? `${R.green}+${RST}` :
        t.type === 'test'     ? `${R.blue}T${RST}`  :
        t.type === 'refactor' ? `${R.cyan}↺${RST}`  : `${R.yellow}~${RST}`;
      ln(`${icon}  ${R.gray}[${t.type.padEnd(7)}]${RST}  ${t.filePath || t.description}`);
    });
    console.log(blank);
  }

  // ── Files changed / Test results ──
  // (detail available in progress logs — see GET /jobs/:id)

  // ── Pull Request ──
  section('PULL REQUEST');
  ln(`${R.bold}${R.green}${job.prUrl || 'N/A'}${RST}`);
  console.log(blank);

  console.log(`${bot}\n`);
}

/** Strip ANSI escape codes for length calculation */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Print a color-coded error summary box when a job enters a granular error state.
 */
function printErrorBox(job: CodeGenerationJob, ctx: ErrorContext): void {
  const W   = Math.min(110, Math.max(70, process.stdout.columns - 4));
  const B   = R.red;
  const RST = R.reset;

  const top   = `${B}╔${'═'.repeat(W)}╗${RST}`;
  const bot   = `${B}╚${'═'.repeat(W)}╝${RST}`;
  const sep   = `${B}╠${'═'.repeat(W)}╣${RST}`;
  const blank = `${B}║${' '.repeat(W)}║${RST}`;

  const ln = (content: string) => {
    const visible = stripAnsi(content).length;
    const pad = Math.max(0, W - 2 - visible);
    console.log(`${B}║${RST} ${content}${' '.repeat(pad)} ${B}║${RST}`);
  };

  const ERROR_LABEL: Record<ErrorCode, string> = {
    ENV_ERROR:    '⚙  ENV ERROR    — Platform toolchain not installed',
    REPO_ERROR:   '🔒  REPO ERROR   — Repository access / permissions failed',
    BUILD_ERROR:  '📦  BUILD ERROR  — Dependency resolution failed',
    TEST_ERROR:   '🧪  TEST ERROR   — Tests or lint failed',
    REVIEW_ERROR: '🔍  REVIEW ERROR — Reviewer validation failed',
    SPEC_ERROR:   '📝  SPEC ERROR   — Spec generation failed',
    UNKNOWN:      '❓  UNKNOWN ERROR',
  };

  const NEXT_STEP: Record<ErrorCode, string> = {
    ENV_ERROR:    'Install/configure the platform toolchain, then retry (POST /jobs/:id/retry  |  --id <id>)',
    REPO_ERROR:   'Check GITHUB_TOKEN, repo name, branch permissions, then retry (POST /jobs/:id/retry  |  --id <id>)',
    BUILD_ERROR:  'Fix pubspec.yaml / build.gradle / Package.swift, then retry (POST /jobs/:id/retry  |  --id <id>)',
    TEST_ERROR:   'Tests retried automatically (up to 3x). If still failing: POST /jobs/:id/retry  |  --id <id>',
    REVIEW_ERROR: 'Check PR constraints (maxFilesToTouch, spec presence), then retry (POST /jobs/:id/retry  |  --id <id>)',
    SPEC_ERROR:   'Check LLM API keys and acceptance criteria, then retry (POST /jobs/:id/retry  |  --id <id>)',
    UNKNOWN:      'Check server logs, then retry (POST /jobs/:id/retry  |  --id <id>)',
  };

  console.log(`\n${top}`);
  console.log(blank);
  ln(`${R.bold}${R.red}✖  GAIA — JOB FAILED${RST}`);
  ln(`${R.gray}${new Date().toLocaleString('en-GB')}${RST}`);
  console.log(blank);
  console.log(sep);
  ln(`${R.bold}${R.white}ERROR DETAILS${RST}`);
  ln(`${R.gray}${'─'.repeat(W - 4)}${RST}`);
  ln(`${R.bold}${R.red}${ERROR_LABEL[ctx.code]}${RST}`);
  ln(`${R.gray}Stage:${RST}   ${ctx.stage}`);
  ln(`${R.gray}Message:${RST} ${ctx.message.slice(0, W - 12)}`);
  if (ctx.retryCount > 0) ln(`${R.gray}Retries:${RST} ${ctx.retryCount}`);
  console.log(blank);
  console.log(sep);
  ln(`${R.bold}${R.white}JOB${RST}`);
  ln(`${R.gray}${'─'.repeat(W - 4)}${RST}`);
  ln(`${R.gray}ID:${RST}       ${job.id}`);
  ln(`${R.gray}Title:${RST}    ${job.title.slice(0, W - 12)}`);
  ln(`${R.gray}Platform:${RST} ${job.platform}`);
  ln(`${R.gray}Repo:${RST}     ${job.repo}`);
  console.log(blank);
  console.log(sep);
  ln(`${R.bold}${R.white}NEXT STEP${RST}`);
  ln(`${R.gray}${'─'.repeat(W - 4)}${RST}`);
  const nextLines = NEXT_STEP[ctx.code].match(/.{1,62}/g) ?? [];
  nextLines.forEach(l => ln(`${R.yellow}${l}${RST}`));
  console.log(blank);
  console.log(`${bot}\n`);
}
