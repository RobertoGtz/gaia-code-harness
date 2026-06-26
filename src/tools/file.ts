/**
 * @fileoverview File system utilities
 * @description File operations, searching, and manipulation for the harness
 * @module tools/file
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { minimatch } from 'minimatch';

/**
 * Information about a file or directory
 */
export interface FileInfo {
  /** Absolute path to the file/directory */
  path: string;
  /** Path relative to the search root */
  relativePath: string;
  /** File size in bytes */
  size: number;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** File extension (e.g., '.dart', '.ts') */
  extension?: string;
}

/**
 * Read the contents of a file as UTF-8 string.
 * 
 * @param filePath - Absolute or relative path to the file
 * @returns Promise resolving to file contents
 * @throws Error if file cannot be read
 * @example
 * const content = await readFile('/path/to/file.dart');
 * console.log(content);
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${error}`);
  }
}

/**
 * Write content to a file, creating parent directories if needed.
 * Uses recursive mkdir to ensure directory structure exists.
 * 
 * @param filePath - Path where file should be written
 * @param content - String content to write
 * @throws Error if file cannot be written
 * @example
 * await writeFile('/path/to/new/file.dart', 'class MyClass {}');
 * // Creates directories and writes file
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write file ${filePath}: ${error}`);
  }
}

/**
 * Search for files matching a glob pattern within a directory.
 * Supports wildcards (*, **) and minimatch patterns.
 * 
 * @param dir - Directory to search within
 * @param pattern - Glob pattern (e.g., '**\/*.dart', '*.ts')
 * @param options - Search configuration
 * @param options.recursive - Whether to search subdirectories (default: true)
 * @param options.excludeDirs - Directories to skip (default: ['node_modules', '.git'])
 * @param options.maxResults - Maximum files to return (default: 100)
 * @returns Promise resolving to array of matching files
 * @example
 * const dartFiles = await searchFiles('/project', '**\/*.dart', {
 *   excludeDirs: ['.dart_tool', 'build'],
 *   maxResults: 50
 * });
 */
export async function searchFiles(
  dir: string,
  pattern: string,
  options: { 
    recursive?: boolean;
    excludeDirs?: string[];
    maxResults?: number;
  } = {}
): Promise<FileInfo[]> {
  const { recursive = true, excludeDirs = ['node_modules', '.git', 'build', '.dart_tool'], maxResults = 100 } = options;
  const results: FileInfo[] = [];

  async function scan(currentDir: string) {
    if (results.length >= maxResults) return;
    
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(dir, fullPath);
      
      if (entry.isDirectory()) {
        if (recursive && !excludeDirs.includes(entry.name)) {
          await scan(fullPath);
        }
      } else {
        if (minimatch(entry.name, pattern) || minimatch(relativePath, pattern)) {
          const stats = await fs.stat(fullPath);
          results.push({
            path: fullPath,
            relativePath,
            size: stats.size,
            isDirectory: false,
            extension: path.extname(entry.name),
          });
        }
      }
    }
  }

  await scan(dir);
  return results;
}

/**
 * Get the complete directory structure up to a specified depth.
 * Returns all files and directories as FileInfo objects.
 * Useful for exploring project structure before generating specs.
 * 
 * @param dir - Root directory to explore
 * @param maxDepth - How many levels deep to traverse (default: 3)
 * @returns Promise resolving to array of FileInfo objects
 * @example
 * const structure = await getDirectoryStructure('/project', 3);
 * // Returns: [{ path, relativePath, size, isDirectory, extension }, ...]
 */
export async function getDirectoryStructure(
  dir: string,
  maxDepth: number = 3
): Promise<FileInfo[]> {
  const results: FileInfo[] = [];

  async function scan(currentDir: string, depth: number) {
    if (depth > maxDepth) return;
    
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(dir, fullPath);
      
      const stats = await fs.stat(fullPath);
      results.push({
        path: fullPath,
        relativePath,
        size: stats.size,
        isDirectory: entry.isDirectory(),
        extension: entry.isFile() ? path.extname(entry.name) : undefined,
      });
      
      if (entry.isDirectory() && !['node_modules', '.git', 'build', '.dart_tool'].includes(entry.name)) {
        await scan(fullPath, depth + 1);
      }
    }
  }

  await scan(dir, 0);
  return results;
}

/**
 * Get relevant source files for a project or module.
 * Searches srcDirs (defaults to lib + test) with the given extension.
 * Used by SpecAuthorAgent to understand project structure.
 * 
 * @param repoPath - Root path to the repository
 * @param module - Optional module name for monorepos
 * @param srcDirs - Source directories to search (default: ['lib', 'test'])
 * @param sourceExtension - File extension to match (default: 'dart')
 * @returns Object with source files, test files, and pubspec existence
 * @example
 * const files = await getRelevantFiles('/repo', 'home_module', ['lib', 'test'], 'dart');
 * // { lib: ['lib/main.dart', ...], test: ['test/widget_test.dart', ...], pubspec: true }
 */
export async function getRelevantFiles(
  repoPath: string,
  module?: string,
  srcDirs: string[] = ['lib', 'test'],
  sourceExtension = 'dart'
): Promise<{ lib: string[]; test: string[]; pubspec: boolean }> {
  const basePath = module ? path.join(repoPath, 'packages/features', module) : repoPath;
  const glob = `**/*.${sourceExtension}`;

  const allFiles: string[] = [];
  for (const dir of srcDirs) {
    try {
      const found = await searchFiles(path.join(basePath, dir), glob, { maxResults: 50 });
      allFiles.push(...found.map(f => f.relativePath));
    } catch {
      // dir may not exist for this platform — skip
    }
  }

  const testKeywords = ['test', 'Test', 'spec', 'Spec', '__tests__'];
  const testFiles = allFiles.filter(f => testKeywords.some(k => f.includes(k)));
  const libFiles  = allFiles.filter(f => !testKeywords.some(k => f.includes(k)));

  let pubspec = false;
  try {
    await fs.access(path.join(basePath, 'pubspec.yaml'));
    pubspec = true;
  } catch {
    // No pubspec.yaml — fine for non-Flutter platforms
  }

  return { lib: libFiles, test: testFiles, pubspec };
}

/**
 * Apply a patch/diff to a file.
 * Currently uses simple replacement - future: use proper diff algorithm.
 * 
 * @param filePath - Path to the file to patch
 * @param originalContent - Original file content (for verification)
 * @param newContent - New content to write
 * @throws Error if patch cannot be applied
 * @example
 * await applyPatch('/file.dart', originalCode, modifiedCode);
 */
export async function applyPatch(filePath: string, originalContent: string, newContent: string): Promise<void> {
  await writeFile(filePath, newContent);
}

/**
 * Copy a directory recursively from source to destination.
 * Creates destination directory if it doesn't exist.
 * Used for LOCAL_REPOS_PATH development workflow.
 * 
 * @param src - Source directory path
 * @param dest - Destination directory path
 * @throws Error if copy fails
 * @example
 * await copyDirectory('/local/repo', '/workspace/job-123/repo');
 */
export async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and .git for faster copy
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.dart_tool') {
        continue;
      }
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Check if a file or directory exists.
 * 
 * @param filePath - Path to check
 * @returns Promise resolving to true if exists, false otherwise
 * @example
 * const exists = await fileExists('/path/to/file');
 * if (exists) { ... }
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
