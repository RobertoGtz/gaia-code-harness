/**
 * @fileoverview Disk JSON state backend — for Claude Code / local mode
 * @description Persists job state as a JSON file on disk so it survives
 *              process restarts and context window resets. Each job maps to
 *              a single file at {progressDir}/{jobId}.json.
 *              Also writes human-readable progress/{jobId}.md logs.
 * @module state/disk-backend
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { StateBackend } from './index';
import { CodeGenerationJob, ErrorContext, JobStatus } from '../types';

const DEFAULT_PROGRESS_DIR = path.join(process.cwd(), 'progress');

export class DiskBackend implements StateBackend {
  private readonly stateDir: string;
  private readonly progressDir: string;

  constructor(opts?: { stateDir?: string; progressDir?: string }) {
    this.stateDir    = opts?.stateDir    ?? path.join(DEFAULT_PROGRESS_DIR, '.state');
    this.progressDir = opts?.progressDir ?? DEFAULT_PROGRESS_DIR;
    fs.mkdirSync(this.stateDir,    { recursive: true });
    fs.mkdirSync(this.progressDir, { recursive: true });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private filePath(id: string): string {
    return path.join(this.stateDir, `${id}.json`);
  }

  private read(id: string): CodeGenerationJob | null {
    try {
      const raw = fs.readFileSync(this.filePath(id), 'utf8');
      const j = JSON.parse(raw) as CodeGenerationJob;
      j.createdAt = new Date(j.createdAt);
      j.updatedAt = new Date(j.updatedAt);
      return j;
    } catch {
      return null;
    }
  }

  private write(job: CodeGenerationJob): void {
    fs.writeFileSync(this.filePath(job.id), JSON.stringify(job, null, 2), 'utf8');
    this.writeMarkdownLog(job);
  }

  private writeMarkdownLog(job: CodeGenerationJob): void {
    const mdPath = path.join(this.progressDir, `${job.id}.md`);
    const lines = [
      `# Job: ${job.title}`,
      `**Status**: ${job.status}  |  **Platform**: ${job.platform}  |  **Repo**: ${job.repo}`,
      `**Updated**: ${job.updatedAt.toISOString()}`,
      '',
      '## Progress',
      ...job.progressLogs.map(l => `- ${l}`),
    ];
    if (job.errorContext) {
      lines.push('', '## Error', `\`\`\`json\n${JSON.stringify(job.errorContext, null, 2)}\n\`\`\``);
    }
    if (job.spec) {
      lines.push('', '## Spec', `\`\`\`json\n${JSON.stringify(job.spec, null, 2)}\n\`\`\``);
    }
    fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
  }

  // ── StateBackend impl ──────────────────────────────────────────────────────

  async getJob(id: string): Promise<CodeGenerationJob | null> {
    return this.read(id);
  }

  async createJob(job: Omit<CodeGenerationJob, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'progressLogs'>): Promise<CodeGenerationJob> {
    const now = new Date();
    const full: CodeGenerationJob = {
      ...job,
      id: randomUUID(),
      status: 'pending',
      progressLogs: [],
      createdAt: now,
      updatedAt: now,
    };
    this.write(full);
    return full;
  }

  async updateJobStatus(id: string, status: JobStatus, extra?: Partial<CodeGenerationJob>): Promise<void> {
    const job = this.read(id);
    if (!job) throw new Error(`Job ${id} not found`);
    Object.assign(job, extra ?? {}, { status, updatedAt: new Date() });
    this.write(job);
  }

  async addProgressLog(id: string, message: string): Promise<void> {
    const job = this.read(id);
    if (!job) throw new Error(`Job ${id} not found`);
    job.progressLogs.push(`[${new Date().toISOString()}] ${message}`);
    job.updatedAt = new Date();
    this.write(job);
  }

  async setErrorContext(id: string, ctx: ErrorContext): Promise<void> {
    const job = this.read(id);
    if (!job) throw new Error(`Job ${id} not found`);
    job.errorContext = ctx;
    job.updatedAt = new Date();
    this.write(job);
  }

  async listJobs(initiativeId?: string): Promise<CodeGenerationJob[]> {
    try {
      return fs.readdirSync(this.stateDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          try {
            const j = JSON.parse(fs.readFileSync(path.join(this.stateDir, f), 'utf8')) as CodeGenerationJob;
            j.createdAt = new Date(j.createdAt);
            j.updatedAt = new Date(j.updatedAt);
            return j;
          } catch { return null; }
        })
        .filter((j): j is CodeGenerationJob => j !== null)
        .filter(j => !initiativeId || j.initiativeId === initiativeId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch {
      return [];
    }
  }
}
