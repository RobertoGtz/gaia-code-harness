/**
 * @fileoverview Git operations
 * @description Git commands and GitHub API integration
 * @module tools/git
 */

import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';
import axios, { AxiosError } from 'axios';

// ─── GitHub-specific errors ───────────────────────────────────────────────────

export class GitHubError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'GitHubError';
  }
}

export class GitHubAuthError extends GitHubError {
  constructor(operation: string) {
    super(
      `[GitHub] Authentication failed while ${operation}. ` +
      'Verify GITHUB_TOKEN is set and has the "repo" scope.',
      401
    );
    this.name = 'GitHubAuthError';
  }
}

export class GitHubNotFoundError extends GitHubError {
  constructor(repo: string) {
    super(
      `[GitHub] Repository "${repo}" not found or not accessible. ` +
      'Check GITHUB_OWNER, the repo name, and that GITHUB_TOKEN has read access.',
      404
    );
    this.name = 'GitHubNotFoundError';
  }
}

export class GitHubPRError extends GitHubError {
  constructor(owner: string, repo: string, detail: string) {
    super(
      `[GitHub] Failed to create PR on ${owner}/${repo}: ${detail}`,
      undefined
    );
    this.name = 'GitHubPRError';
  }
}

export class GitPushError extends GitHubError {
  constructor(branch: string, cause: string) {
    super(
      `[Git] Push to "${branch}" failed: ${cause}. ` +
      'Check GITHUB_TOKEN permissions and that the branch has no protected rules.',
      undefined
    );
    this.name = 'GitPushError';
  }
}

function classifyAxiosError(err: AxiosError, context: string): GitHubError {
  const status = err.response?.status;
  const detail = (err.response?.data as any)?.message ?? err.message;
  if (status === 401 || status === 403) return new GitHubAuthError(context);
  if (status === 404) return new GitHubNotFoundError(context);
  return new GitHubError(`[GitHub] ${context}: HTTP ${status} — ${detail}`, status);
}

/**
 * Configuration for Git operations
 */
export interface GitConfig {
  /** URL of the remote repository */
  repoUrl: string;
  /** Default branch name */
  branch: string;
  /** Optional authentication credentials */
  auth?: {
    username: string;
    password: string;
  };
}

/**
 * Clone a Git repository to a local directory.
 * Supports authentication via username/password in URL.
 * 
 * @param repoUrl - Remote repository URL (HTTPS)
 * @param targetPath - Local directory to clone into
 * @param branch - Branch to checkout (default: 'main')
 * @param auth - Optional credentials { username, password }
 * @throws Error if clone fails
 * @example
 * await cloneRepository(
 *   'https://github.com/mi-org/mi-repo.git',
 *   '/workspace/repo',
 *   'develop'
 * );
 */
export async function cloneRepository(
  repoUrl: string,
  targetPath: string,
  branch: string = 'main',
  auth?: { username: string; password: string }
): Promise<void> {
  const git = simpleGit();
  
  let url = repoUrl;
  if (auth) {
    url = repoUrl.replace('https://', `https://${auth.username}:${auth.password}@`);
  }
  
  await git.clone(url, targetPath, ['--branch', branch, '--single-branch']);
}

/**
 * Initialize a SimpleGit instance for a directory.
 * Returns configured SimpleGit instance for operations.
 * 
 * @param workspacePath - Path to Git repository
 * @returns SimpleGit instance
 * @example
 * const git = initGit('/workspace/repo');
 * await git.status();
 */
export function initGit(workspacePath: string): SimpleGit {
  return simpleGit(workspacePath);
}

/**
 * Create and checkout a new Git branch.
 * 
 * @param git - SimpleGit instance
 * @param branchName - Name for the new branch
 * @param fromBranch - Source branch to branch from
 * @throws Error if branch creation fails
 * @example
 * await createBranch(git, 'feature/PROJ-123-banner', 'develop');
 */
export async function createBranch(
  git: SimpleGit,
  branchName: string,
  fromBranch: string
): Promise<void> {
  // Ensure we're on the source branch first
  await git.checkout(fromBranch);
  // Delete existing branch if it exists (from previous runs)
  try {
    await git.deleteLocalBranch(branchName, true);
  } catch { /* branch didn't exist, that's fine */ }
  // Create and checkout the new branch
  await git.checkoutLocalBranch(branchName);
}

/**
 * Stage files, commit with message, and push to remote.
 * 
 * @param git - SimpleGit instance
 * @param message - Commit message
 * @param files - Files to stage (default: ['.'] for all)
 * @param branch - Branch to push (optional)
 * @throws Error if commit or push fails
 * @example
 * await commitAndPush(
 *   git,
 *   'feat: Add promotional banner\n\nCloses PROJ-123',
 *   ['.'],
 *   'feature/PROJ-123-banner'
 * );
 */
/**
 * Parse owner/repo from the local git remote origin URL.
 * Falls back to job.repo / GITHUB_OWNER if no origin remote exists.
 */
export async function parseGitHubRepoFromRemote(
  git: SimpleGit,
  jobRepo: string
): Promise<{ owner: string; repo: string }> {
  const fallbackOwner = jobRepo.includes('/') ? jobRepo.split('/')[0] : (process.env.GITHUB_OWNER || '');
  const fallbackRepo = jobRepo.includes('/') ? jobRepo.split('/')[1] : jobRepo;

  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    const url = origin?.refs.fetch || origin?.refs.push;
    if (url) {
      const match = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
      if (match) {
        return { owner: match[1], repo: match[2] };
      }
    }
  } catch {
    // ignore
  }

  return { owner: fallbackOwner, repo: fallbackRepo };
}

/**
 * Files that must never be staged or committed by the harness.
 * These are local-only artifacts (credentials, lock overrides, generated caches).
 */
const NEVER_COMMIT_PATTERNS = [
  'pubspec_overrides.yaml',
  '**/pubspec_overrides.yaml',
  '.dart_tool/',
  '.packages',
  '.flutter-plugins',
  '.flutter-plugins-dependencies',
  'build/',
];

export async function commitAndPush(
  git: SimpleGit,
  message: string,
  files: string[] = ['.'],
  branch?: string,
  repo?: string
): Promise<void> {
  await git.add(files);
  // Unstage files that must never be committed (credentials, overrides, caches)
  try {
    await git.reset(['HEAD', '--', ...NEVER_COMMIT_PATTERNS]);
  } catch {
    // Some patterns may not be staged — that's fine, reset is best-effort
  }
  // Also restore any modified pubspec_overrides.yaml to avoid dirty tree issues
  try {
    await git.checkout(['--', '**/pubspec_overrides.yaml', 'pubspec_overrides.yaml']);
  } catch {
    // File may not exist in index — ignore
  }
  await git.commit(message);
  if (branch) {
    // If GITHUB_TOKEN is available, inject it into the existing origin URL so
    // we push back to the same remote the repo came from (local or GitHub clone).
    const repoOwner = repo?.includes('/') ? repo.split('/')[0] : '';
    const isRppCo = repoOwner === 'rpp-co';
    const token = isRppCo
      ? (process.env.GITHUB_TOKEN_RPP || process.env.GITHUB_TOKEN)
      : process.env.GITHUB_TOKEN;
    if (token) {
      try {
        const remotes = await git.getRemotes(true);
        const origin = remotes.find(r => r.name === 'origin');
        const baseUrl = origin?.refs.fetch || origin?.refs.push || (repo ? `https://github.com/${repo.includes('/') ? repo : `${process.env.GITHUB_OWNER || ''}/${repo}`}.git` : undefined);
        if (baseUrl) {
          const authUrl = baseUrl.replace(/^https:\/\//, `https://${token}@`).replace(/^https:\/\/[^@]+@/, `https://${token}@`);
          await git.remote(['set-url', 'origin', authUrl]);
        }
      } catch {
        // origin might not exist yet; push will fail cleanly below with details
      }
    }
    try {
      await git.push('origin', branch, ['--force']);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      throw new GitPushError(branch, msg);
    }
  }
}

/**
 * Generate a Git branch name from Jira ticket and feature title.
 * Format: feature/{ticketId}-{sanitized-title}
 * Sanitizes: lowercase, replaces spaces with hyphens, removes special chars.
 * 
 * @param ticketId - Jira ticket ID (e.g., 'PROJ-123')
 * @param title - Feature title
 * @returns Sanitized branch name
 * @example
 * const branch = generateBranchName('PROJ-123', 'Add Banner');
 * // Returns: 'feature/PROJ-123-add-banner'
 */
export function generateBranchName(ticketId: string, title: string): string {
  const sanitized = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40);
  
  return `feature/${ticketId}-${sanitized}`;
}

/**
 * Get list of modified, created, and renamed files in the working directory.
 * Used by ReviewerAgent to verify change limits.
 * 
 * @param git - SimpleGit instance
 * @returns Array of file paths
 * @example
 * const files = await getModifiedFiles(git);
 * // ['lib/main.dart', 'test/main_test.dart']
 */
export async function getModifiedFiles(git: SimpleGit): Promise<string[]> {
  const status = await git.status();
  return [
    ...status.modified,
    ...status.created,
    ...status.renamed.map(r => r.to),
  ];
}

/**
 * Create a Pull Request on GitHub via API.
 * Requires GITHUB_TOKEN environment variable with 'repo' scope.
 * 
 * @param options - PR configuration
 * @param options.owner - GitHub organization or user
 * @param options.repo - Repository name
 * @param options.title - PR title
 * @param options.body - PR description (markdown)
 * @param options.head - Branch with changes
 * @param options.base - Target branch for merge
 * @returns Promise resolving to PR details
 * @throws Error if GITHUB_TOKEN not set or API call fails
 * @example
 * const pr = await createGitHubPR({
 *   owner: 'mi-org',
 *   repo: 'mi-repo',
 *   title: '[PROJ-123] Add promotional banner',
 *   body: '## Changes\n- Added banner widget',
 *   head: 'feature/PROJ-123-banner',
 *   base: 'develop'
 * });
 * // pr.url: 'https://github.com/mi-org/mi-repo/pull/123'
 */
export async function createGitHubPR(options: {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
}): Promise<{ url: string; id: string; number: number }> {
  const { owner, repo, title, body, head, base } = options;
  
  const isRppCo = owner === 'rpp-co';
  const githubToken = isRppCo
    ? (process.env.GITHUB_TOKEN_RPP || process.env.GITHUB_TOKEN)
    : process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.log('[GitHub] GITHUB_TOKEN not set - running in dry-run mode, PR not actually created');
    return {
      url: `https://github.com/${owner}/${repo}/pull/dry-run (not created - GITHUB_TOKEN missing)`,
      id: 'dry-run',
      number: 0,
    };
  }

  try {
    const response = await axios.post(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        title,
        body,
        head,
        base,
      },
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    return {
      url: response.data.html_url,
      id: response.data.id,
      number: response.data.number,
    };
  } catch (error: any) {
    // 422 = PR already exists for this branch — fetch and return the existing one
    if (error?.response?.status === 422) {
      try {
        const existing = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${head}&base=${base}&state=open`,
          { headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github.v3+json' } }
        );
        if (existing.data.length > 0) {
          return {
            url: existing.data[0].html_url,
            id: existing.data[0].id,
            number: existing.data[0].number,
          };
        }
      } catch (fetchErr: any) {
        throw classifyAxiosError(fetchErr, `listing PRs for ${owner}/${repo}`);
      }
      throw new GitHubPRError(owner, repo, 'Branch already has a PR but it could not be found');
    }
    if (axios.isAxiosError(error)) {
      throw classifyAxiosError(error, `creating PR on ${owner}/${repo}`);
    }
    throw new GitHubPRError(owner, repo, error?.message ?? String(error));
  }
}

/**
 * Add a comment to a Jira ticket via API.
 * Requires JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN environment variables.
 * Non-critical: failures are logged but not thrown.
 * 
 * @param ticketId - Jira ticket ID (e.g., 'PROJ-123')
 * @param comment - Comment text (markdown supported)
 * @example
 * await addJiraComment('PROJ-123', 'PR created: https://github.com/...');
 * // Adds comment to ticket, logs if credentials not configured
 */
export async function addJiraComment(ticketId: string, comment: string): Promise<void> {
  const jiraBaseUrl = process.env.JIRA_BASE_URL;
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraToken = process.env.JIRA_API_TOKEN;

  if (!jiraBaseUrl || !jiraEmail || !jiraToken) {
    console.log('[Jira] Skipping comment - credentials not configured');
    return;
  }

  try {
    await axios.post(
      `${jiraBaseUrl}/rest/api/2/issue/${ticketId}/comment`,
      { body: comment },
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[Jira] Comment added to ${ticketId}`);
  } catch (error) {
    console.error(`[Jira] Failed to add comment: ${error}`);
    // Don't throw - non-critical
  }
}
