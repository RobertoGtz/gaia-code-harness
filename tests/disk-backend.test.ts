/**
 * Unit tests for DiskBackend — the state backend used by Mode B (CLI).
 * All tests run against a temporary directory and clean up after themselves.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DiskBackend } from '../src/state/disk-backend';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'disk-backend-test-'));
}

function makeBackend(dir: string): DiskBackend {
  return new DiskBackend({ stateDir: path.join(dir, '.state'), progressDir: path.join(dir, 'progress') });
}

const minimalJob = {
  title:              'Test job',
  platform:           'flutter' as const,
  repo:               'mi-org/mi-repo',
  targetBranch:       'develop',
  initiativeId:       'test-init',
  tddMode:            false,
  requireTests:       true,
  maxFilesToTouch:    5,
  acceptanceCriteria: [{ id: 'ac-1', text: 'WHEN x THEN y', testable: true }],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DiskBackend', () => {
  let dir: string;
  let backend: DiskBackend;

  beforeEach(() => {
    dir = tmpDir();
    backend = makeBackend(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // ── createJob ──────────────────────────────────────────────────────────────

  describe('createJob', () => {
    it('assigns a UUID id', async () => {
      const job = await backend.createJob(minimalJob);
      expect(job.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('sets status to pending', async () => {
      const job = await backend.createJob(minimalJob);
      expect(job.status).toBe('pending');
    });

    it('sets empty progressLogs', async () => {
      const job = await backend.createJob(minimalJob);
      expect(job.progressLogs).toEqual([]);
    });

    it('persists job to disk as JSON', async () => {
      const job = await backend.createJob(minimalJob);
      const stateFile = path.join(dir, '.state', `${job.id}.json`);
      expect(fs.existsSync(stateFile)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      expect(parsed.id).toBe(job.id);
      expect(parsed.title).toBe('Test job');
    });

    it('writes a markdown progress log file', async () => {
      const job = await backend.createJob(minimalJob);
      const mdFile = path.join(dir, 'progress', `${job.id}.md`);
      expect(fs.existsSync(mdFile)).toBe(true);
      const content = fs.readFileSync(mdFile, 'utf8');
      expect(content).toContain('Test job');
    });

    it('preserves optional fields (figmaUrl, jiraEpicId, description, module)', async () => {
      const job = await backend.createJob({
        ...minimalJob,
        figmaUrl:    'https://figma.com/file/abc',
        jiraEpicId:  'EPIC-10',
        description: 'Some description',
        module:      'home',
      });
      expect(job.figmaUrl).toBe('https://figma.com/file/abc');
      expect(job.jiraEpicId).toBe('EPIC-10');
      expect(job.description).toBe('Some description');
      expect(job.module).toBe('home');
    });
  });

  // ── getJob ─────────────────────────────────────────────────────────────────

  describe('getJob', () => {
    it('returns the created job by id', async () => {
      const created = await backend.createJob(minimalJob);
      const fetched  = await backend.getJob(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.title).toBe('Test job');
    });

    it('returns null for unknown id', async () => {
      const result = await backend.getJob('non-existent-id');
      expect(result).toBeNull();
    });

    it('deserializes dates correctly', async () => {
      const created = await backend.createJob(minimalJob);
      const fetched  = await backend.getJob(created.id);
      expect(fetched?.createdAt).toBeInstanceOf(Date);
      expect(fetched?.updatedAt).toBeInstanceOf(Date);
    });
  });

  // ── updateJobStatus ────────────────────────────────────────────────────────

  describe('updateJobStatus', () => {
    it('updates the status field', async () => {
      const job = await backend.createJob(minimalJob);
      await backend.updateJobStatus(job.id, 'spec_ready');
      const updated = await backend.getJob(job.id);
      expect(updated?.status).toBe('spec_ready');
    });

    it('merges extra fields', async () => {
      const job = await backend.createJob(minimalJob);
      await backend.updateJobStatus(job.id, 'implementing', { prUrl: 'https://github.com/pr/1' });
      const updated = await backend.getJob(job.id);
      expect(updated?.prUrl).toBe('https://github.com/pr/1');
    });

    it('persists reviewFeedback for closed-loop retries', async () => {
      const job = await backend.createJob(minimalJob);
      const feedback = 'Missing test for empty list edge case';
      await backend.updateJobStatus(job.id, 'implementing', { reviewFeedback: feedback });
      const updated = await backend.getJob(job.id);
      expect(updated?.reviewFeedback).toBe(feedback);
      expect(updated?.status).toBe('implementing');
    });

    it('throws for unknown id', async () => {
      await expect(backend.updateJobStatus('bad-id', 'done')).rejects.toThrow('Job bad-id not found');
    });
  });

  // ── addProgressLog ─────────────────────────────────────────────────────────

  describe('addProgressLog', () => {
    it('appends a timestamped log entry', async () => {
      const job = await backend.createJob(minimalJob);
      await backend.addProgressLog(job.id, 'Step completed');
      const updated = await backend.getJob(job.id);
      expect(updated?.progressLogs).toHaveLength(1);
      expect(updated?.progressLogs[0]).toContain('Step completed');
    });

    it('appends multiple log entries in order', async () => {
      const job = await backend.createJob(minimalJob);
      await backend.addProgressLog(job.id, 'First');
      await backend.addProgressLog(job.id, 'Second');
      const updated = await backend.getJob(job.id);
      expect(updated?.progressLogs).toHaveLength(2);
      expect(updated?.progressLogs[0]).toContain('First');
      expect(updated?.progressLogs[1]).toContain('Second');
    });

    it('throws for unknown id', async () => {
      await expect(backend.addProgressLog('bad-id', 'msg')).rejects.toThrow('Job bad-id not found');
    });
  });

  // ── setErrorContext ────────────────────────────────────────────────────────

  describe('setErrorContext', () => {
    it('stores error context on the job', async () => {
      const job = await backend.createJob(minimalJob);
      await backend.setErrorContext(job.id, {
        code: 'BUILD_ERROR',
        stage: 'implementing',
        message: 'Build failed',
        timestamp: new Date().toISOString(),
        retryCount: 0,
      });
      const updated = await backend.getJob(job.id);
      expect(updated?.errorContext?.code).toBe('BUILD_ERROR');
      expect(updated?.errorContext?.retryCount).toBe(0);
    });

    it('throws for unknown id', async () => {
      await expect(backend.setErrorContext('bad-id', { code: 'BUILD_ERROR', stage: 'implementing', message: 'x', timestamp: new Date().toISOString(), retryCount: 0 }))
        .rejects.toThrow('Job bad-id not found');
    });
  });

  // ── listJobs ───────────────────────────────────────────────────────────────

  describe('listJobs', () => {
    it('returns all created jobs sorted by createdAt desc', async () => {
      const a = await backend.createJob({ ...minimalJob, title: 'Job A' });
      // Small delay so createdAt timestamps differ (filesystem clock resolution)
      await new Promise(r => setTimeout(r, 5));
      const b = await backend.createJob({ ...minimalJob, title: 'Job B' });
      const list = await backend.listJobs();
      expect(list).toHaveLength(2);
      // Most recent first
      expect(list[0].id).toBe(b.id);
      expect(list[1].id).toBe(a.id);
    });

    it('returns empty array when no jobs exist', async () => {
      const list = await backend.listJobs();
      expect(list).toEqual([]);
    });

    it('filters by initiativeId when provided', async () => {
      await backend.createJob({ ...minimalJob, initiativeId: 'init-A' });
      await backend.createJob({ ...minimalJob, initiativeId: 'init-B' });
      const filtered = await backend.listJobs('init-A');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].initiativeId).toBe('init-A');
    });
  });
});
