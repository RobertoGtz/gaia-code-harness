/**
 * @fileoverview Database module for Gaia Code Harness
 * @description PostgreSQL connection and CRUD operations for code generation jobs
 * @module db
 */

import { Pool } from 'pg';
import { CodeGenerationJob, ErrorContext, JobStatus } from '../types';

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/gaia_harness',
});

/**
 * Initialize database schema.
 * Creates the code_generation_jobs table with all required fields and indexes.
 * Safe to call multiple times - uses IF NOT EXISTS.
 * 
 * @example
 * await initDatabase();
 * // Database initialized
 */
export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS code_generation_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        jira_ticket_id TEXT,
        jira_epic_id TEXT,
        initiative_id TEXT NOT NULL,
        title TEXT NOT NULL,
        platform TEXT NOT NULL,
        repo TEXT NOT NULL,
        module TEXT,
        target_branch TEXT NOT NULL,
        description TEXT,
        acceptance_criteria JSONB NOT NULL DEFAULT '[]',
        figma_url TEXT,
        technical_constraints JSONB DEFAULT '[]',
        max_files_to_touch INTEGER DEFAULT 5,
        require_tests BOOLEAN DEFAULT true,
        
        status TEXT NOT NULL DEFAULT 'pending',
        current_agent TEXT,
        progress_logs JSONB NOT NULL DEFAULT '[]',
        
        spec JSONB,
        branch_name TEXT,
        pr_url TEXT,
        pr_id TEXT,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        error_context JSONB
      );

      ALTER TABLE code_generation_jobs
        ADD COLUMN IF NOT EXISTS error_context JSONB;
      ALTER TABLE code_generation_jobs
        ADD COLUMN IF NOT EXISTS tdd_mode BOOLEAN DEFAULT false;
      ALTER TABLE code_generation_jobs
        ADD COLUMN IF NOT EXISTS build_strategy VARCHAR(16);
      ALTER TABLE code_generation_jobs
        ADD COLUMN IF NOT EXISTS review_feedback TEXT;
      ALTER TABLE code_generation_jobs
        ADD COLUMN IF NOT EXISTS request_source VARCHAR(16);
      
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON code_generation_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_initiative ON code_generation_jobs(initiative_id);
    `);
    console.log('Database initialized');
  } finally {
    client.release();
  }
}

/**
 * Create a new code generation job in the database.
 * Generates UUID automatically and sets initial status to 'pending'.
 * 
 * @param jobData - Job data excluding auto-generated fields (id, status, logs, timestamps)
 * @returns Promise resolving to the created job with generated fields populated
 * @example
 * const job = await createJob({
 *   title: 'Add banner',
 *   platform: 'flutter',
 *   repo: 'mi-org/mi-repo',
 *   acceptanceCriteria: [...],
 *   maxFilesToTouch: 5,
 *   requireTests: true,
 *   initiativeId: 'init-123',
 *   targetBranch: 'develop'
 * });
 * // job.id, job.status, job.createdAt are auto-populated
 */
export async function createJob(
  jobData: Omit<CodeGenerationJob, 'id' | 'status' | 'progressLogs' | 'createdAt' | 'updatedAt'>
): Promise<CodeGenerationJob> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO code_generation_jobs (
        jira_ticket_id, jira_epic_id, initiative_id, title, platform, repo, module,
        target_branch, description, acceptance_criteria, figma_url,
        technical_constraints, max_files_to_touch, require_tests, tdd_mode, build_strategy, request_source,
        status, progress_logs
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'pending', '[]')
      RETURNING *`,
      [
        jobData.jiraTicketId,
        jobData.jiraEpicId,
        jobData.initiativeId,
        jobData.title,
        jobData.platform,
        jobData.repo,
        jobData.module,
        jobData.targetBranch,
        jobData.description,
        JSON.stringify(jobData.acceptanceCriteria),
        jobData.figmaUrl,
        JSON.stringify(jobData.technicalConstraints),
        jobData.maxFilesToTouch,
        jobData.requireTests,
        jobData.tddMode ?? false,
        jobData.buildStrategy,
        jobData.requestSource,
      ]
    );
    return mapRowToJob(result.rows[0]);
  } finally {
    client.release();
  }
}

/**
 * Retrieve a job by its unique identifier.
 * Returns null if job not found.
 * 
 * @param id - UUID of the job to retrieve
 * @returns Promise resolving to the job or null if not found
 * @example
 * const job = await getJob('550e8400-e29b-41d4-a716-446655440000');
 * if (job) {
 *   console.log(job.status);
 * }
 */
export async function getJob(id: string): Promise<CodeGenerationJob | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM code_generation_jobs WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return null;
    return mapRowToJob(result.rows[0]);
  } finally {
    client.release();
  }
}

/**
 * Update the status of a job and optionally other fields.
 * Automatically updates the updatedAt timestamp.
 * 
 * @param id - Job UUID
 * @param status - New status value
 * @param additionalFields - Optional additional fields to update (spec, prUrl, etc.)
 * @example
 * await updateJobStatus(jobId, 'spec_ready', { spec: technicalSpec });
 * await updateJobStatus(jobId, 'done', { prUrl: 'https://github.com/...' });
 */
export async function updateJobStatus(
  id: string,
  status: JobStatus,
  additionalFields?: Partial<CodeGenerationJob>
): Promise<void> {
  const client = await pool.connect();
  try {
    const updates: string[] = ['status = $2', 'updated_at = NOW()'];
    const values: any[] = [id, status];
    let paramCount = 2;
    
    if (additionalFields) {
      for (const [key, value] of Object.entries(additionalFields)) {
        if (value !== undefined) {
          paramCount++;
          const dbKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
          updates.push(`${dbKey} = $${paramCount}`);
          values.push(
            typeof value === 'object' && value !== null
              ? JSON.stringify(value)
              : value
          );
        }
      }
    }
    
    await client.query(
      `UPDATE code_generation_jobs SET ${updates.join(', ')} WHERE id = $1`,
      values
    );
  } finally {
    client.release();
  }
}

/**
 * Add a progress log entry to a job.
 * Prepends timestamp to message and adds to progressLogs array.
 * Useful for tracking agent actions and debugging.
 * 
 * @param jobId - Job UUID
 * @param message - Log message (timestamp will be prepended automatically)
 * @example
 * await addProgressLog(jobId, 'SpecAuthor: Generating spec...');
 * // Stored as: '[2024-01-15T10:30:01Z] SpecAuthor: Generating spec...'
 */
export async function addProgressLog(jobId: string, message: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE code_generation_jobs 
       SET progress_logs = jsonb_insert(
         progress_logs, 
         '{0}', 
         to_jsonb($2::text), 
         true
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [jobId, `[${new Date().toISOString()}] ${message}`]
    );
  } finally {
    client.release();
  }
}

/**
 * Persist structured error context when a job enters a granular error state.
 * Overwrites any previous error context.
 *
 * @param jobId  - Job UUID
 * @param ctx    - Structured error context to store
 * @example
 * await setErrorContext(jobId, {
 *   code: 'ENV_ERROR',
 *   stage: 'implementing',
 *   message: 'Flutter SDK not found',
 *   detail: 'which flutter returned exit code 1',
 *   timestamp: new Date().toISOString(),
 *   retryCount: 0,
 * });
 */
export async function setErrorContext(jobId: string, ctx: ErrorContext): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE code_generation_jobs
         SET error_context = $2::jsonb,
             updated_at    = NOW()
       WHERE id = $1`,
      [jobId, JSON.stringify(ctx)]
    );
  } finally {
    client.release();
  }
}

/**
 * List all jobs, optionally filtered by initiative.
 * Results ordered by createdAt descending (newest first).
 * 
 * @param initiativeId - Optional filter by initiative ID
 * @returns Promise resolving to array of jobs
 * @example
 * const allJobs = await listJobs();
 * const initiativeJobs = await listJobs('init-123');
 */
export async function listJobs(initiativeId?: string): Promise<CodeGenerationJob[]> {
  const client = await pool.connect();
  try {
    let query = 'SELECT * FROM code_generation_jobs';
    const params: any[] = [];
    
    if (initiativeId) {
      query += ' WHERE initiative_id = $1';
      params.push(initiativeId);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await client.query(query, params);
    return result.rows.map(mapRowToJob);
  } finally {
    client.release();
  }
}

/**
 * Map a PostgreSQL database row to CodeGenerationJob interface.
 * Handles conversion from snake_case column names to camelCase properties.
 * Parses JSONB fields (acceptanceCriteria, spec, progressLogs).
 * 
 * @param row - Database row from pg query result
 * @returns CodeGenerationJob object
 * @internal
 */
function mapRowToJob(row: any): CodeGenerationJob {
  return {
    id: row.id,
    jiraTicketId: row.jira_ticket_id,
    jiraEpicId: row.jira_epic_id,
    initiativeId: row.initiative_id,
    title: row.title,
    platform: row.platform,
    repo: row.repo,
    module: row.module,
    targetBranch: row.target_branch,
    description: row.description,
    acceptanceCriteria: row.acceptance_criteria || [],
    figmaUrl: row.figma_url,
    technicalConstraints: row.technical_constraints || [],
    maxFilesToTouch: row.max_files_to_touch,
    requireTests: row.require_tests,
    tddMode: row.tdd_mode ?? false,
    buildStrategy: row.build_strategy,
    requestSource: row.request_source,

    status: row.status,
    currentAgent: row.current_agent,
    progressLogs: row.progress_logs || [],
    
    spec: row.spec,
    branchName: row.branch_name,
    prUrl: row.pr_url,
    prId: row.pr_id,
    
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    errorContext: row.error_context ?? undefined,
  };
}
