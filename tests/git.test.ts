import simpleGit from 'simple-git';
import axios from 'axios';
import {
  cloneRepository,
  createBranch,
  commitAndPush,
  parseGitHubRepoFromRemote,
  generateBranchName,
  getModifiedFiles,
  createGitHubPR,
  addJiraComment,
  GitHubAuthError,
  GitHubNotFoundError,
  GitHubPRError,
} from '../src/tools/git';

describe('Git/GitHub error message exact format', () => {
  it('GitHubAuthError message matches production format', () => {
    const err = new GitHubAuthError('creating PR');
    expect(err.message).toBe('[GitHub] Authentication failed while creating PR. Verify GITHUB_TOKEN is set and has the "repo" scope.');
  });

  it('GitHubNotFoundError message matches production format', () => {
    const err = new GitHubNotFoundError('my/repo');
    expect(err.message).toBe('[GitHub] Repository "my/repo" not found or not accessible. Check GITHUB_OWNER, the repo name, and that GITHUB_TOKEN has read access.');
  });

  it('GitHubPRError message matches production format', () => {
    const err = new GitHubPRError('o', 'r', 'branch missing');
    expect(err.message).toBe('[GitHub] Failed to create PR on o/r: branch missing');
  });
});

jest.mock('simple-git');
jest.mock('axios');

const mockedSimpleGit = simpleGit as jest.MockedFunction<typeof simpleGit>;
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('git tools', () => {
  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_OWNER;
    delete process.env.JIRA_BASE_URL;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;
  });

  describe('parseGitHubRepoFromRemote', () => {
    it('parses HTTPS remote', async () => {
      const git = {
        getRemotes: jest.fn().mockResolvedValue([
          { name: 'origin', refs: { fetch: 'https://github.com/rappi-inc/ios-rappi-main.git' } },
        ]),
      } as any;
      const result = await parseGitHubRepoFromRemote(git, 'ios-rappi-main');
      expect(result).toEqual({ owner: 'rappi-inc', repo: 'ios-rappi-main' });
    });

    it('parses SSH remote', async () => {
      const git = {
        getRemotes: jest.fn().mockResolvedValue([
          { name: 'origin', refs: { push: 'git@github.com:rappi-inc/ios-rappi-main.git' } },
        ]),
      } as any;
      const result = await parseGitHubRepoFromRemote(git, 'ios-rappi-main');
      expect(result).toEqual({ owner: 'rappi-inc', repo: 'ios-rappi-main' });
    });

    it('falls back to job repo with owner', async () => {
      process.env.GITHUB_OWNER = 'fallback-owner';
      const git = { getRemotes: jest.fn().mockRejectedValue(new Error('no git')) } as any;
      const result = await parseGitHubRepoFromRemote(git, 'my/repo');
      expect(result).toEqual({ owner: 'my', repo: 'repo' });
    });

    it('falls back to GITHUB_OWNER for bare repo', async () => {
      process.env.GITHUB_OWNER = 'fallback-owner';
      const git = { getRemotes: jest.fn().mockResolvedValue([]) } as any;
      const result = await parseGitHubRepoFromRemote(git, 'repo');
      expect(result).toEqual({ owner: 'fallback-owner', repo: 'repo' });
    });
  });

  describe('generateBranchName', () => {
    it('sanitizes title and includes ticket', () => {
      const branch = generateBranchName('PROJ-123', 'Add new Banner!');
      expect(branch).toBe('feature/PROJ-123-add-new-banner');
    });

    it('truncates long titles', () => {
      const branch = generateBranchName('T-1', 'a'.repeat(80));
      expect(branch.length).toBeLessThan(60);
    });

    it('replaces whitespace runs with a single hyphen', () => {
      const branch = generateBranchName('T-2', 'Add   many    spaces');
      expect(branch).toBe('feature/T-2-add-many-spaces');
    });

    it('removes special characters', () => {
      const branch = generateBranchName('T-3', 'Add @#$% special');
      expect(branch).toBe('feature/T-3-add-special');
    });

    it('keeps digits and lowercase letters', () => {
      const branch = generateBranchName('T-4', 'Fix 2FA Login');
      expect(branch).toBe('feature/T-4-fix-2fa-login');
    });
  });

  describe('getModifiedFiles', () => {
    it('combines modified, created, and renamed', async () => {
      const git = {
        status: jest.fn().mockResolvedValue({
          modified: ['a.swift'],
          created: ['b.swift'],
          renamed: [{ to: 'c.swift' }],
        }),
      } as any;
      const files = await getModifiedFiles(git);
      expect(files).toEqual(['a.swift', 'b.swift', 'c.swift']);
    });
  });

  describe('createBranch', () => {
    it('checks out source, deletes old branch, and creates new branch', async () => {
      const git = {
        checkout: jest.fn().mockResolvedValue(undefined),
        deleteLocalBranch: jest.fn().mockResolvedValue(undefined),
        checkoutLocalBranch: jest.fn().mockResolvedValue(undefined),
      } as any;
      await createBranch(git, 'feature/new', 'develop');
      expect(git.checkout).toHaveBeenCalledWith('develop');
      expect(git.deleteLocalBranch).toHaveBeenCalledWith('feature/new', true);
      expect(git.checkoutLocalBranch).toHaveBeenCalledWith('feature/new');
    });
  });

  describe('cloneRepository', () => {
    it('clones without auth', async () => {
      const clone = jest.fn().mockResolvedValue(undefined);
      mockedSimpleGit.mockReturnValue({ clone } as any);
      await cloneRepository('https://github.com/o/r.git', '/tmp/r', 'main');
      expect(clone).toHaveBeenCalledWith('https://github.com/o/r.git', '/tmp/r', ['--branch', 'main', '--single-branch']);
    });

    it('injects auth into URL', async () => {
      const clone = jest.fn().mockResolvedValue(undefined);
      mockedSimpleGit.mockReturnValue({ clone } as any);
      await cloneRepository('https://github.com/o/r.git', '/tmp/r', 'develop', { username: 'u', password: 'p' });
      expect(clone).toHaveBeenCalledWith('https://u:p@github.com/o/r.git', '/tmp/r', ['--branch', 'develop', '--single-branch']);
    });
  });

  describe('commitAndPush', () => {
    it('adds, commits, and pushes without branch', async () => {
      const git = { add: jest.fn(), commit: jest.fn(), push: jest.fn() } as any;
      await commitAndPush(git, 'msg', ['f.swift']);
      expect(git.add).toHaveBeenCalledWith(['f.swift']);
      expect(git.commit).toHaveBeenCalledWith('msg');
      expect(git.push).not.toHaveBeenCalled();
    });

    it('sets token URL and pushes branch', async () => {
      process.env.GITHUB_TOKEN = 'tok';
      const git = {
        add: jest.fn(),
        commit: jest.fn(),
        push: jest.fn().mockResolvedValue(undefined),
        getRemotes: jest.fn().mockResolvedValue([{ name: 'origin', refs: { fetch: 'https://github.com/o/r.git' } }]),
        remote: jest.fn(),
      } as any;
      await commitAndPush(git, 'msg', ['.'], 'feature/x', 'r');
      expect(git.remote).toHaveBeenCalledWith(['set-url', 'origin', 'https://tok@github.com/o/r.git']);
      expect(git.push).toHaveBeenCalledWith('origin', 'feature/x', ['--force']);
    });

    it('throws GitPushError on push failure', async () => {
      const git = {
        add: jest.fn(),
        commit: jest.fn(),
        push: jest.fn().mockRejectedValue(new Error('rejected')),
        getRemotes: jest.fn().mockResolvedValue([]),
      } as any;
      await expect(commitAndPush(git, 'msg', ['.'], 'feature/x')).rejects.toBeInstanceOf(Error);
    });
  });

  describe('classifyAxiosError', () => {
    it('classifies 403 as GitHubAuthError', async () => {
      process.env.GITHUB_TOKEN = 'tok';
      mockedAxios.post.mockRejectedValue({ response: { status: 403 }, isAxiosError: true });
      mockedAxios.isAxiosError.mockReturnValue(true);
      await expect(createGitHubPR({ owner: 'o', repo: 'r', title: 't', body: 'b', head: 'h', base: 'main' })).rejects.toBeInstanceOf(GitHubAuthError);
    });

    it('classifies 404 as GitHubNotFoundError', async () => {
      process.env.GITHUB_TOKEN = 'tok';
      mockedAxios.post.mockRejectedValue({ response: { status: 404 }, isAxiosError: true });
      mockedAxios.isAxiosError.mockReturnValue(true);
      await expect(createGitHubPR({ owner: 'o', repo: 'r', title: 't', body: 'b', head: 'h', base: 'main' })).rejects.toBeInstanceOf(GitHubNotFoundError);
    });

    it('classifies 500 as GitHubError', async () => {
      process.env.GITHUB_TOKEN = 'tok';
      mockedAxios.post.mockRejectedValue({ response: { status: 500 }, isAxiosError: true });
      mockedAxios.isAxiosError.mockReturnValue(true);
      await expect(createGitHubPR({ owner: 'o', repo: 'r', title: 't', body: 'b', head: 'h', base: 'main' })).rejects.toBeInstanceOf(Error);
    });
  });

  describe('createGitHubPR', () => {
    it('returns dry-run URL when token missing', async () => {
      const result = await createGitHubPR({ owner: 'o', repo: 'r', title: 't', body: 'b', head: 'h', base: 'main' });
      expect(result.url).toContain('dry-run');
      expect(result.number).toBe(0);
    });

    it('creates PR when token present', async () => {
      process.env.GITHUB_TOKEN = 'tok';
      mockedAxios.post.mockResolvedValue({ data: { html_url: 'https://github.com/o/r/pull/1', id: 123, number: 1 } } as any);
      const result = await createGitHubPR({ owner: 'o', repo: 'r', title: 't', body: 'b', head: 'h', base: 'main' });
      expect(result.url).toBe('https://github.com/o/r/pull/1');
      expect(mockedAxios.post).toHaveBeenCalled();
    });

    it('returns existing PR on 422', async () => {
      process.env.GITHUB_TOKEN = 'tok';
      const axiosError = { response: { status: 422 } };
      mockedAxios.post.mockRejectedValue(axiosError);
      mockedAxios.get.mockResolvedValue({ data: [{ html_url: 'https://github.com/o/r/pull/2', id: 456, number: 2 }] } as any);
      const result = await createGitHubPR({ owner: 'o', repo: 'r', title: 't', body: 'b', head: 'h', base: 'main' });
      expect(result.url).toBe('https://github.com/o/r/pull/2');
    });

    it('throws GitHubAuthError on 401', async () => {
      process.env.GITHUB_TOKEN = 'tok';
      mockedAxios.post.mockRejectedValue({ response: { status: 401 }, isAxiosError: true });
      mockedAxios.isAxiosError.mockReturnValue(true);
      await expect(createGitHubPR({ owner: 'o', repo: 'r', title: 't', body: 'b', head: 'h', base: 'main' })).rejects.toBeInstanceOf(GitHubAuthError);
    });
  });

  describe('addJiraComment', () => {
    it('skips when credentials missing', async () => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      await addJiraComment('T-1', 'hello');
      expect(log).toHaveBeenCalledWith('[Jira] Skipping comment - credentials not configured');
      log.mockRestore();
    });

    it('posts comment when credentials present', async () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_EMAIL = 'user@example.com';
      process.env.JIRA_API_TOKEN = 'tok';
      mockedAxios.post.mockResolvedValue({} as any);
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      await addJiraComment('T-1', 'hello');
      expect(mockedAxios.post).toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith('[Jira] Comment added to T-1');
      log.mockRestore();
    });
  });
});
