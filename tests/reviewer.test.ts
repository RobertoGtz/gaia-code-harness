import { ReviewerAgent } from '../src/agents/reviewer';
import * as gitTools from '../src/tools/git';
import * as skills from '../src/plugins';
import * as llm from '../src/tools/llm';
import { GitHubAuthError, GitHubNotFoundError, GitPushError } from '../src/tools/git';

jest.mock('../src/plugins');
jest.mock('../src/tools/llm');

const mockedSkills = skills as jest.Mocked<typeof skills>;

function makeJob(overrides: any = {}) {
  return {
    id: 'job-1',
    title: 'Add feature',
    platform: 'ios',
    repo: 'rappi-inc/ios-rappi-main',
    targetBranch: 'develop',
    branchName: 'feature/job-1-add-feature',
    maxFilesToTouch: 5,
    requireTests: false,
    acceptanceCriteria: [{ id: 'ac-1', text: 'WHEN x THEN y', testable: true }],
    spec: {
      requirements: [{ id: 'r1', content: 'Do thing' }],
      design: {
        affectedFiles: ['a.swift'],
        newFiles: ['b.swift'],
        architectureDecisions: ['Use protocol'],
      },
      tasks: [{ id: 't1', type: 'modify', description: 'Update a.swift', filePath: 'a.swift', status: 'pending' }],
    },
    ...overrides,
  };
}

describe('ReviewerAgent', () => {
  let agent: ReviewerAgent;
  let skillMock: any;
  let initGitSpy: jest.SpyInstance;
  let getModifiedFilesSpy: jest.SpyInstance;
  let parseGitHubRepoFromRemoteSpy: jest.SpyInstance;
  let createGitHubPRSpy: jest.SpyInstance;
  let addJiraCommentSpy: jest.SpyInstance;

  beforeEach(() => {
    agent = new ReviewerAgent();
    skillMock = {
      displayName: 'iOS / Swift',
      verifyEnvironment: jest.fn().mockResolvedValue({ valid: true }),
      analyze: jest.fn().mockResolvedValue({ passed: true }),
      test: jest.fn().mockResolvedValue({ passed: true, command: '', stdout: '', stderr: '', exitCode: 0, duration: 1 }),
      build: jest.fn().mockResolvedValue({ passed: true }),
    };
    mockedSkills.loadSkill.mockResolvedValue(skillMock);

    initGitSpy = jest.spyOn(gitTools, 'initGit').mockReturnValue({ status: jest.fn() } as any);
    getModifiedFilesSpy = jest.spyOn(gitTools, 'getModifiedFiles').mockResolvedValue(['a.swift']);
    parseGitHubRepoFromRemoteSpy = jest.spyOn(gitTools, 'parseGitHubRepoFromRemote').mockResolvedValue({ owner: 'rappi-inc', repo: 'ios-rappi-main' });
    createGitHubPRSpy = jest.spyOn(gitTools, 'createGitHubPR').mockResolvedValue({ url: 'https://github.com/rappi-inc/ios-rappi-main/pull/1', id: '1', number: 1 });
    addJiraCommentSpy = jest.spyOn(gitTools, 'addJiraComment').mockResolvedValue(undefined);
    (llm.callLLM as jest.MockedFunction<typeof llm.callLLM>).mockResolvedValue({
      text: '{"score": 95, "passed": true, "issues": []}',
      provider: 'openai',
      model: 'gpt-test',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns success with PR URL when review passes', async () => {
    const result = await agent.execute({ job: makeJob(), workspacePath: '/workspace/job' } as any);
    expect(result.success).toBe(true);
    expect(result.prUrl).toBe('https://github.com/rappi-inc/ios-rappi-main/pull/1');
  });

  it('skips tests when requireTests is false', async () => {
    await agent.execute({ job: makeJob({ requireTests: false }), workspacePath: '/workspace/job' } as any);
    expect(skillMock.verifyEnvironment).not.toHaveBeenCalled();
    expect(skillMock.test).not.toHaveBeenCalled();
  });

  it('runs tests when requireTests is true', async () => {
    await agent.execute({ job: makeJob({ requireTests: true }), workspacePath: '/workspace/job' } as any);
    expect(skillMock.verifyEnvironment).toHaveBeenCalled();
    expect(skillMock.test).toHaveBeenCalled();
  });

  it('fails when too many files modified', async () => {
    getModifiedFilesSpy.mockResolvedValue(['a', 'b', 'c', 'd', 'e', 'f']);
    const result = await agent.execute({ job: makeJob({ maxFilesToTouch: 5 }), workspacePath: '/workspace/job' } as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Too many files modified');
  });

  it('allows exactly maxFilesToTouch files', async () => {
    getModifiedFilesSpy.mockResolvedValue(['a', 'b', 'c', 'd', 'e']);
    const result = await agent.execute({ job: makeJob({ maxFilesToTouch: 5 }), workspacePath: '/workspace/job' } as any);
    expect(result.success).toBe(true);
  });

  it('fails when spec is missing', async () => {
    const result = await agent.execute({ job: makeJob({ spec: undefined }), workspacePath: '/workspace/job' } as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No spec found');
  });

  it('adds Jira comment when ticket is present', async () => {
    await agent.execute({ job: makeJob({ jiraTicketId: 'PROJ-123' }), workspacePath: '/workspace/job' } as any);
    expect(addJiraCommentSpy).toHaveBeenCalledWith('PROJ-123', expect.stringContaining('Pull Request created'));
  });

  it('falls back to dry-run PR on unknown PR error', async () => {
    createGitHubPRSpy.mockRejectedValue(new Error('network'));
    const result = await agent.execute({ job: makeJob(), workspacePath: '/workspace/job' } as any);
    expect(result.success).toBe(true);
    expect(result.prUrl).toContain('dry-run');
  });

  it('throws GaiaReviewError for GitHubAuthError', async () => {
    createGitHubPRSpy.mockRejectedValue(new GitHubAuthError('creating PR'));
    const result = await agent.execute({ job: makeJob(), workspacePath: '/workspace/job' } as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('GITHUB_TOKEN');
  });

  it('throws GaiaReviewError for GitHubNotFoundError', async () => {
    createGitHubPRSpy.mockRejectedValue(new GitHubNotFoundError('rappi-inc/ios-rappi-main'));
    const result = await agent.execute({ job: makeJob(), workspacePath: '/workspace/job' } as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('throws GaiaReviewError for GitPushError', async () => {
    createGitHubPRSpy.mockRejectedValue(new GitPushError('feature/x', 'rejected'));
    const result = await agent.execute({ job: makeJob(), workspacePath: '/workspace/job' } as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('rejected');
  });

  it('returns generic error for unexpected errors', async () => {
    mockedSkills.loadSkill.mockRejectedValue(new Error('boom'));
    const result = await agent.execute({ job: makeJob(), workspacePath: '/workspace/job' } as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Review failed');
  });

  it('fails with REVIEW_ERROR when LLM review score is below threshold', async () => {
    (llm.callLLM as jest.MockedFunction<typeof llm.callLLM>).mockResolvedValue({
      text: '{"score": 55, "passed": false, "issues": ["Missing test for empty list edge case"]}',
      provider: 'openai',
      model: 'gpt-test',
    });
    const result = await agent.execute({ job: makeJob(), workspacePath: '/workspace/job' } as any);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('REVIEW_ERROR');
    expect(result.error).toContain('Missing test for empty list edge case');
  });

  it('passes when LLM review score is above threshold', async () => {
    (llm.callLLM as jest.MockedFunction<typeof llm.callLLM>).mockResolvedValue({
      text: '{"score": 90, "passed": true, "issues": []}',
      provider: 'openai',
      model: 'gpt-test',
    });
    const result = await agent.execute({ job: makeJob(), workspacePath: '/workspace/job' } as any);
    expect(result.success).toBe(true);
    expect(result.prUrl).toBe('https://github.com/rappi-inc/ios-rappi-main/pull/1');
  });
});
