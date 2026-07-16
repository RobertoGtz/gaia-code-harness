/**
 * @fileoverview Repository setup utilities
 * @description Shared logic to prepare a job's repository workspace
 * @module tools/repo
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import simpleGit from 'simple-git';
import { cloneRepository } from './git';
import { copyDirectory, fileExists } from './file';
import { CodeGenerationJob } from '../types';

async function copyDartToolDirs(sourceRoot: string, destRoot: string): Promise<void> {
  async function walk(srcDir: string, dstDir: string): Promise<void> {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(srcDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '.git' || entry.name === 'build') continue;
      const srcChild = path.join(srcDir, entry.name);
      const dstChild = path.join(dstDir, entry.name);
      if (entry.name === '.dart_tool') {
        if (!await fileExists(dstChild)) {
          try { await copyDirectory(srcChild, dstChild); } catch { /* best-effort */ }
        }
      } else {
        await walk(srcChild, dstChild);
      }
    }
  }
  await walk(sourceRoot, destRoot);
}

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
 * Read the origin remote from a local git repo and return a normalized GitHub URL.
 * Returns undefined if the remote is not a GitHub URL.
 */
async function getGitHubRemoteUrl(localRepoPath: string): Promise<string | undefined> {
  try {
    const git = simpleGit(localRepoPath);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    const url = origin?.refs.fetch || origin?.refs.push;
    if (!url) return undefined;
    const match = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) {
      return `https://github.com/${match[1]}/${match[2]}.git`;
    }
  } catch {
    // ignore
  }
  return undefined;
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
          // Preserve the real GitHub upstream so pushes and PRs go to the right owner/repo.
          const upstreamUrl = await getGitHubRemoteUrl(localRepo);
          if (upstreamUrl) {
            const git = simpleGit(repoPath);
            await git.remote(['set-url', 'origin', upstreamUrl]);
          }
          // Preserve resolved Tuist plugin cache so tuist install/generate does not
          // need to re-download private dependencies (e.g. Rappi plugin repos).
          const tuistBuildSource = path.join(localRepo, 'Tuist', '.build');
          const tuistBuildDest = path.join(repoPath, 'Tuist', '.build');
          if (await fileExists(tuistBuildSource) && !await fileExists(tuistBuildDest)) {
            try {
              await copyDirectory(tuistBuildSource, tuistBuildDest);
            } catch {
              // best-effort — tuist install will attempt to resolve fresh
            }
          }
          // Preserve resolved Dart/Flutter dependency caches so melos bootstrap and
          // flutter pub get can skip Flutter cache writes that fail under macOS sandbox
          // restrictions. Walk the repo tree and copy every .dart_tool directory found.
          await copyDartToolDirs(localRepo, repoPath);
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
    const owner = fullRepo.split('/')[0];
    const isRppCo = owner === 'rpp-co';
    const token = isRppCo
      ? (process.env.GITHUB_TOKEN_RPP || process.env.GITHUB_TOKEN)
      : process.env.GITHUB_TOKEN;
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
