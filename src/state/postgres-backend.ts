/**
 * @fileoverview Postgres state backend — Modes A and C (HTTP/Webhook + Postgres)
 * @description Adapts the PostgreSQL CRUD functions to the StateBackend interface.
 * @module state/postgres-backend
 */

import * as db from '../db';
import { StateBackend } from './index';
import { CodeGenerationJob, ErrorContext, JobStatus } from '../types';

export class PostgresBackend implements StateBackend {
  async getJob(id: string): Promise<CodeGenerationJob | null> {
    return db.getJob(id);
  }

  async createJob(job: Omit<CodeGenerationJob, 'id' | 'createdAt' | 'updatedAt'>): Promise<CodeGenerationJob> {
    return db.createJob(job);
  }

  async updateJobStatus(id: string, status: JobStatus, extra?: Partial<CodeGenerationJob>): Promise<void> {
    return db.updateJobStatus(id, status, extra);
  }

  async addProgressLog(id: string, message: string): Promise<void> {
    return db.addProgressLog(id, message);
  }

  async setErrorContext(id: string, ctx: ErrorContext): Promise<void> {
    return db.setErrorContext(id, ctx);
  }

  async listJobs(): Promise<CodeGenerationJob[]> {
    return db.listJobs();
  }
}
