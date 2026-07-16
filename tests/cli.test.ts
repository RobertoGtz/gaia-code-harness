import { main, parseArgs, approveAndResume } from '../src/cli/run';
import * as fs from 'fs';
import * as path from 'path';

const mockOrchestrateJob = jest.fn();
jest.mock('../src/harness/leader', () => ({
  orchestrateJob: (...args: any[]) => mockOrchestrateJob(...args),
}));

jest.mock('../src/state', () => ({
  setStateBackend: jest.fn(),
}));

jest.mock('../src/tools/jira', () => ({
  fetchJiraTicket: jest.fn(),
  JiraError: Error,
  JiraConfigError: Error,
  JiraAuthError: Error,
  JiraNotFoundError: Error,
}));

function makeBackend(overrides: any = {}) {
  return {
    createJob: jest.fn().mockReturnValue({
      id: 'job-123',
      title: 'Test feature',
      platform: 'flutter',
      repo: 'org/repo',
      targetBranch: 'develop',
      status: 'pending',
      progressLogs: [],
      acceptanceCriteria: [{ id: 'ac-1', text: 'WHEN x THEN y', testable: true }],
      maxFilesToTouch: 5,
      requireTests: true,
      tddMode: false,
    }),
    getJob: jest.fn(),
    updateJobStatus: jest.fn(),
    addProgressLog: jest.fn(),
    setErrorContext: jest.fn(),
    listJobs: jest.fn(),
    ...overrides,
  } as any;
}

describe('CLI Mode B', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseArgs', () => {
    it('parses flags and presence checks', () => {
      const { flag, has } = parseArgs(['--job', 'job.json', '--approve', '--tdd']);
      expect(flag('--job')).toBe('job.json');
      expect(has('--approve')).toBe(true);
      expect(has('--tdd')).toBe(true);
      expect(has('--list')).toBe(false);
    });
  });

  describe('approveAndResume', () => {
    it('approves spec_ready job and re-orchestrates', async () => {
      const backend = makeBackend({
        getJob: jest.fn().mockResolvedValue({
          id: 'job-123',
          status: 'spec_ready',
          title: 'Test',
        }),
      });

      await approveAndResume('job-123', backend);

      expect(backend.updateJobStatus).toHaveBeenCalledWith('job-123', 'spec_approved');
      expect(mockOrchestrateJob).toHaveBeenCalledWith('job-123');
    });

    it('does nothing if job is already done', async () => {
      const backend = makeBackend({
        getJob: jest.fn().mockResolvedValue({ id: 'job-123', status: 'done' }),
      });

      await approveAndResume('job-123', backend);

      expect(backend.updateJobStatus).not.toHaveBeenCalled();
      expect(mockOrchestrateJob).not.toHaveBeenCalled();
    });
  });

  describe('main', () => {
    it('lists jobs', async () => {
      const backend = makeBackend({
        listJobs: jest.fn().mockResolvedValue([{ id: 'job-123', status: 'done' }]),
      });
      await main(['--list'], { backend });
      expect(backend.listJobs).toHaveBeenCalled();
      expect(mockOrchestrateJob).not.toHaveBeenCalled();
    });

    it('creates job from inline JSON and orchestrates', async () => {
      const backend = makeBackend();
      const jobJson = JSON.stringify({
        platform: 'flutter',
        title: 'Add feature',
        repo: 'org/repo',
        acceptanceCriteria: ['WHEN x THEN y'],
      });

      await main(['--job', jobJson], { backend });

      expect(backend.createJob).toHaveBeenCalled();
      expect(mockOrchestrateJob).toHaveBeenCalledWith('job-123');
    });

    it('tags CLI-created jobs with requestSource=cli', async () => {
      const backend = makeBackend();
      const jobJson = JSON.stringify({
        platform: 'flutter',
        title: 'Add feature',
        repo: 'org/repo',
        acceptanceCriteria: ['WHEN x THEN y'],
      });

      await main(['--job', jobJson], { backend });

      expect(backend.createJob).toHaveBeenCalled();
      const jobInit = (backend.createJob as jest.Mock).mock.calls[0][0];
      expect(jobInit.requestSource).toBe('cli');
    });

    it('creates job from JSON file and orchestrates', async () => {
      const backend = makeBackend();
      const tmpFile = path.join(__dirname, 'tmp-job.json');
      fs.writeFileSync(tmpFile, JSON.stringify({
        platform: 'flutter',
        title: 'Add feature',
        repo: 'org/repo',
        acceptanceCriteria: ['WHEN x THEN y'],
      }));

      try {
        await main(['--job', tmpFile], { backend });
        expect(backend.createJob).toHaveBeenCalled();
        expect(mockOrchestrateJob).toHaveBeenCalledWith('job-123');
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('creates job from positional JSON file without --job flag', async () => {
      const backend = makeBackend();
      const tmpFile = path.join(__dirname, 'tmp-job-positional.json');
      fs.writeFileSync(tmpFile, JSON.stringify({
        platform: 'flutter',
        title: 'Add feature',
        repo: 'org/repo',
        acceptanceCriteria: ['WHEN x THEN y'],
      }));

      try {
        await main([tmpFile, '--approve'], { backend });
        expect(backend.createJob).toHaveBeenCalled();
        expect(mockOrchestrateJob).toHaveBeenCalledWith('job-123');
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('auto-approves after orchestration when --approve is passed', async () => {
      const backend = makeBackend({
        getJob: jest.fn().mockResolvedValue({ id: 'job-123', status: 'spec_ready' }),
      });
      const jobJson = JSON.stringify({
        platform: 'flutter',
        title: 'Add feature',
        repo: 'org/repo',
        acceptanceCriteria: ['WHEN x THEN y'],
      });

      await main(['--job', jobJson, '--approve'], { backend });

      expect(mockOrchestrateJob).toHaveBeenCalledWith('job-123');
      expect(backend.updateJobStatus).toHaveBeenCalledWith('job-123', 'spec_approved');
    });

    it('resumes existing job with --id', async () => {
      const backend = makeBackend({
        getJob: jest.fn().mockResolvedValue({ id: 'job-123', status: 'done' }),
      });

      await main(['--id', 'job-123'], { backend });

      expect(mockOrchestrateJob).toHaveBeenCalledWith('job-123');
    });

    it('retries build_error job with --id --retry', async () => {
      const backend = makeBackend({
        getJob: jest.fn().mockResolvedValue({ id: 'job-123', status: 'build_error' }),
      });

      await main(['--id', 'job-123', '--retry'], { backend });

      expect(backend.updateJobStatus).toHaveBeenCalledWith('job-123', 'implementing');
      expect(mockOrchestrateJob).toHaveBeenCalledWith('job-123');
    });

    it('retries review_error job with --id --retry', async () => {
      const backend = makeBackend({
        getJob: jest.fn().mockResolvedValue({ id: 'job-123', status: 'review_error', reviewFeedback: 'bad' }),
      });

      await main(['--id', 'job-123', '--retry'], { backend });

      expect(backend.updateJobStatus).toHaveBeenCalledWith('job-123', 'implementing');
      expect(mockOrchestrateJob).toHaveBeenCalledWith('job-123');
    });

    it('does not retry done job with --retry', async () => {
      const backend = makeBackend({
        getJob: jest.fn().mockResolvedValue({ id: 'job-123', status: 'done' }),
      });

      await main(['--id', 'job-123', '--retry'], { backend });

      expect(backend.updateJobStatus).not.toHaveBeenCalled();
      expect(mockOrchestrateJob).not.toHaveBeenCalled();
    });

    it('exits with usage when no args provided', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

      await expect(main([])).rejects.toThrow('exit');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));

      spy.mockRestore();
      exitSpy.mockRestore();
    });
  });
});
