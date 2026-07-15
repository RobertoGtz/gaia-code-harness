/**
 * Unit tests for IosSkill (src/plugins/ios/index.ts).
 * Mocks the xcode-runner toolchain functions — no shell or filesystem access.
 */
import { IosSkill } from '../src/plugins/ios';
import * as xcodeRunner from '../src/tools/xcode-runner';
import * as fs from 'fs/promises';

jest.mock('../src/tools/xcode-runner', () => ({
  verifyIosEnvironment: jest.fn(),
  runSwiftPackageResolve: jest.fn(),
  runSwiftTests: jest.fn(),
  runSwiftLint: jest.fn(),
  runXcodeBuild: jest.fn(),
  runTuistBuild: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  readdir: jest.fn(),
}));

const mockedVerifyIosEnvironment = xcodeRunner.verifyIosEnvironment as jest.MockedFunction<typeof xcodeRunner.verifyIosEnvironment>;
const mockedRunSwiftPackageResolve = xcodeRunner.runSwiftPackageResolve as jest.MockedFunction<typeof xcodeRunner.runSwiftPackageResolve>;
const mockedRunSwiftTests = xcodeRunner.runSwiftTests as jest.MockedFunction<typeof xcodeRunner.runSwiftTests>;
const mockedRunSwiftLint = xcodeRunner.runSwiftLint as jest.MockedFunction<typeof xcodeRunner.runSwiftLint>;
const mockedRunXcodeBuild = xcodeRunner.runXcodeBuild as jest.MockedFunction<typeof xcodeRunner.runXcodeBuild>;
const mockedRunTuistBuild = xcodeRunner.runTuistBuild as jest.MockedFunction<typeof xcodeRunner.runTuistBuild>;
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
    jest.resetAllMocks();
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
    it('uses tuist build first in auto mode when Tuist config exists', async () => {
      mockedReaddir.mockResolvedValue(['Tuist.swift', 'RappiMonorepo.xcworkspace']);
      mockedRunTuistBuild.mockResolvedValue(successResult('tuist build PayInsurance'));
      const result = await skill.build('/repo', 'PayInsurance');
      expect(result.passed).toBe(true);
      expect(mockedRunTuistBuild).toHaveBeenCalledWith('/repo', 'PayInsurance');
      expect(mockedRunXcodeBuild).not.toHaveBeenCalled();
    });

    it('falls back to xcodebuild when tuist build fails', async () => {
      mockedReaddir.mockResolvedValue(['Tuist.swift', 'RappiMonorepo.xcworkspace']);
      mockedRunTuistBuild.mockResolvedValue(failureResult('tuist build'));
      mockedRunXcodeBuild.mockResolvedValue(successResult('xcodebuild build'));
      const result = await skill.build('/repo', 'PayInsurance');
      expect(result.passed).toBe(true);
      expect(mockedRunXcodeBuild).toHaveBeenCalledWith('/repo', 'PayInsurance');
    });

    it('falls back to swift package resolve when tuist and xcodebuild fail', async () => {
      mockedReaddir.mockResolvedValue(['Tuist.swift', 'RappiMonorepo.xcworkspace']);
      mockedRunTuistBuild.mockResolvedValue(failureResult('tuist build'));
      mockedRunXcodeBuild.mockResolvedValue(failureResult('xcodebuild build'));
      mockedRunSwiftPackageResolve.mockResolvedValue(successResult('swift package resolve'));
      const result = await skill.build('/repo', 'PayInsurance');
      expect(result.passed).toBe(true);
      expect(mockedRunSwiftPackageResolve).toHaveBeenCalledWith('/repo');
    });

    it('uses resolve only when strategy is resolve', async () => {
      mockedReaddir.mockResolvedValue(['Tuist.swift', 'RappiMonorepo.xcworkspace']);
      mockedRunSwiftPackageResolve.mockResolvedValue(successResult('swift package resolve'));
      const result = await skill.build('/repo', 'PayInsurance', 'resolve');
      expect(result.passed).toBe(true);
      expect(mockedRunSwiftPackageResolve).toHaveBeenCalledWith('/repo');
      expect(mockedRunTuistBuild).not.toHaveBeenCalled();
      expect(mockedRunXcodeBuild).not.toHaveBeenCalled();
    });

    it('uses xcodebuild when strategy is xcodebuild', async () => {
      mockedReaddir.mockResolvedValue(['Tuist.swift', 'RappiMonorepo.xcworkspace']);
      mockedRunXcodeBuild.mockResolvedValue(successResult('xcodebuild build'));
      const result = await skill.build('/repo', 'PayInsurance', 'xcodebuild');
      expect(result.passed).toBe(true);
      expect(mockedRunXcodeBuild).toHaveBeenCalledWith('/repo', 'PayInsurance');
      expect(mockedRunTuistBuild).not.toHaveBeenCalled();
    });

    it('uses xcodebuild for plain xcodeproj repo without Tuist config', async () => {
      mockedReaddir.mockResolvedValue(['App.xcodeproj']);
      mockedRunXcodeBuild.mockResolvedValue(successResult('xcodebuild build'));
      const result = await skill.build('/repo');
      expect(result.passed).toBe(true);
      expect(mockedRunXcodeBuild).toHaveBeenCalledWith('/repo', 'App');
      expect(mockedRunTuistBuild).not.toHaveBeenCalled();
    });

    it('uses swift package resolve for SPM-only repo', async () => {
      mockedReaddir.mockResolvedValue(['Package.swift']);
      mockedRunSwiftPackageResolve.mockResolvedValue(successResult('swift package resolve'));
      const result = await skill.build('/repo');
      expect(result.passed).toBe(true);
      expect(mockedRunSwiftPackageResolve).toHaveBeenCalledWith('/repo');
      expect(mockedRunXcodeBuild).not.toHaveBeenCalled();
    });

    it('throws GaiaBuildError when explicit xcodebuild fails', async () => {
      mockedReaddir.mockResolvedValue(['Tuist.swift', 'RappiMonorepo.xcworkspace']);
      mockedRunXcodeBuild.mockResolvedValue(failureResult('xcodebuild build'));
      await expect(skill.build('/repo', 'PayInsurance', 'xcodebuild')).rejects.toThrow('[iOS] `xcodebuild build` failed');
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
