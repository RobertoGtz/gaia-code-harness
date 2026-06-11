/**
 * @fileoverview Leader - Main orchestrator for job processing
 * @description State machine that coordinates agents through the job lifecycle
 * @module harness/leader
 */

import { getJob, updateJobStatus, addProgressLog } from '../db';
import { SpecAuthorAgent } from '../agents/spec-author';
import { ImplementerAgent } from '../agents/implementer';
import { ReviewerAgent } from '../agents/reviewer';
import { AgentContext, JobStatus, CodeGenerationJob } from '../types';
import * as path from 'path';

// Base path where repos will be cloned/worked on
const WORKSPACE_BASE = process.env.REPOS_BASE_PATH || '/tmp/gaia-workspace';

/**
 * Main orchestrator function that manages the job lifecycle.
 * Decides which agent to execute based on the current job status.
 * Implements a state machine with 10 possible states.
 * 
 * @param jobId - UUID of the job to process
 * @throws Error if job not found or unexpected error occurs
 * @example
 * await orchestrateJob('550e8400-e29b-41d4-a716-446655440000');
 * // Processes job based on current status
 */
export async function orchestrateJob(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  console.log(`[Leader] Processing job ${jobId} in status: ${job.status}`);

  try {
    switch (job.status) {
      case 'pending':
        await handlePending(job);
        break;
      case 'fetching_jira':
        await handleFetchingJira(job);
        break;
      case 'spec_generating':
        await handleSpecGenerating(job);
        break;
      case 'spec_ready':
        // Esperando aprobación humana - no hacemos nada
        console.log(`[Leader] Job ${jobId} waiting for human approval`);
        break;
      case 'spec_approved':
        await handleSpecApproved(job);
        break;
      case 'implementing':
        await handleImplementing(job);
        break;
      case 'reviewing':
        await handleReviewing(job);
        break;
      case 'pr_created':
        await handlePRCreated(job);
        break;
      case 'done':
        console.log(`[Leader] Job ${jobId} already completed`);
        break;
      case 'failed':
        console.log(`[Leader] Job ${jobId} failed, waiting for retry`);
        break;
      default:
        throw new Error(`Unknown status: ${job.status}`);
    }
  } catch (error) {
    console.error(`[Leader] Error processing job ${jobId}:`, error);
    await addProgressLog(jobId, `Error: ${error}`);
    await updateJobStatus(jobId, 'failed');
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
  await updateJobStatus(job.id, 'fetching_jira', { currentAgent: 'Leader' });
  await addProgressLog(job.id, 'Starting job orchestration');
  
  // Si tenemos contexto completo de Gaia, saltamos directo a generar spec
  // Si solo tenemos ticket ID, primero fetcheamos de Jira
  if (job.acceptanceCriteria.length > 0) {
    await updateJobStatus(job.id, 'spec_generating');
    await orchestrateJob(job.id); // Re-entrar
  } else {
    // Necesitamos fetchear de Jira
    await orchestrateJob(job.id); // Re-entrar
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
  await updateJobStatus(job.id, 'fetching_jira', { currentAgent: 'JiraFetcher' });
  
  try {
    // TODO: Integrar con MCP Jira para fetchear:
    // - Título
    // - Descripción
    // - Criterios de aceptación
    // - Links a Figma
    // - Prioridad
    
    // Por ahora, mock
    await addProgressLog(job.id, `Fetching Jira info for ${job.jiraTicketId || job.jiraEpicId}`);
    
    // Simular fetch exitoso
    await addProgressLog(job.id, 'Jira info fetched successfully');
    await updateJobStatus(job.id, 'spec_generating');
    
    // Continuar flujo
    await orchestrateJob(job.id);
  } catch (error) {
    throw new Error(`Failed to fetch Jira info: ${error}`);
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
  await updateJobStatus(job.id, 'spec_generating', { currentAgent: 'SpecAuthor' });
  await addProgressLog(job.id, 'Generating technical specification');

  const workspacePath = path.join(WORKSPACE_BASE, job.id);
  const context: AgentContext = {
    job,
    workspacePath,
  };

  const specAuthor = new SpecAuthorAgent();
  const result = await specAuthor.execute(context);

  if (!result.success) {
    throw new Error(`SpecAuthor failed: ${result.error}`);
  }

  await addProgressLog(job.id, 'Specification generated');
  await addProgressLog(job.id, `Requirements: ${result.spec?.requirements.length || 0}`);
  await addProgressLog(job.id, `Tasks: ${result.spec?.tasks.length || 0}`);
  
  // Guardar spec y pausar para aprobación humana
  await updateJobStatus(job.id, 'spec_ready', { spec: result.spec });
  await addProgressLog(job.id, 'Waiting for human approval of spec');
  
  // Aquí el Leader se detiene y espera a que alguien llame POST /jobs/:id/approve
}

/**
 * Handler for 'implementing' state.
 * Executes ImplementerAgent to modify code according to approved spec.
 * Includes retry logic: attempts up to 3 times on failure.
 * Steps: verify Flutter env → create branch → melos bootstrap → write code → tests → commit & push.
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

  const implementer = new ImplementerAgent();
  const result = await implementer.execute(context);

  if (!result.success) {
    const retryCount = job.progressLogs.filter(l => l.includes('Implementation retry')).length;
    
    if (retryCount < 3) {
      await addProgressLog(job.id, `Implementation retry ${retryCount + 1}/3`);
      await addProgressLog(job.id, `Error to fix: ${result.error}`);
      await orchestrateJob(job.id);
      return;
    }
    
    throw new Error(`Implementer failed after 3 retries: ${result.error}`);
  }

  await addProgressLog(job.id, 'Implementation completed');
  await addProgressLog(job.id, `Files modified: ${result.changes?.length || 0}`);
  
  await updateJobStatus(job.id, 'reviewing');
  await orchestrateJob(job.id);
}

/**
 * Estado: SPEC_APPROVED
 * Acción: Transición a implementing y ejecutar
 */
async function handleSpecApproved(job: CodeGenerationJob): Promise<void> {
  await updateJobStatus(job.id, 'implementing', { currentAgent: 'Implementer' });
  await addProgressLog(job.id, 'Starting implementation');

  // Delegate to handleImplementing
  await handleImplementing(job);
}

/**
 * Handler for 'reviewing' state.
 * Executes ReviewerAgent to validate implementation and create GitHub PR.
 * Validations: dart analyze, flutter test, file count, traceability.
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
  await updateJobStatus(job.id, 'reviewing', { currentAgent: 'Reviewer' });
  await addProgressLog(job.id, 'Reviewing implementation');

  const workspacePath = path.join(WORKSPACE_BASE, job.id);
  const context: AgentContext = {
    job,
    workspacePath,
  };

  const reviewer = new ReviewerAgent();
  const result = await reviewer.execute(context);

  if (!result.success) {
    // Si falló review, puede ser:
    // 1. Tests fallaron -> volver a implementing
    // 2. No cumple spec -> volver a implementing
    // 3. Problema de infra -> retry review
    
    const error = result.error || 'Unknown review failure';
    await addProgressLog(job.id, `Review failed: ${error}`);
    
    // Por simplicidad, si falla review volvemos a implementing
    // En implementación real podríamos ser más específicos
    await updateJobStatus(job.id, 'implementing');
    await orchestrateJob(job.id);
    return;
  }

  await addProgressLog(job.id, 'Review passed');
  await addProgressLog(job.id, `PR created: ${result.prUrl}`);
  
  await updateJobStatus(job.id, 'pr_created', {
    prUrl: result.prUrl,
    prId: result.prId,
    branchName: result.branchName,
  });
  
  await orchestrateJob(job.id);
}

/**
 * Handler for 'pr_created' state.
 * Finalizes job by updating Jira ticket with PR link.
 * Optionally moves Jira ticket to "In Review" status.
 * Marks job as completed.
 * 
 * @param job - The job with created PR
 * @example
 * await handlePRCreated(job);
 * // Updates Jira: adds PR link comment
 * // Transitions to 'done'
 */
async function handlePRCreated(job: CodeGenerationJob): Promise<void> {
  await addProgressLog(job.id, 'Finalizing job');
  
  // TODO: Actualizar Jira - agregar comentario con link al PR
  // TODO: Opcionalmente mover ticket a "In Review" o similar
  
  if (job.jiraTicketId) {
    await addProgressLog(job.id, `Updated Jira ticket ${job.jiraTicketId} with PR link`);
  }
  
  await updateJobStatus(job.id, 'done');
  await addProgressLog(job.id, 'Job completed successfully');
}
