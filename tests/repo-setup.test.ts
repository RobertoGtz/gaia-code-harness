/**
 * Unit tests for setupRepository (src/tools/repo.ts).
 * Mocks filesystem and git calls — no network, no disk I/O.
 */
import { setupRepository } from '../src/tools/repo';
import * as fileUtils from '../src/tools/file';
import * as gitUtils from '../src/tools/git';

const baseJob = {
  repo:         'mi-org/mi-repo',
  targetBranch: 'develop',
};

describe('setupRepository', () => {
  let fileExists: jest.SpyInstance;
  let cloneRepository: jest.SpyInstance;

  beforeEach(() => {
    fileExists      = jest.spyOn(fileUtils, 'fileExists');
    cloneRepository = jest.spyOn(gitUtils,  'cloneRepository').mockResolvedValue(undefined);
    delete process.env.LOCAL_REPOS_PATH;
    delete process.env.GITHUB_OWNER;
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Already exists ──────────────────────────────────────────────────────────

  it('returns success immediately if repoPath already exists', async () => {
    fileExists.mockResolvedValue(true);
    const result = await setupRepository(baseJob, '/workspace/existing');
    expect(result.success).toBe(true);
    expect(result.output).toContain('existing');
    expect(cloneRepository).not.toHaveBeenCalled();
  });

  // ── LOCAL_REPOS_PATH — git repo ─────────────────────────────────────────────

  it('clones from LOCAL_REPOS_PATH when path contains a .git repo', async () => {
    process.env.LOCAL_REPOS_PATH = '/local/repos';
    fileExists
      .mockResolvedValueOnce(false)   // repoPath does not exist
      .mockResolvedValueOnce(true)    // local repo dir exists
      .mockResolvedValueOnce(true);   // .git dir exists
    const result = await setupRepository(baseJob, '/workspace/job');
    expect(result.success).toBe(true);
    expect(result.output).toContain('/local/repos');
    expect(cloneRepository).toHaveBeenCalledWith(
      '/local/repos/mi-repo',
      '/workspace/job',
      'develop'
    );
  });

  it('uses targetBranch when cloning from LOCAL_REPOS_PATH', async () => {
    process.env.LOCAL_REPOS_PATH = '/local/repos';
    fileExists
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    await setupRepository({ ...baseJob, targetBranch: 'main' }, '/workspace/job');
    expect(cloneRepository).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), 'main'
    );
  });

  // ── LOCAL_REPOS_PATH — plain directory (no .git) ────────────────────────────

  it('copies directory when LOCAL_REPOS_PATH repo has no .git', async () => {
    process.env.LOCAL_REPOS_PATH = '/local/repos';
    const copyDir = jest.spyOn(fileUtils as any, 'copyDirectory').mockResolvedValue(undefined);
    fileExists
      .mockResolvedValueOnce(false)   // repoPath does not exist
      .mockResolvedValueOnce(true)    // local repo dir exists
      .mockResolvedValueOnce(false);  // .git dir does NOT exist
    const result = await setupRepository(baseJob, '/workspace/job');
    expect(result.success).toBe(true);
    expect(cloneRepository).not.toHaveBeenCalled();
    expect(copyDir).toHaveBeenCalled();
  });

  // ── LOCAL_REPOS_PATH — clone error ──────────────────────────────────────────

  it('returns failure if LOCAL_REPOS_PATH clone throws', async () => {
    process.env.LOCAL_REPOS_PATH = '/local/repos';
    fileExists
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    cloneRepository.mockRejectedValue(new Error('disk full'));
    const result = await setupRepository(baseJob, '/workspace/job');
    expect(result.success).toBe(false);
    expect(result.error).toContain('LOCAL_REPOS_PATH');
  });

  // ── Remote GitHub clone ─────────────────────────────────────────────────────

  it('clones from GitHub when no LOCAL_REPOS_PATH', async () => {
    process.env.GITHUB_OWNER = 'mi-org';
    process.env.GITHUB_TOKEN = 'ghp_test';
    fileExists
      .mockResolvedValueOnce(false);  // repoPath does not exist
    const result = await setupRepository(baseJob, '/workspace/job');
    expect(result.success).toBe(true);
    expect(cloneRepository).toHaveBeenCalledWith(
      'https://github.com/mi-org/mi-repo.git',
      '/workspace/job',
      'develop',
      { username: 'x-access-token', password: 'ghp_test' }
    );
  });

  it('uses owner/repo from job.repo when it contains a slash', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    fileExists.mockResolvedValueOnce(false);
    await setupRepository({ ...baseJob, repo: 'other-org/other-repo' }, '/workspace/job');
    expect(cloneRepository).toHaveBeenCalledWith(
      'https://github.com/other-org/other-repo.git',
      expect.any(String),
      expect.any(String),
      expect.anything()
    );
  });

  it('returns failure if GitHub clone throws', async () => {
    fileExists.mockResolvedValueOnce(false);
    cloneRepository.mockRejectedValue(new Error('not found'));
    const result = await setupRepository(baseJob, '/workspace/job');
    expect(result.success).toBe(false);
    expect(result.error).toContain('clone');
  });

  it('clones without auth when GITHUB_TOKEN is not set', async () => {
    fileExists.mockResolvedValueOnce(false);
    await setupRepository(baseJob, '/workspace/job');
    const call = cloneRepository.mock.calls[0];
    expect(call[3]).toBeUndefined();
  });
});
