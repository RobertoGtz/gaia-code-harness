/**
 * Unit tests for Git/GitHub error classes (src/tools/git.ts).
 * No network calls, no filesystem access.
 */
import {
  GitHubError,
  GitHubAuthError,
  GitHubNotFoundError,
  GitHubPRError,
  GitPushError,
} from '../src/tools/git';

describe('Git/GitHub error classes', () => {
  describe('GitHubError', () => {
    it('sets name and message', () => {
      const err = new GitHubError('something went wrong', 500);
      expect(err.name).toBe('GitHubError');
      expect(err.message).toBe('something went wrong');
      expect(err.status).toBe(500);
    });

    it('status is optional', () => {
      const err = new GitHubError('no status');
      expect(err.status).toBeUndefined();
    });

    it('is an instance of Error', () => {
      expect(new GitHubError('x')).toBeInstanceOf(Error);
    });
  });

  describe('GitHubAuthError', () => {
    it('has status 401', () => {
      const err = new GitHubAuthError('cloning repo');
      expect(err.status).toBe(401);
    });

    it('mentions GITHUB_TOKEN in the message', () => {
      const err = new GitHubAuthError('cloning repo');
      expect(err.message).toContain('GITHUB_TOKEN');
    });

    it('name is GitHubAuthError', () => {
      expect(new GitHubAuthError('x').name).toBe('GitHubAuthError');
    });

    it('is an instance of GitHubError', () => {
      expect(new GitHubAuthError('x')).toBeInstanceOf(GitHubError);
    });
  });

  describe('GitHubNotFoundError', () => {
    it('has status 404', () => {
      const err = new GitHubNotFoundError('mi-org/mi-repo');
      expect(err.status).toBe(404);
    });

    it('includes the repo name in the message', () => {
      const err = new GitHubNotFoundError('mi-org/mi-repo');
      expect(err.message).toContain('mi-org/mi-repo');
    });

    it('mentions GITHUB_OWNER in the message', () => {
      expect(new GitHubNotFoundError('x').message).toContain('GITHUB_OWNER');
    });

    it('name is GitHubNotFoundError', () => {
      expect(new GitHubNotFoundError('x').name).toBe('GitHubNotFoundError');
    });
  });

  describe('GitHubPRError', () => {
    it('includes owner, repo, and detail in message', () => {
      const err = new GitHubPRError('mi-org', 'mi-repo', 'branch not found');
      expect(err.message).toContain('mi-org/mi-repo');
      expect(err.message).toContain('branch not found');
    });

    it('name is GitHubPRError', () => {
      expect(new GitHubPRError('o', 'r', 'd').name).toBe('GitHubPRError');
    });

    it('is an instance of GitHubError', () => {
      expect(new GitHubPRError('o', 'r', 'd')).toBeInstanceOf(GitHubError);
    });
  });

  describe('GitPushError', () => {
    it('includes branch name and cause in message', () => {
      const err = new GitPushError('feature/my-branch', 'protected branch rule');
      expect(err.message).toContain('feature/my-branch');
      expect(err.message).toContain('protected branch rule');
    });

    it('mentions GITHUB_TOKEN permissions in message', () => {
      expect(new GitPushError('b', 'c').message).toContain('GITHUB_TOKEN');
    });

    it('name is GitPushError', () => {
      expect(new GitPushError('b', 'c').name).toBe('GitPushError');
    });
  });
});
