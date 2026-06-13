/**
 * @fileoverview Job Management API Routes
 * @description REST endpoints for job lifecycle management
 * @module api/routes/jobs
 */

import { FastifyInstance } from 'fastify';
import { createJob, getJob, updateJobStatus, addProgressLog, listJobs } from '../../db';
import { orchestrateJob } from '../../harness/leader';
import { CreateJobRequest, ApproveSpecRequest, CodeGenerationJob } from '../../types';

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
   * Request Body (Option A - Full Context):
   * {
   *   "fullContext": {
   *     "title": "Feature name",
   *     "acceptanceCriteria": ["WHEN x THEN y"],
   *     "platform": "flutter",
   *     "repo": "repo-name",
   *     "module": "optional-module"
   *   }
   * }
   * 
   * Request Body (Option B - Jira Only):
   * {
   *   "jiraTicketId": "PROJ-123"
   * }
   * 
   * Response: 201 Created { job: CodeGenerationJob }
   * Errors: 400 if insufficient context, 500 on server error
   */
  app.post('/jobs', async (request, reply) => {
    const body = request.body as CreateJobRequest;
    
    // Validar que tengamos suficiente contexto
    if (!body.jiraTicketId && !body.jiraEpicId && !body.fullContext) {
      return reply.status(400).send({
        error: 'Must provide jiraTicketId, jiraEpicId, or fullContext',
      });
    }
    
    try {
      // Si viene de Jira, necesitamos fetchear info (mock por ahora)
      let jobData: Omit<CodeGenerationJob, 'id' | 'status' | 'progressLogs' | 'createdAt' | 'updatedAt'>;
      
        if (body.fullContext) {
        // Contexto completo via fullContext wrapper
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
          maxFilesToTouch: 5,
          requireTests: true,
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
          repo: body.repo || 'demo-repo',
          module: body.module,
          targetBranch: body.targetBranch || 'main',
          description: body.description,
          acceptanceCriteria: rawAC.map((ac, i) => ({
            id: typeof ac === 'string' ? `ac-${i}` : (ac.id ?? `ac-${i}`),
            text: typeof ac === 'string' ? ac : ac.text,
            testable: true,
          })),
          figmaUrl: body.figmaUrl,
          maxFilesToTouch: 5,
          requireTests: true,
        };
      } else {
        // Solo ticket ID - necesitamos fetchear de Jira
        jobData = {
          jiraTicketId: body.jiraTicketId,
          jiraEpicId: body.jiraEpicId,
          initiativeId: `init-${Date.now()}`,
          title: `Ticket ${body.jiraTicketId || body.jiraEpicId}`,
          platform: 'flutter',
          repo: 'rpp-pyme-multiplatform',
          targetBranch: 'develop',
          acceptanceCriteria: [],
          maxFilesToTouch: 5,
          requireTests: true,
        };
      }
      
      const job = await createJob(jobData);
      
      // Iniciar orchestración asíncrona
      // No esperamos a que termine, respondemos inmediatamente
      orchestrateJob(job.id).catch(console.error);
      
      return reply.status(201).send({ job });
    } catch (error) {
      console.error(`\x1b[31m✖ [HTTP] Error creating job:\x1b[0m`, error);
      return reply.status(500).send({ error: 'Failed to create job' });
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
    
    // Continuar orchestración
    orchestrateJob(id).catch(console.error);
    
    return { job: await getJob(id) };
  });

  /**
   * POST /jobs/:id/retry
   * Retry a failed job from the beginning.
   * Resets status to 'pending' and restarts orchestration.
   * Only works for jobs in 'failed' status.
   * 
   * Path Parameters:
   * - id: Job UUID
   * 
   * Response: { job: CodeGenerationJob }
   * Errors: 404 if job not found, 400 if job not in 'failed' status
   */
  app.post('/jobs/:id/retry', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await getJob(id);
    
    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }
    
    if (job.status !== 'failed') {
      return reply.status(400).send({ error: 'Can only retry failed jobs' });
    }
    
    await updateJobStatus(id, 'pending', { currentAgent: undefined });
    await addProgressLog(id, 'Job retried by user');
    
    orchestrateJob(id).catch(console.error);
    
    return { job: await getJob(id) };
  });
}
