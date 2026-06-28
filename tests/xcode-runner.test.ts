/**
 * Unit tests for xcode-runner.ts (src/tools/xcode-runner.ts).
 * Mocks child_process.exec and fs/promises — no real shell or filesystem access.
 */
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import {
  runSwiftPackageResolve,
  runSwiftTests,
  runXcodeBuild,
  runSwiftLint,
  verifyIosEnvironment,
} from '../src/tools/xcode-runner';

jest.mock('child_process', () => ({ exec: jest.fn() }));
jest.mock('fs/promises', () => ({
  access: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
}));

const mockedExec = exec as unknown as jest.Mock<any, any>;
const mockedAccess = fs.access as unknown as jest.Mock<any, any>;
const mockedReaddir = fs.readdir as unknown as jest.Mock<any, any>;
const mockedStat = fs.stat as unknown as jest.Mock<any, any>;

function mockStat(dirs: string[]) {
  mockedStat.mockImplementation((p: any) => {
    if (dirs.includes(p as string)) {
      return Promise.resolve({ isDirectory: () => true });
    }
    return Promise.reject(new Error('ENOENT'));
  });
}

function mockExecSuccess(stdout = '', stderr = '') {
  mockedExec.mockImplementation((cmd: any, _opts: any, callback: any) => {
    if (typeof callback === 'function') {
      if (String(cmd).includes('xcrun simctl list devices')) {
        callback(null, { stdout: JSON.stringify({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-17-5': [{ name: 'iPhone 17 Pro', udid: 'E29BECD0-53E2-4B5F-9BBA-0BDE473121D5', state: 'Shutdown', isAvailable: true }] } }), stderr: '' });
        return undefined;
      }
      callback(null, { stdout, stderr });
    }
    return undefined;
  });
}

function mockExecFailure(code: number, stdout = '', stderr = '') {
  mockedExec.mockImplementation((_cmd: any, _opts: any, callback: any) => {
    if (typeof callback === 'function') {
      const err = new Error(stderr) as any;
      err.code = code;
      err.stdout = stdout;
      err.stderr = stderr;
      callback(err, { stdout, stderr });
    }
    return undefined;
  });
}

function mockReaddir(entries: (string | { name: string; isDirectory: () => boolean; parentPath?: string })[], root = '/repo') {
  mockedReaddir.mockImplementation((dir: any, options?: any) => {
    if (dir === root && !options?.recursive) {
      return Promise.resolve(entries.map(e => (typeof e === 'string' ? e : e.name)));
    }
    if (options?.recursive) {
      return Promise.resolve(
        entries.map(e => {
          if (typeof e === 'string') {
            return { name: e, isDirectory: () => e.endsWith('.xcodeproj') || e.endsWith('.xcworkspace'), parentPath: root };
          }
          return { name: e.name, isDirectory: e.isDirectory, parentPath: e.parentPath || root };
        })
      );
    }
    return Promise.resolve([]);
  });
}

function mockAccess(existingPaths: string[]) {
  mockedAccess.mockImplementation((p: any) => {
    if (existingPaths.includes(p as string)) return Promise.resolve();
    return Promise.reject(new Error('ENOENT'));
  });
}

describe('xcode-runner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecSuccess();
  });

  describe('verifyIosEnvironment', () => {
    it('returns valid when swift, xcodebuild, and project files exist', async () => {
      mockAccess(['/repo/Package.swift']);
      mockReaddir(['Package.swift'], '/repo');
      const result = await verifyIosEnvironment('/repo');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns invalid when swift is missing', async () => {
      mockExecFailure(127);
      mockAccess([]);
      mockReaddir(['Package.swift'], '/repo');
      const result = await verifyIosEnvironment('/repo');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Swift not found in PATH');
    });

    it('returns invalid when no project files exist', async () => {
      mockAccess([]);
      mockReaddir([], '/repo');
      const result = await verifyIosEnvironment('/repo');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No Package.swift, .xcodeproj, or .xcworkspace found');
    });
  });

  describe('runSwiftPackageResolve', () => {
    it('returns passed true on success', async () => {
      mockExecSuccess('resolved');
      const result = await runSwiftPackageResolve('/repo');
      expect(result.passed).toBe(true);
      expect(result.command).toBe('swift package resolve');
      expect(result.stdout).toContain('resolved');
    });

    it('returns passed false on failure', async () => {
      mockExecFailure(1, '', 'error');
      const result = await runSwiftPackageResolve('/repo');
      expect(result.passed).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('error');
    });
  });

  describe('runSwiftLint', () => {
    it('returns passed true on clean lint', async () => {
      mockExecSuccess('');
      const result = await runSwiftLint('/repo');
      expect(result.passed).toBe(true);
      expect(result.command).toBe('swiftlint lint');
    });

    it('returns passed false on violations', async () => {
      mockExecFailure(1, '', 'line 10: trailing whitespace');
      const result = await runSwiftLint('/repo');
      expect(result.passed).toBe(false);
      expect(result.stderr).toContain('trailing whitespace');
    });

    it('lints from module directory when module-specific .swiftlint.yml exists', async () => {
      mockExecSuccess('');
      mockStat(['/repo/features/PayInsurance/PayInsuranceFeature']);
      mockedAccess.mockImplementation((p: any) => {
        if (p === '/repo/features/PayInsurance/PayInsuranceFeature/.swiftlint.yml') return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });
      mockedReaddir.mockImplementation((dir: any) => {
        if (dir === '/repo/features/PayInsurance') return Promise.resolve(['PayInsuranceFeature']);
        return Promise.resolve([]);
      });
      const result = await runSwiftLint('/repo', 'PayInsurance');
      expect(result.passed).toBe(true);
      expect(mockedExec).toHaveBeenCalledWith(
        'swiftlint lint --quiet',
        expect.objectContaining({ cwd: '/repo/features/PayInsurance/PayInsuranceFeature' }),
        expect.any(Function)
      );
    });

    it('falls back to repo root when module has no .swiftlint.yml', async () => {
      mockExecSuccess('');
      mockedAccess.mockImplementation((p: any) => Promise.reject(new Error('ENOENT')));
      mockedReaddir.mockResolvedValue([]);
      const result = await runSwiftLint('/repo', 'UnknownModule');
      expect(result.passed).toBe(true);
      expect(mockedExec).toHaveBeenCalledWith(
        'swiftlint lint --quiet',
        expect.objectContaining({ cwd: '/repo' }),
        expect.any(Function)
      );
    });
  });

  describe('runSwiftTests with SPM', () => {
    it('runs swift build when Package.swift exists', async () => {
      mockAccess(['/repo/Package.swift']);
      mockExecSuccess('Build complete');
      const result = await runSwiftTests('/repo');
      expect(result.passed).toBe(true);
      expect(result.command).toBe('swift build');
      expect(result.stdout).toContain('Build complete');
    });
  });

  describe('runSwiftTests with Xcode project', () => {
    it('uses root xcworkspace when available', async () => {
      mockAccess([]);
      mockReaddir(['RappiMonorepo.xcworkspace'], '/repo');
      const result = await runSwiftTests('/repo');
      expect(result.passed).toBe(true);
      expect(result.command).toContain('xcodebuild test');
      expect(result.command).toContain('-workspace RappiMonorepo.xcworkspace');
      expect(result.command).toContain('-destination');
      expect(result.command).toContain('id=E29BECD0-53E2-4B5F-9BBA-0BDE473121D5');
    });

    it('falls back to module-specific xcodeproj when no workspace exists', async () => {
      mockAccess([]);
      mockReaddir(
        [
          { name: 'PayInsuranceFeature.xcodeproj', isDirectory: () => true, parentPath: '/repo/features/PayInsurance' },
        ],
        '/repo'
      );
      const result = await runSwiftTests('/repo', 'PayInsurance');
      expect(result.passed).toBe(true);
      expect(result.command).toContain('-project features/PayInsurance/PayInsuranceFeature.xcodeproj');
      expect(result.command).toContain('-scheme PayInsurance');
    });

    it('runs tuist generate when tuist config exists and no generated xcodeproj/workspace', async () => {
      mockAccess(['/repo/Tuist.swift']);
      mockReaddir(['Tuist.swift'], '/repo');
      let tuistCalled = false;
      mockedExec.mockImplementation((cmd: any, _opts: any, callback: any) => {
        if (typeof callback === 'function') {
          if (String(cmd).includes('xcrun simctl list devices')) {
            callback(null, { stdout: JSON.stringify({ devices: { 'iOS': [{ name: 'iPhone 17 Pro', udid: 'abc', state: 'Shutdown', isAvailable: true }] } }), stderr: '' });
            return undefined;
          }
          if (String(cmd).includes('tuist generate')) {
            tuistCalled = true;
            callback(null, { stdout: 'generated', stderr: '' });
            return undefined;
          }
          callback(null, { stdout: '', stderr: '' });
        }
        return undefined;
      });
      const result = await runSwiftTests('/repo');
      expect(result.passed).toBe(true);
      expect(tuistCalled).toBe(true);
      expect(result.command).toContain('xcodebuild test');
    });
  });

  describe('runXcodeBuild', () => {
    it('uses root xcworkspace when no scheme provided', async () => {
      mockReaddir(['RappiMonorepo.xcworkspace'], '/repo');
      const result = await runXcodeBuild('/repo');
      expect(result.passed).toBe(true);
      expect(result.command).toContain('xcodebuild build');
      expect(result.command).toContain('-workspace RappiMonorepo.xcworkspace');
      expect(result.command).toContain('-scheme App');
    });

    it('uses {scheme}Feature.xcodeproj when module-specific project found', async () => {
      mockReaddir(
        [
          { name: 'RappiCreditsHomeV2Feature.xcodeproj', isDirectory: () => true, parentPath: '/repo/features/Discovery' },
        ],
        '/repo'
      );
      const result = await runXcodeBuild('/repo', 'RappiCreditsHomeV2');
      expect(result.passed).toBe(true);
      expect(result.command).toContain('-project features/Discovery/RappiCreditsHomeV2Feature.xcodeproj');
      expect(result.command).toContain('-scheme RappiCreditsHomeV2');
    });

    it('returns passed false on xcodebuild failure', async () => {
      mockReaddir(['RappiMonorepo.xcworkspace'], '/repo');
      mockExecFailure(65, '', 'xcodebuild error');
      const result = await runXcodeBuild('/repo');
      expect(result.passed).toBe(false);
      expect(result.exitCode).toBe(65);
    });
  });
});
