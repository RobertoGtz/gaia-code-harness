/**
 * Unit tests for the Leader orchestrator's retry and state-transition logic.
 * Mocks agents and state backend to avoid LLM/repo/Postgres side effects.
 */
import { orchestrateJob } from '../src/harness/leader';
import { getAgentsForPlatform } from '../src/agents/registry';

const mockGetJob = jest.fn();
const mockUpdateJobStatus = jest.fn();
const mockAddProgressLog = jest.fn();
const mockSetErrorContext = jest.fn();

jest.mock('../src/state', () => ({
  getJob: (...args: any[]) => mockGetJob(...args),
  updateJobStatus: (...args: any[]) => mockUpdateJobStatus(...args),
  addProgressLog: (...args: any[]) => mockAddProgressLog(...args),
  setErrorContext: (...args: any[]) => mockSetErrorContext(...args),
}));

jest.mock('../src/agents/registry', () => ({
  getAgentsForPlatform: jest.fn(),
}));

jest.mock('../src/tools/jira', () => ({
  fetchJiraTicket: jest.fn(),
  JiraError: Error,
  JiraConfigError: Error,
  JiraAuthError: Error,
  JiraNotFoundError: Error,
}));

const mockSpecAuthor = { execute: jest.fn() };
const mockImplementer = { execute: jest.fn(), executeTDD: jest.fn() };
const mockReviewer = { execute: jest.fn() };
const mockMutationTester = { execute: jest.fn() };

(getAgentsForPlatform as jest.Mock).mockReturnValue({
  specAuthor: mockSpecAuthor,
  implementer: mockImplementer,
  reviewer: mockReviewer,
  mutationTester: mockMutationTester,
});

function makeJob(overrides: any = {}) {
  return {
    id: 'job-1',
    title: 'Test feature',
    platform: 'flutter',
    repo: 'org/repo',
    targetBranch: 'develop',
    acceptanceCriteria: [],
    maxFilesToTouch: 5,
    requireTests: true,
    progressLogs: [],
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    initiativeId: 'init-1',
    ...overrides,
  };
}

let currentJob: any;

describe('Leader orchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(process.stdout, 'columns', { value: 100, writable: true, configurable: true });

    currentJob = makeJob();
    mockGetJob.mockResolvedValue(currentJob);
    mockUpdateJobStatus.mockImplementation(async (_id: string, status: string, extras?: any) => {
      currentJob.status = status;
      if (extras) {
        Object.assign(currentJob, extras);
      }
    });

    mockSpecAuthor.execute.mockResolvedValue({
      success: true,
      spec: { requirements: [], tasks: [] },
    });
    mockImplementer.execute.mockResolvedValue({
      success: true,
      changes: [{ path: 'lib/foo.dart', operation: 'modify' }],
      branchName: 'feature/job-1-test-feature',
    });
    mockImplementer.executeTDD.mockResolvedValue({
      success: true,
      changes: [{ path: 'lib/foo.dart', operation: 'modify' }],
      branchName: 'feature/job-1-test-feature',
    });
    mockReviewer.execute.mockResolvedValue({
      success: true,
      prUrl: 'https://github.com/org/repo/pull/1',
      prId: '1',
      branchName: 'feature/job-1-test-feature',
    });
    mockMutationTester.execute.mockResolvedValue({
      success: true,
      output: 'mutation score 90%',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('pending', () => {
    it('transitions to spec_ready when acceptance criteria are provided', async () => {
      currentJob = makeJob({
        status: 'pending',
        acceptanceCriteria: [{ id: 'ac-1', text: 'WHEN x THEN y', testable: true }],
      });
      mockGetJob.mockResolvedValue(currentJob);

      await orchestrateJob('job-1');

      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-1', 'fetching_jira', expect.any(Object));
      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-1', 'spec_generating');
      expect(mockSpecAuthor.execute).toHaveBeenCalled();
      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-1', 'spec_ready', expect.any(Object));
    });

    it('stays in fetching_jira when no acceptance criteria are provided', async () => {
      currentJob = makeJob({ status: 'pending' });
      mockGetJob.mockResolvedValue(currentJob);

      await orchestrateJob('job-1');

      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-1', 'fetching_jira', expect.any(Object));
      expect(mockUpdateJobStatus).not.toHaveBeenCalledWith('job-1', 'spec_generating', expect.any(Object));
    });
  });

  describe('fetching_jira', () => {
    it('uses jiraTicketId when jiraEpicId is absent', async () => {
      const { fetchJiraTicket } = require('../src/tools/jira');
      (fetchJiraTicket as jest.Mock).mockResolvedValue({
        title: 'Ticket',
        description: '',
        figmaUrl: '',
        platform: 'flutter',
        repo: 'org/repo',
        acceptanceCriteria: [],
        epicKey: '',
      });

      currentJob = makeJob({
        status: 'fetching_jira',
        jiraTicketId: 'PROJ-123',
        jiraEpicId: undefined,
        acceptanceCriteria: [],
      });
      mockGetJob.mockResolvedValue(currentJob);

      await orchestrateJob('job-1');

      expect(fetchJiraTicket).toHaveBeenCalledWith('PROJ-123');
    });

    it('throws when neither jiraTicketId nor jiraEpicId are present', async () => {
      currentJob = makeJob({
        status: 'fetching_jira',
        jiraTicketId: undefined,
        jiraEpicId: undefined,
      });
      mockGetJob.mockResolvedValue(currentJob);

      await expect(orchestrateJob('job-1')).rejects.toThrow('No jiraTicketId or jiraEpicId to fetch');
    });
  });

  describe('implementing retry loop', () => {
    it('retries test_error with reviewFeedback and eventually succeeds', async () => {
      mockImplementer.execute
        .mockResolvedValueOnce({ success: false, errorCode: 'TEST_ERROR', error: 'tests failed' })
        .mockResolvedValueOnce({
          success: true,
          changes: [{ path: 'lib/foo.dart', operation: 'modify' }],
          branchName: 'feature/job-1-test-feature',
        });

      currentJob = makeJob({ status: 'implementing' });
      mockGetJob.mockResolvedValue(currentJob);

      await orchestrateJob('job-1');

      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-1', 'implementing', {
        reviewFeedback: 'tests failed',
      });
      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-1', 'reviewing', expect.any(Object));
    });

    it('gives up after 5 implementation retries and sets test_error', async () => {
      mockImplementer.execute.mockResolvedValue({
        success: false,
        errorCode: 'TEST_ERROR',
        error: 'tests keep failing',
      });

      currentJob = makeJob({ status: 'implementing' });
      mockGetJob.mockResolvedValue(currentJob);

      await orchestrateJob('job-1');

      const retryLogs = mockAddProgressLog.mock.calls.filter(([_, msg]: [any, string]) =>
        msg.startsWith('Implementation retry')
      );
      expect(retryLogs.length).toBe(5);
      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-1', 'test_error');
    });

    it('retries failed status with reviewFeedback', async () => {
      mockImplementer.execute
        .mockResolvedValueOnce({ success: false, errorCode: 'UNKNOWN', error: 'unknown failure' })
        .mockResolvedValueOnce({
          success: true,
          changes: [{ path: 'lib/foo.dart', operation: 'modify' }],
          branchName: 'feature/job-1-test-feature',
        });

      currentJob = makeJob({ status: 'implementing' });
      mockGetJob.mockResolvedValue(currentJob);

      await orchestrateJob('job-1');

      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-1', 'implementing', {
        reviewFeedback: 'unknown failure',
      });
    });
  });

  describe('reviewing retry loop', () => {
    it('retries REVIEW_ERROR with feedback and eventually succeeds', async () => {
      mockReviewer.execute
        .mockResolvedValueOnce({ success: false, errorCode: 'REVIEW_ERROR', error: 'bad design' })
        .mockResolvedValueOnce({
          success: true,
          prUrl: 'https://github.com/org/repo/pull/1',
          prId: '1',
          branchName: 'feature/job-1-test-feature',
        });

      currentJob = makeJob({ status: 'reviewing', branchName: 'feature/job-1-test-feature' });
      mockGetJob.mockResolvedValue(currentJob);

      await orchestrateJob('job-1');

      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-1', 'implementing', {
        reviewFeedback: 'bad design',
      });
      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-1', 'done');
    });

    it('gives up after 5 review retries and sets review_error', async () => {
      mockReviewer.execute.mockResolvedValue({
        success: false,
        errorCode: 'REVIEW_ERROR',
        error: 'still bad',
      });

      currentJob = makeJob({ status: 'reviewing', branchName: 'feature/job-1-test-feature' });
      mockGetJob.mockResolvedValue(currentJob);

      await orchestrateJob('job-1');

      const retryLogs = mockAddProgressLog.mock.calls.filter(([_, msg]: [any, string]) =>
        msg.startsWith('Review retry')
      );
      expect(retryLogs.length).toBe(5);
      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-1', 'review_error');
    });

    it('retries TEST_ERROR from reviewer with feedback', async () => {
      mockReviewer.execute
        .mockResolvedValueOnce({ success: false, errorCode: 'TEST_ERROR', error: 'tests broken' })
        .mockResolvedValueOnce({
          success: true,
          prUrl: 'https://github.com/org/repo/pull/1',
          prId: '1',
          branchName: 'feature/job-1-test-feature',
        });

      currentJob = makeJob({ status: 'reviewing', branchName: 'feature/job-1-test-feature' });
      mockGetJob.mockResolvedValue(currentJob);

      await orchestrateJob('job-1');

      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-1', 'implementing', {
        reviewFeedback: 'tests broken',
      });
    });
  });

  describe('mutation testing retry loop', () => {
    it('retries mutation TEST_ERROR with feedback and eventually succeeds', async () => {
      mockMutationTester.execute
        .mockResolvedValueOnce({ success: false, errorCode: 'TEST_ERROR', error: 'mutant survived' })
        .mockResolvedValueOnce({ success: true, output: 'mutation score 95%' });

      currentJob = makeJob({ status: 'reviewing', branchName: 'feature/job-1-test-feature' });
      mockGetJob.mockResolvedValue(currentJob);

      await orchestrateJob('job-1');

      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-1', 'implementing', {
        reviewFeedback: 'mutant survived',
      });
      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-1', 'done');
    });

    it('gives up after 5 mutation retries and marks test_error', async () => {
      mockMutationTester.execute.mockResolvedValue({
        success: false,
        errorCode: 'TEST_ERROR',
        error: 'mutants keep surviving',
      });

      currentJob = makeJob({ status: 'reviewing', branchName: 'feature/job-1-test-feature' });
      mockGetJob.mockResolvedValue(currentJob);

      await orchestrateJob('job-1');

      const retryLogs = mockAddProgressLog.mock.calls.filter(([_, msg]: [any, string]) =>
        msg.startsWith('Mutation retry')
      );
      expect(retryLogs.length).toBe(5);
      expect(mockUpdateJobStatus).toHaveBeenCalledWith('job-1', 'test_error');
    });
  });
});
