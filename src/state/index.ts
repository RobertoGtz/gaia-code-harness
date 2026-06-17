/**
 * @fileoverview State backend abstraction for Gaia Code Harness
 * @description Pluggable interface so the same orchestration logic works with
 *              Postgres (HTTP mode) or disk JSON files (Claude Code mode).
 * @module state
 */

import { CodeGenerationJob, ErrorContext, JobStatus } from '../types';

// ─── Interface ──────────────────────────────────────────────────────────────

export interface StateBackend {
  getJob(id: string): Promise<CodeGenerationJob | null>;
  createJob(job: Omit<CodeGenerationJob, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'progressLogs'>): Promise<CodeGenerationJob>;
  updateJobStatus(id: string, status: JobStatus, extra?: Partial<CodeGenerationJob>): Promise<void>;
  addProgressLog(id: string, message: string): Promise<void>;
  setErrorContext(id: string, ctx: ErrorContext): Promise<void>;
  listJobs(initiativeId?: string): Promise<CodeGenerationJob[]>;
}

// ─── Active backend (singleton) ─────────────────────────────────────────────

let _backend: StateBackend | null = null;

export function setStateBackend(backend: StateBackend): void {
  _backend = backend;
}

export function getStateBackend(): StateBackend {
  if (!_backend) throw new Error('No state backend configured. Call setStateBackend() first.');
  return _backend;
}

// ─── Convenience wrappers (mirror the db/ API) ───────────────────────────────

export const getJob          = (id: string)                                         => getStateBackend().getJob(id);
export const createJob       = (j: Omit<CodeGenerationJob, 'id'|'createdAt'|'updatedAt'|'status'|'progressLogs'>) => getStateBackend().createJob(j);
export const updateJobStatus = (id: string, s: JobStatus, e?: Partial<CodeGenerationJob>) => getStateBackend().updateJobStatus(id, s, e);
export const addProgressLog  = (id: string, m: string)                              => getStateBackend().addProgressLog(id, m);
export const setErrorContext = (id: string, c: ErrorContext)                        => getStateBackend().setErrorContext(id, c);
export const listJobs        = (initiativeId?: string)                              => getStateBackend().listJobs(initiativeId);
