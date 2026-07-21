/**
 * Unit tests for job management API routes (POST /jobs/:id/approve, etc.)
 * Mocks the state backend and leader orchestrator to avoid Postgres/LLM.
 */
import Fastify from 'fastify';
import { setupJobRoutes } from '../src/api/routes/jobs';

const mockUpdateJobStatus = jest.fn();
const mockAddProgressLog = jest.fn();
const mockGetJob = jest.fn();
const mockOrchestrateJob = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/state', () => ({
  getJob: (...args: any[]) => mockGetJob(...args),
  updateJobStatus: (...args: any[]) => mockUpdateJobStatus(...args),
  addProgressLog: (...args: any[]) => mockAddProgressLog(...args),
  listJobs: jest.fn(),
}));

jest.mock('../src/harness/leader', () => ({
  orchestrateJob: (...args: any[]) => mockOrchestrateJob(...args),
}));

function makeApp() {
  const app = Fastify({ logger: false });
  setupJobRoutes(app);
  return app;
}

function makeJob(overrides: any = {}) {
  return {
    id: 'job-123',
    status: 'spec_ready',
    title: 'Test feature',
    platform: 'flutter',
    repo: 'org/repo',
    targetBranch: 'develop',
    acceptanceCriteria: [],
    maxFilesToTouch: 5,
    requireTests: true,
    progressLogs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    initiativeId: 'init-1',
    ...overrides,
  };
}

describe('Job API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /jobs/:id/approve', () => {
    it('approves spec_ready job and resumes orchestration', async () => {
      const app = makeApp();
      mockGetJob.mockResolvedValue(makeJob());
      mockUpdateJobStatus.mockResolvedValue(undefined);

      const res = await app.inject({
        method: 'POST',
        url: '/jobs/job-123/approve',
        payload: { approved: true },
      });

      expect(res.statusCode).toBe(200);
      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-123', 'spec_approved');
      expect(mockOrchestrateJob).toHaveBeenCalledWith('job-123');
    });

    it('rejects spec and transitions to spec_generating with feedback', async () => {
      const app = makeApp();
      mockGetJob.mockResolvedValue(makeJob());
      mockUpdateJobStatus.mockResolvedValue(undefined);

      const res = await app.inject({
        method: 'POST',
        url: '/jobs/job-123/approve',
        payload: { approved: false, feedback: 'Add analytics tracking' },
      });

      expect(res.statusCode).toBe(200);
      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-123', 'spec_generating', {
        currentAgent: undefined,
        specFeedback: 'Add analytics tracking',
        specRetryCount: 1,
      });
      expect(mockAddProgressLog).toHaveBeenCalledWith(
        'job-123',
        expect.stringContaining('Spec rejected by human')
      );
      expect(mockOrchestrateJob).toHaveBeenCalledWith('job-123');
    });

    it('increments specRetryCount on repeated rejections', async () => {
      const app = makeApp();
      mockGetJob.mockResolvedValue(makeJob({ specRetryCount: 1 }));
      mockUpdateJobStatus.mockResolvedValue(undefined);

      await app.inject({
        method: 'POST',
        url: '/jobs/job-123/approve',
        payload: { approved: false, feedback: 'More tests' },
      });

      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-123', 'spec_generating', {
        currentAgent: undefined,
        specFeedback: 'More tests',
        specRetryCount: 2,
      });
    });

    it('returns 400 when spec retry limit is reached', async () => {
      const app = makeApp();
      mockGetJob.mockResolvedValue(makeJob({ specRetryCount: 5 }));

      const res = await app.inject({
        method: 'POST',
        url: '/jobs/job-123/approve',
        payload: { approved: false, feedback: 'Again' },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('Maximum spec retry attempts');
      expect(mockUpdateJobStatus).not.toHaveBeenCalled();
      expect(mockOrchestrateJob).not.toHaveBeenCalled();
    });

    it('returns 400 if job is not in spec_ready status', async () => {
      const app = makeApp();
      mockGetJob.mockResolvedValue(makeJob({ status: 'implementing' }));

      const res = await app.inject({
        method: 'POST',
        url: '/jobs/job-123/approve',
        payload: { approved: true },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('Cannot approve spec');
    });

    it('returns 404 if job does not exist', async () => {
      const app = makeApp();
      mockGetJob.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/jobs/job-123/approve',
        payload: { approved: true },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
