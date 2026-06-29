/**
 * Unit tests for file.ts (src/tools/file.ts).
 * Mocks fs/promises — no real filesystem access.
 */
import * as fs from 'fs/promises';
import {
  readFile,
  writeFile,
  searchFiles,
  getDirectoryStructure,
  getRelevantFiles,
  applyPatch,
  copyDirectory,
  fileExists,
} from '../src/tools/file';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
  mkdir: jest.fn(),
  copyFile: jest.fn(),
}));

const mockedReadFile = fs.readFile as unknown as jest.Mock<any, any>;
const mockedWriteFile = fs.writeFile as unknown as jest.Mock<any, any>;
const mockedAccess = fs.access as unknown as jest.Mock<any, any>;
const mockedReaddir = fs.readdir as unknown as jest.Mock<any, any>;
const mockedStat = fs.stat as unknown as jest.Mock<any, any>;
const mockedMkdir = fs.mkdir as unknown as jest.Mock<any, any>;
const mockedCopyFile = fs.copyFile as unknown as jest.Mock<any, any>;

function dirent(name: string, isDir = false, isFile = true, isSym = false) {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => isFile,
    isSymbolicLink: () => isSym,
  };
}

describe('file tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readFile', () => {
    it('returns file content', async () => {
      mockedReadFile.mockResolvedValue('hello');
      const result = await readFile('/file.txt');
      expect(result).toBe('hello');
      expect(mockedReadFile).toHaveBeenCalledWith('/file.txt', 'utf-8');
    });

    it('throws on error', async () => {
      mockedReadFile.mockRejectedValue(new Error('ENOENT'));
      await expect(readFile('/file.txt')).rejects.toThrow('Failed to read file /file.txt');
    });
  });

  describe('writeFile', () => {
    it('creates directory and writes file', async () => {
      mockedMkdir.mockResolvedValue(undefined);
      mockedWriteFile.mockResolvedValue(undefined);
      await writeFile('/dir/file.txt', 'content');
      expect(mockedMkdir).toHaveBeenCalledWith('/dir', { recursive: true });
      expect(mockedWriteFile).toHaveBeenCalledWith('/dir/file.txt', 'content', 'utf-8');
    });

    it('throws on error', async () => {
      mockedMkdir.mockRejectedValue(new Error('fail'));
      await expect(writeFile('/dir/file.txt', 'content')).rejects.toThrow('Failed to write file /dir/file.txt');
    });
  });

  describe('searchFiles', () => {
    it('finds files matching a pattern', async () => {
      mockedReaddir.mockResolvedValue([dirent('a.ts', false, true), dirent('b.ts', false, true), dirent('node_modules', true)]);
      const result = await searchFiles('/repo', '*.ts');
      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('/repo/a.ts');
      expect(result[1].path).toBe('/repo/b.ts');
    });

    it('recurses into subdirectories', async () => {
      mockedReaddir.mockImplementation((dir: any) => {
        if (dir === '/repo') return Promise.resolve([dirent('src', true)]);
        if (dir === '/repo/src') return Promise.resolve([dirent('c.ts', false, true)]);
        return Promise.resolve([]);
      });
      const result = await searchFiles('/repo', '*.ts');
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/repo/src/c.ts');
    });

    it('skips excluded directories', async () => {
      mockedReaddir.mockResolvedValue([dirent('node_modules', true), dirent('a.ts', false, true)]);
      const result = await searchFiles('/repo', '*.ts');
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/repo/a.ts');
    });

    it('respects maxResults', async () => {
      mockedReaddir.mockResolvedValue([dirent('a.ts', false, true), dirent('b.ts', false, true)]);
      const result = await searchFiles('/repo', '*.ts', { maxResults: 1 });
      expect(result).toHaveLength(1);
    });

    it('returns empty when maxResults is 0', async () => {
      mockedReaddir.mockResolvedValue([dirent('a.ts', false, true)]);
      const result = await searchFiles('/repo', '*.ts', { maxResults: 0 });
      expect(result).toHaveLength(0);
    });

    it('stops exactly when maxResults reached', async () => {
      mockedReaddir.mockResolvedValue([dirent('a.ts', false, true), dirent('b.ts', false, true)]);
      const result = await searchFiles('/repo', '*.ts', { maxResults: 1 });
      expect(result).toHaveLength(1);
    });
  });

  describe('getDirectoryStructure', () => {
    it('returns files and directories up to maxDepth', async () => {
      mockedReaddir.mockImplementation((dir: any) => {
        if (dir === '/repo') return Promise.resolve([dirent('src', true), dirent('main.ts', false, true)]);
        if (dir === '/repo/src') return Promise.resolve([dirent('nested.ts', false, true)]);
        return Promise.resolve([]);
      });
      mockedStat.mockResolvedValue({ size: 10, isDirectory: () => false });
      const result = await getDirectoryStructure('/repo', 2);
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.some(r => r.path === '/repo/src')).toBe(true);
      expect(result.some(r => r.path === '/repo/main.ts')).toBe(true);
    });

    it('skips broken symlinks', async () => {
      mockedReaddir.mockResolvedValue([dirent('broken', false, false, true)]);
      mockedStat.mockRejectedValue(new Error('ENOENT'));
      const result = await getDirectoryStructure('/repo', 1);
      expect(result).toHaveLength(0);
    });

    it('respects maxFiles', async () => {
      mockedReaddir.mockResolvedValue([dirent('a.ts', false, true), dirent('b.ts', false, true)]);
      mockedStat.mockResolvedValue({ size: 1, isDirectory: () => false });
      const result = await getDirectoryStructure('/repo', 1, 1);
      expect(result).toHaveLength(1);
    });

    it('does not recurse beyond maxDepth', async () => {
      mockedReaddir.mockImplementation((dir: any) => {
        if (dir === '/repo') return Promise.resolve([dirent('src', true), dirent('a.ts', false, true)]);
        if (dir === '/repo/src') return Promise.resolve([dirent('b.ts', false, true)]);
        return Promise.resolve([]);
      });
      mockedStat.mockResolvedValue({ size: 1, isDirectory: () => false });
      const result = await getDirectoryStructure('/repo', 0);
      expect(result.some(r => r.path === '/repo/src/b.ts')).toBe(false);
      expect(result.some(r => r.path === '/repo/a.ts')).toBe(true);
    });

    it('recurses into nested directories', async () => {
      mockedReaddir.mockImplementation((dir: any) => {
        if (dir === '/repo') return Promise.resolve([dirent('src', true)]);
        if (dir === '/repo/src') return Promise.resolve([dirent('nested.ts', false, true)]);
        return Promise.resolve([]);
      });
      mockedStat.mockResolvedValue({ size: 1, isDirectory: () => false });
      const result = await getDirectoryStructure('/repo', 2);
      expect(result.some(r => r.path === '/repo/src/nested.ts')).toBe(true);
    });

    it('stops exactly when maxFiles reached', async () => {
      mockedReaddir.mockResolvedValue([dirent('a.ts', false, true), dirent('b.ts', false, true)]);
      mockedStat.mockResolvedValue({ size: 1, isDirectory: () => false });
      const result = await getDirectoryStructure('/repo', 1, 1);
      expect(result).toHaveLength(1);
    });

    it('does not skip non-excluded files', async () => {
      mockedReaddir.mockResolvedValue([dirent('a.ts', false, true)]);
      mockedStat.mockResolvedValue({ size: 1, isDirectory: () => false });
      const result = await getDirectoryStructure('/repo', 1);
      expect(result.some(r => r.path === '/repo/a.ts')).toBe(true);
    });
  });

  describe('getRelevantFiles', () => {
    it('finds lib and test files and pubspec', async () => {
      mockedReaddir.mockImplementation((dir: any) => {
        if (dir === '/repo/lib') return Promise.resolve([dirent('main.dart', false, true), dirent('main_test.dart', false, true)]);
        if (dir === '/repo/test') return Promise.resolve([]);
        return Promise.resolve([]);
      });
      mockedStat.mockResolvedValue({ size: 1, isDirectory: () => false });
      mockedAccess.mockResolvedValue(undefined);
      const result = await getRelevantFiles('/repo');
      expect(result.lib).toContain('main.dart');
      expect(result.test).toContain('main_test.dart');
      expect(result.pubspec).toBe(true);
    });
  });

  describe('applyPatch', () => {
    it('writes new content', async () => {
      mockedMkdir.mockResolvedValue(undefined);
      mockedWriteFile.mockResolvedValue(undefined);
      await applyPatch('/file.ts', 'old', 'new');
      expect(mockedWriteFile).toHaveBeenCalledWith('/file.ts', 'new', 'utf-8');
    });
  });

  describe('copyDirectory', () => {
    it('copies recursively skipping node_modules', async () => {
      mockedReaddir.mockImplementation((dir: any) => {
        if (dir === '/src') return Promise.resolve([dirent('file.ts', false, true), dirent('node_modules', true)]);
        return Promise.resolve([]);
      });
      mockedMkdir.mockResolvedValue(undefined);
      mockedCopyFile.mockResolvedValue(undefined);
      await copyDirectory('/src', '/dst');
      expect(mockedCopyFile).toHaveBeenCalledWith('/src/file.ts', '/dst/file.ts');
      expect(mockedCopyFile).not.toHaveBeenCalledWith('/src/node_modules', '/dst/node_modules');
    });
  });

  describe('fileExists', () => {
    it('returns true when access succeeds', async () => {
      mockedAccess.mockResolvedValue(undefined);
      const result = await fileExists('/file.txt');
      expect(result).toBe(true);
    });

    it('returns false when access fails', async () => {
      mockedAccess.mockRejectedValue(new Error('ENOENT'));
      const result = await fileExists('/file.txt');
      expect(result).toBe(false);
    });
  });
});
