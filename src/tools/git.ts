/**
 * @fileoverview Git operations
 * @description Git commands and GitHub API integration
 * @module tools/git
 */

import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';
import axios from 'axios';

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
 *   'https://github.com/rappi/repo.git',
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
 * await createBranch(git, 'feature/RPP-1234-banner', 'develop');
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
 *   'feat: Add promotional banner\n\nCloses RPP-1234',
 *   ['.'],
 *   'feature/RPP-1234-banner'
 * );
 */
export async function commitAndPush(
  git: SimpleGit,
  message: string,
  files: string[] = ['.'],
  branch?: string,
  repo?: string
): Promise<void> {
  await git.add(files);
  await git.commit(message);
  if (branch) {
    // If GITHUB_TOKEN + repo provided, point origin to GitHub before pushing
    const token = process.env.GITHUB_TOKEN;
    if (token && repo) {
      const fullRepo = repo.includes('/') ? repo : `${process.env.GITHUB_OWNER || 'rappi'}/${repo}`;
      const githubUrl = `https://${token}@github.com/${fullRepo}.git`;
      try {
        await git.remote(['set-url', 'origin', githubUrl]);
      } catch {
        await git.remote(['add', 'origin', githubUrl]);
      }
    }
    await git.push('origin', branch, ['--force']);
  }
}

/**
 * Generate a Git branch name from Jira ticket and feature title.
 * Format: feature/{ticketId}-{sanitized-title}
 * Sanitizes: lowercase, replaces spaces with hyphens, removes special chars.
 * 
 * @param ticketId - Jira ticket ID (e.g., 'RPP-1234')
 * @param title - Feature title
 * @returns Sanitized branch name
 * @example
 * const branch = generateBranchName('RPP-1234', 'Add Banner');
 * // Returns: 'feature/RPP-1234-add-banner'
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
 *   owner: 'rappi',
 *   repo: 'rpp-pyme-multiplatform',
 *   title: '[RPP-1234] Add promotional banner',
 *   body: '## Changes\n- Added banner widget',
 *   head: 'feature/RPP-1234-banner',
 *   base: 'develop'
 * });
 * // pr.url: 'https://github.com/rappi/.../pull/123'
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
  
  const githubToken = process.env.GITHUB_TOKEN;
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
    }
    throw new Error(`Failed to create PR: ${error}`);
  }
}

/**
 * Add a comment to a Jira ticket via API.
 * Requires JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN environment variables.
 * Non-critical: failures are logged but not thrown.
 * 
 * @param ticketId - Jira ticket ID (e.g., 'RPP-1234')
 * @param comment - Comment text (markdown supported)
 * @example
 * await addJiraComment('RPP-1234', 'PR created: https://github.com/...');
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
