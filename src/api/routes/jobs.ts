/**
 * @fileoverview Job Management API Routes
 * @description REST endpoints for job lifecycle management
 * @module api/routes/jobs
 */

import { FastifyInstance } from 'fastify';
import { createJob, getJob, updateJobStatus, addProgressLog, listJobs } from '../../state';
import { orchestrateJob } from '../../harness/leader';
import { CreateJobRequest, ApproveSpecRequest, CodeGenerationJob, JobStatus } from '../../types';
import { fetchJiraTicket, JiraError, JiraConfigError, JiraAuthError, JiraNotFoundError } from '../../tools/jira';

const ERROR_STATUSES = new Set<JobStatus>([
  'failed', 'env_error', 'repo_error', 'build_error',
  'test_error', 'review_error', 'spec_error',
]);

/**
 * Configure job management routes on the Fastify instance.
 * Sets up 6 endpoints: GET /jobs, GET /jobs/:id, POST /jobs, POST /approve, POST /retry
 * 
 * @param app - Fastify server instance
 * @example
 * await setupJobRoutes(fastifyApp);
 * // All job routes now available
 */
export async function setupJobRoutes(app: FastifyInstance) {
  /**
   * GET /jobs
   * List all code generation jobs, optionally filtered by initiative.
   * Returns jobs ordered by creation date (newest first).
   * 
   * Query Parameters:
   * - initiativeId (optional): Filter jobs by initiative ID
   * 
   * Response: { jobs: CodeGenerationJob[] }
   */
  app.get('/jobs', async (request, reply) => {
    const { initiativeId } = request.query as { initiativeId?: string };
    const jobs = await listJobs(initiativeId);
    return { jobs };
  });

  /**
   * GET /jobs/:id
   * Get detailed information about a specific job.
   * Includes full job data: requirements, spec, progress logs, PR URL.
   * 
   * Path Parameters:
   * - id: Job UUID
   * 
   * Response: { job: CodeGenerationJob }
   * Errors: 404 if job not found
   */
  app.get('/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await getJob(id);
    
    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }
    
    return { job };
  });

  /**
   * POST /jobs
   * Create a new code generation job.
   * Accepts either full context from Gaia or just a Jira ticket ID.
   * Automatically starts orchestration in background.
   * 
   * Request Body (Option A — flat body, preferred):
   * {
   *   "title": "Feature name",          // required
   *   "platform": "flutter",            // required
   *   "repo": "mi-org/mi-repo",         // required
   *   "targetBranch": "develop",        // optional, default "develop"
   *   "description": "...",             // optional
   *   "module": "home",                 // optional
   *   "figmaUrl": "https://...",        // optional
   *   "jiraTicketId": "PROJ-123",       // optional
   *   "jiraEpicId": "EPIC-42",          // optional
   *   "tddMode": false,                 // optional, default false
   *   "requireTests": true,             // optional, default true
   *   "maxFilesToTouch": 5,             // optional, default 5
   *   "acceptanceCriteria": ["WHEN x THEN y"]  // optional
   * }
   *
   * Request Body (Option B — Jira ticket only):
   * { "jiraTicketId": "PROJ-123" }
   *
   * Request Body (Option C — fullContext wrapper, legacy):
   * { "fullContext": { "title": "...", "platform": "flutter", ... } }
   *
   * Response: 201 Created { job: CodeGenerationJob }
   * Errors: 400 if insufficient context, 500 on server error
   */
  app.post('/jobs', async (request, reply) => {
    const body = request.body as CreateJobRequest;
    
    // Validate that enough context is present
    const hasJira = body.jiraTicketId || body.jiraEpicId;
    const hasFlat = body.platform && body.title;
    const hasLegacy = body.fullContext;
    if (!hasJira && !hasFlat && !hasLegacy) {
      return reply.status(400).send({
        error: 'Must provide: (title + platform) for flat body, jiraTicketId for Jira, or fullContext for legacy wrapper',
      });
    }
    
    try {
      // Build jobData based on the received body format
      let jobData: Omit<CodeGenerationJob, 'id' | 'status' | 'progressLogs' | 'createdAt' | 'updatedAt'>;
      
        if (body.fullContext) {
        // Full context via fullContext wrapper (legacy format)
        jobData = {
          jiraTicketId: body.jiraTicketId,
          jiraEpicId: body.jiraEpicId,
          initiativeId: `init-${Date.now()}`,
          title: body.fullContext.title,
          platform: body.fullContext.platform,
          repo: body.fullContext.repo,
          module: body.fullContext.module,
          targetBranch: body.fullContext.targetBranch || 'develop',
          description: body.fullContext.description,
          acceptanceCriteria: body.fullContext.acceptanceCriteria.map((text, i) => ({
            id: `ac-${i}`,
            text,
            testable: true,
          })),
          figmaUrl: body.fullContext.figmaUrl,
          maxFilesToTouch: body.fullContext.maxFilesToTouch ?? 5,
          requireTests: body.fullContext.requireTests ?? true,
          tddMode: body.tddMode ?? false,
          buildStrategy: body.fullContext.buildStrategy,
          requestSource: 'api',
        };
      } else if (body.platform && body.title) {
        // Flat body — platform/title/repo/acceptanceCriteria directly
        const rawAC = body.acceptanceCriteria ?? [];
        jobData = {
          jiraTicketId: body.jiraTicketId,
          jiraEpicId: body.jiraEpicId,
          initiativeId: `init-${Date.now()}`,
          title: body.title,
          platform: body.platform,
          repo: body.repo || '',
          module: body.module,
          targetBranch: body.targetBranch || 'develop',
          description: body.description,
          acceptanceCriteria: rawAC.map((ac, i) => ({
            id: typeof ac === 'string' ? `ac-${i}` : (ac.id ?? `ac-${i}`),
            text: typeof ac === 'string' ? ac : ac.text,
            testable: true,
          })),
          figmaUrl: body.figmaUrl,
          maxFilesToTouch: body.maxFilesToTouch ?? 5,
          requireTests: body.requireTests ?? true,
          tddMode: body.tddMode ?? false,
          buildStrategy: body.buildStrategy,
          requestSource: 'api',
        };
      } else {
        // Jira-only — fetch full data from ticket
        const ticketKey = body.jiraTicketId || body.jiraEpicId!;
        const ticket = await fetchJiraTicket(ticketKey);

        if (!ticket.platform) {
          return reply.status(400).send({
            error: `Could not infer platform from Jira ticket ${ticketKey}. Add a platform label (flutter, ios, android) or use fullContext.`,
          });
        }

        jobData = {
          jiraTicketId: body.jiraTicketId,
          jiraEpicId: body.jiraEpicId ?? ticket.epicKey,
          initiativeId: `init-${Date.now()}`,
          title: ticket.title,
          platform: ticket.platform,
          repo: ticket.repo || process.env.DEFAULT_REPO || '',
          targetBranch: ticket.targetBranch || 'develop',
          description: ticket.description,
          acceptanceCriteria: ticket.acceptanceCriteria.map((text, i) => ({
            id: `ac-${i}`,
            text,
            testable: true,
          })),
          figmaUrl: ticket.figmaUrl,
          maxFilesToTouch: body.maxFilesToTouch ?? 5,
          requireTests: body.requireTests ?? true,
          requestSource: 'api',
        };
      }
      
      const job = await createJob(jobData);
      
      // Start orchestration asynchronously — respond immediately without waiting
      orchestrateJob(job.id).catch(console.error);
      
      return reply.status(201).send({ job });
    } catch (error) {
      console.error(`\x1b[31m✖ [HTTP] Error creating job:\x1b[0m`, error);
      if (error instanceof JiraConfigError) {
        return reply.status(400).send({ error: error.message, hint: 'Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN' });
      }
      if (error instanceof JiraAuthError) {
        return reply.status(401).send({ error: error.message, hint: 'Check JIRA_EMAIL and JIRA_API_TOKEN' });
      }
      if (error instanceof JiraNotFoundError) {
        return reply.status(404).send({ error: error.message });
      }
      if (error instanceof JiraError) {
        return reply.status(502).send({ error: error.message, status: error.status });
      }
      return reply.status(500).send({ error: error instanceof Error ? error.message : 'Failed to create job' });
    }
  });

  /**
   * POST /jobs/:id/approve
   * Approve or reject the generated technical specification.
   * Human-in-the-loop checkpoint before code generation.
   * 
   * Path Parameters:
   * - id: Job UUID
   * 
   * Request Body:
   * {
   *   "approved": true,
   *   "feedback": "Optional feedback if rejected"
   * }
   * 
   * Approval: Transitions to 'spec_approved' and continues implementation
   * Rejection: Returns to 'pending' for spec regeneration
   * 
   * Response: { job: CodeGenerationJob }
   * Errors: 404 if job not found, 400 if job not in 'spec_ready' status
   */
  app.post('/jobs/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || { approved: true }) as ApproveSpecRequest;
    
    const job = await getJob(id);
    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }
    
    if (job.status !== 'spec_ready') {
      return reply.status(400).send({
        error: `Cannot approve spec. Current status: ${job.status}`,
      });
    }
    
    if (body.approved === false) {
      await updateJobStatus(id, 'pending', { currentAgent: undefined });
      await addProgressLog(id, `Spec rejected by human: ${body.feedback || 'No feedback provided'}`);
      return { job: await getJob(id) };
    }
    
    await updateJobStatus(id, 'spec_approved');
    await addProgressLog(id, 'Spec approved by human');
    
    // Resume orchestration
    orchestrateJob(id).catch(console.error);
    
    return { job: await getJob(id) };
  });

  /**
   * POST /jobs/:id/retry
   * Retry a failed job from the beginning.
   * Resets status to 'pending' and restarts orchestration.
   * Works for jobs in any error state: failed, env_error, repo_error,
   * build_error, test_error, review_error, spec_error.
   * 
   * Path Parameters:
   * - id: Job UUID
   * 
   * Response: { job: CodeGenerationJob }
   * Errors: 404 if job not found, 400 if job not in an error state
   */
  app.post('/jobs/:id/retry', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await getJob(id);
    
    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }
    
    if (!ERROR_STATUSES.has(job.status)) {
      return reply.status(400).send({
        error: `Cannot retry job in status '${job.status}'. Only error states can be retried.`,
        retryableStatuses: [...ERROR_STATUSES],
      });
    }
    
    await updateJobStatus(id, 'pending', { currentAgent: undefined });
    await addProgressLog(id, `Job retried by user (was: ${job.status})`);
    
    orchestrateJob(id).catch(console.error);
    
    return { job: await getJob(id) };
  });
}
