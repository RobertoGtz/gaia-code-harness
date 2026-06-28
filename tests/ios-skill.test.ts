/**
 * Unit tests for IosSkill (src/skills/ios/index.ts).
 * Mocks the xcode-runner toolchain functions — no shell or filesystem access.
 */
import { IosSkill } from '../src/skills/ios';
import * as xcodeRunner from '../src/tools/xcode-runner';
import * as fs from 'fs/promises';

jest.mock('../src/tools/xcode-runner', () => ({
  verifyIosEnvironment: jest.fn(),
  runSwiftPackageResolve: jest.fn(),
  runSwiftTests: jest.fn(),
  runSwiftLint: jest.fn(),
  runXcodeBuild: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  readdir: jest.fn(),
}));

const mockedVerifyIosEnvironment = xcodeRunner.verifyIosEnvironment as jest.MockedFunction<typeof xcodeRunner.verifyIosEnvironment>;
const mockedRunSwiftPackageResolve = xcodeRunner.runSwiftPackageResolve as jest.MockedFunction<typeof xcodeRunner.runSwiftPackageResolve>;
const mockedRunSwiftTests = xcodeRunner.runSwiftTests as jest.MockedFunction<typeof xcodeRunner.runSwiftTests>;
const mockedRunSwiftLint = xcodeRunner.runSwiftLint as jest.MockedFunction<typeof xcodeRunner.runSwiftLint>;
const mockedRunXcodeBuild = xcodeRunner.runXcodeBuild as jest.MockedFunction<typeof xcodeRunner.runXcodeBuild>;
const mockedReaddir = fs.readdir as unknown as jest.Mock<any, any>;

function mockHasXcodeProject(hasProject = true) {
  mockedReaddir.mockResolvedValue(hasProject ? ['RappiMonorepo.xcworkspace'] : ['Package.swift']);
}

function successResult(command: string): any {
  return { passed: true, command, stdout: '', stderr: '', exitCode: 0, duration: 100 };
}

function failureResult(command: string): any {
  return { passed: false, command, stdout: '', stderr: 'error', exitCode: 1, duration: 100 };
}

describe('IosSkill', () => {
  let skill: IosSkill;

  beforeEach(() => {
    skill = new IosSkill();
    jest.clearAllMocks();
  });

  describe('verifyEnvironment', () => {
    it('returns valid environment result', async () => {
      mockedVerifyIosEnvironment.mockResolvedValue({ valid: true, errors: [] });
      const result = await skill.verifyEnvironment('/repo');
      expect(result.valid).toBe(true);
      expect(mockedVerifyIosEnvironment).toHaveBeenCalledWith('/repo');
    });

    it('throws GaiaEnvError when invalid', async () => {
      mockedVerifyIosEnvironment.mockResolvedValue({ valid: false, errors: ['Xcode missing'] });
      await expect(skill.verifyEnvironment('/repo')).rejects.toThrow('[iOS] Xcode / Swift toolchain not found');
    });
  });

  describe('build', () => {
    it('uses xcodebuild when Tuist workspace exists', async () => {
      mockHasXcodeProject(true);
      mockedRunXcodeBuild.mockResolvedValue(successResult('xcodebuild build'));
      const result = await skill.build('/repo', 'PayInsurance');
      expect(result.passed).toBe(true);
      expect(mockedRunXcodeBuild).toHaveBeenCalledWith('/repo', 'PayInsurance');
      expect(mockedRunSwiftPackageResolve).not.toHaveBeenCalled();
    });

    it('uses xcodebuild with default App scheme when no module provided', async () => {
      mockHasXcodeProject(true);
      mockedRunXcodeBuild.mockResolvedValue(successResult('xcodebuild build'));
      const result = await skill.build('/repo');
      expect(result.passed).toBe(true);
      expect(mockedRunXcodeBuild).toHaveBeenCalledWith('/repo', 'App');
    });

    it('uses swift package resolve for SPM-only repo', async () => {
      mockHasXcodeProject(false);
      mockedRunSwiftPackageResolve.mockResolvedValue(successResult('swift package resolve'));
      const result = await skill.build('/repo');
      expect(result.passed).toBe(true);
      expect(mockedRunSwiftPackageResolve).toHaveBeenCalledWith('/repo');
      expect(mockedRunXcodeBuild).not.toHaveBeenCalled();
    });

    it('throws GaiaBuildError when xcodebuild fails', async () => {
      mockHasXcodeProject(true);
      mockedRunXcodeBuild.mockResolvedValue(failureResult('xcodebuild build'));
      await expect(skill.build('/repo', 'PayInsurance')).rejects.toThrow('[iOS] `xcodebuild build -scheme PayInsurance` failed');
    });

    it('detects xcodebuild project from .xcodeproj alone', async () => {
      mockedReaddir.mockResolvedValue(['App.xcodeproj']);
      mockedRunXcodeBuild.mockResolvedValue(successResult('xcodebuild build'));
      const result = await skill.build('/repo');
      expect(result.passed).toBe(true);
      expect(mockedRunXcodeBuild).toHaveBeenCalledWith('/repo', 'App');
      expect(mockedRunSwiftPackageResolve).not.toHaveBeenCalled();
    });

    it('detects xcodebuild project from Tuist.swift alone', async () => {
      mockedReaddir.mockResolvedValue(['Tuist.swift']);
      mockedRunXcodeBuild.mockResolvedValue(successResult('xcodebuild build'));
      const result = await skill.build('/repo');
      expect(result.passed).toBe(true);
      expect(mockedRunXcodeBuild).toHaveBeenCalledWith('/repo', 'App');
    });

    it('detects xcodebuild project from Workspace.swift alone', async () => {
      mockedReaddir.mockResolvedValue(['Workspace.swift']);
      mockedRunXcodeBuild.mockResolvedValue(successResult('xcodebuild build'));
      const result = await skill.build('/repo');
      expect(result.passed).toBe(true);
      expect(mockedRunXcodeBuild).toHaveBeenCalledWith('/repo', 'App');
    });

    it('falls back to swift package resolve when readdir fails', async () => {
      mockedReaddir.mockRejectedValue(new Error('EACCES'));
      mockedRunSwiftPackageResolve.mockResolvedValue(successResult('swift package resolve'));
      const result = await skill.build('/repo');
      expect(result.passed).toBe(true);
      expect(mockedRunSwiftPackageResolve).toHaveBeenCalledWith('/repo');
      expect(mockedRunXcodeBuild).not.toHaveBeenCalled();
    });
  });

  describe('test', () => {
    it('runs tests and returns success', async () => {
      mockedRunSwiftTests.mockResolvedValue(successResult('xcodebuild test'));
      const result = await skill.test('/repo', 'PayInsurance');
      expect(result.passed).toBe(true);
      expect(mockedRunSwiftTests).toHaveBeenCalledWith('/repo', 'PayInsurance');
    });

    it('throws GaiaTestError when tests fail', async () => {
      mockedRunSwiftTests.mockResolvedValue(failureResult('xcodebuild test'));
      await expect(skill.test('/repo', 'PayInsurance')).rejects.toThrow('[iOS] tests failed');
    });
  });

  describe('analyze', () => {
    it('runs SwiftLint and returns success', async () => {
      mockedRunSwiftLint.mockResolvedValue(successResult('swiftlint lint'));
      const result = await skill.analyze('/repo');
      expect(result.passed).toBe(true);
      expect(mockedRunSwiftLint).toHaveBeenCalledWith('/repo', undefined);
    });

    it('runs SwiftLint with module for monorepo features', async () => {
      mockedRunSwiftLint.mockResolvedValue(successResult('swiftlint lint'));
      const result = await skill.analyze('/repo', 'PayInsurance');
      expect(result.passed).toBe(true);
      expect(mockedRunSwiftLint).toHaveBeenCalledWith('/repo', 'PayInsurance');
    });

    it('throws GaiaTestError when SwiftLint fails', async () => {
      mockedRunSwiftLint.mockResolvedValue(failureResult('swiftlint lint'));
      await expect(skill.analyze('/repo')).rejects.toThrow('[iOS] SwiftLint found violations');
    });
  });

  describe('getPromptContext', () => {
    it('returns context with module-specific placeholders', () => {
      const ctx = skill.getPromptContext({ title: 'Add feature', module: 'PayInsurance', repo: 'ios-rappi-main' });
      expect(ctx.specSystem).toContain('Tuist-based modular monorepo');
      expect(ctx.implementerSystem).toContain('PayInsuranceFeature');
      expect(ctx.implementerSystem).toContain('PayInsuranceFeatureInterface');
      expect(ctx.filePatterns.source).toContain('PayInsuranceFeature/Sources/');
      expect(ctx.filePatterns.interface).toContain('PayInsuranceFeatureInterface/Sources/');
      expect(ctx.forbidden).toContain('feature importing another feature module directly');
    });

    it('uses default module name when module is omitted', () => {
      const ctx = skill.getPromptContext({ title: 'Add feature', repo: 'ios-rappi-main' });
      expect(ctx.implementerSystem).toContain('FeatureFeature');
      expect(ctx.filePatterns.source).toContain('FeatureFeature/Sources/');
    });
  });
});
