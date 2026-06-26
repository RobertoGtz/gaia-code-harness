/**
 * @fileoverview Repository setup utilities
 * @description Shared logic to prepare a job's repository workspace
 * @module tools/repo
 */

import * as path from 'path';
import { cloneRepository } from './git';
import { copyDirectory, fileExists } from './file';
import { CodeGenerationJob } from '../types';

/**
 * Result of a repository setup operation
 */
export interface RepoSetupResult {
  /** Whether the repository is ready to use */
  success: boolean;
  /** Description of what happened */
  output: string;
  /** Error message if setup failed */
  error?: string;
}

/**
 * Setup the repository for a job's workspace.
 * Resolution order:
 * 1. If repoPath already exists, reuse it.
 * 2. If LOCAL_REPOS_PATH is configured and contains the repo, copy from there.
 * 3. Otherwise, clone from GitHub (GITHUB_OWNER/job.repo).
 *
 * @param job - The job with repo information
 * @param repoPath - Target path for the repository
 * @returns Promise resolving to setup result
 * @example
 * const setup = await setupRepository(job, '/workspace/job-123/repo');
 * if (!setup.success) throw new Error(setup.error);
 */
export async function setupRepository(
  job: Pick<CodeGenerationJob, 'repo' | 'targetBranch'>,
  repoPath: string
): Promise<RepoSetupResult> {
  // Check if repo already exists
  if (await fileExists(repoPath)) {
    return { success: true, output: 'Using existing repository' };
  }

  // Check if LOCAL_REPOS_PATH is configured
  const localReposPath = process.env.LOCAL_REPOS_PATH;
  if (localReposPath) {
    // job.repo may be 'owner/name' or just 'name'
    const repoName = job.repo.includes('/') ? job.repo.split('/').pop()! : job.repo;
    const localRepo = path.join(localReposPath, repoName);
    if (await fileExists(localRepo)) {
      try {
        // Use git clone from local path to preserve .git history
        const isGitRepo = await fileExists(path.join(localRepo, '.git'));
        if (isGitRepo) {
          await cloneRepository(localRepo, repoPath, job.targetBranch || 'develop');
          return { success: true, output: `Repository cloned from ${localRepo}` };
        }
        await copyDirectory(localRepo, repoPath);
        return { success: true, output: `Repository copied from ${localRepo}` };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Failed to setup from LOCAL_REPOS_PATH: ${error}`,
        };
      }
    }
  }

  // Fallback: clone from remote
  try {
    // job.repo may be 'owner/name' or just 'name'
    const fullRepo = job.repo.includes('/')
      ? job.repo
      : `${process.env.GITHUB_OWNER || ''}/${job.repo}`;
    const repoUrl = `https://github.com/${fullRepo}.git`;
    const token = process.env.GITHUB_TOKEN;
    const auth = token ? { username: 'x-access-token', password: token } : undefined;
    await cloneRepository(repoUrl, repoPath, job.targetBranch, auth);
    return { success: true, output: `Repository cloned from ${repoUrl}` };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: `Failed to clone repository: ${error}`,
    };
  }
}
