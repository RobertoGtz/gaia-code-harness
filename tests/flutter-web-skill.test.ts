/**
 * Unit tests for FlutterWebSkill (src/skills/flutter_web/index.ts).
 * Mocks the test-runner toolchain and file utilities — no shell or filesystem access.
 */
import { FlutterWebSkill } from '../src/skills/flutter_web';
import * as testRunner from '../src/tools/test-runner';
import * as file from '../src/tools/file';

jest.mock('../src/tools/test-runner', () => ({
  verifyFlutterEnvironment: jest.fn(),
  runFlutterPubGet: jest.fn(),
  runFlutterTests: jest.fn(),
  runDartAnalyze: jest.fn(),
  runMelosBootstrap: jest.fn(),
}));

jest.mock('../src/tools/file', () => ({
  readFile: jest.fn(),
  fileExists: jest.fn(),
}));

const mockedVerifyFlutterEnvironment = testRunner.verifyFlutterEnvironment as jest.MockedFunction<typeof testRunner.verifyFlutterEnvironment>;
const mockedRunFlutterPubGet = testRunner.runFlutterPubGet as jest.MockedFunction<typeof testRunner.runFlutterPubGet>;
const mockedRunFlutterTests = testRunner.runFlutterTests as jest.MockedFunction<typeof testRunner.runFlutterTests>;
const mockedRunDartAnalyze = testRunner.runDartAnalyze as jest.MockedFunction<typeof testRunner.runDartAnalyze>;
const mockedRunMelosBootstrap = testRunner.runMelosBootstrap as jest.MockedFunction<typeof testRunner.runMelosBootstrap>;
const mockedReadFile = file.readFile as jest.MockedFunction<typeof file.readFile>;
const mockedFileExists = file.fileExists as jest.MockedFunction<typeof file.fileExists>;

function successResult(command: string): any {
  return { passed: true, command, stdout: '', stderr: '', exitCode: 0, duration: 100 };
}

function failureResult(command: string): any {
  return { passed: false, command, stdout: '', stderr: 'error', exitCode: 1, duration: 100 };
}

function mockFileSystem(config: {
  melos?: boolean;
  fvmrc?: string;
  pubspec?: string;
  overrides?: string;
} = {}) {
  mockedFileExists.mockImplementation(async (p: string) => {
    if (config.melos && p.endsWith('melos.yaml')) return true;
    return false;
  });
  mockedReadFile.mockImplementation(async (p: string) => {
    if (p.endsWith('.fvmrc')) return config.fvmrc ?? '';
    if (p.endsWith('pubspec.yaml')) return config.pubspec ?? '';
    if (p.endsWith('pubspec_overrides.yaml')) return config.overrides ?? '';
    throw new Error(`Unexpected readFile: ${p}`);
  });
}

describe('FlutterWebSkill', () => {
  let skill: FlutterWebSkill;

  beforeEach(() => {
    skill = new FlutterWebSkill();
    jest.resetAllMocks();
    delete process.env.FLUTTER_WEB_BASE_HREF;
    delete process.env.FLUTTER_WEB_USE_SKIA;
    Object.keys(process.env).filter(k => k.startsWith('BACKEND_API') || k.startsWith('FIREBASE_') || k.startsWith('BRAZE_') || k === 'AMPLITUD_API_KEY' || k === 'AMPLITUD_INSTANCE_NAME' || k === 'SHARED_SERVICES_API').forEach(k => delete process.env[k]);
  });

  describe('verifyEnvironment', () => {
    it('recognizes melos + FVM monorepo structure and reports warnings', async () => {
      mockedVerifyFlutterEnvironment.mockResolvedValue({ valid: true, errors: [] });
      mockFileSystem({
        melos: true,
        fvmrc: '{"flutter":"3.35.7"}',
        pubspec: 'name: pay_multiplatform\nenvironment:\n  sdk: 3.9.2\n  flutter: 3.35.7\ndependencies:\n  flutter:\n    sdk: flutter',
      });
      const result = await skill.verifyEnvironment('/repo');
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Melos monorepo detected — run `melos bootstrap` before `flutter pub get`.');
      expect(result.warnings).toContain('FVM flutter version required: 3.35.7.');
    });

    it('throws GaiaEnvError when Flutter environment is invalid', async () => {
      mockedVerifyFlutterEnvironment.mockResolvedValue({ valid: false, errors: ['Flutter not found'] });
      mockFileSystem();
      await expect(skill.verifyEnvironment('/repo')).rejects.toThrow('[Flutter Web] SDK not found or misconfigured');
    });

    it('throws GaiaEnvError when mobile-only packages are present', async () => {
      mockedVerifyFlutterEnvironment.mockResolvedValue({ valid: true, errors: [] });
      mockFileSystem({
        pubspec: 'dependencies:\n  camera: ^0.10.0\n  image_picker: ^1.0.0',
      });
      await expect(skill.verifyEnvironment('/repo')).rejects.toThrow('[Flutter Web] Mobile-only packages detected in pubspec.yaml');
    });

    it('warns about Bitbucket git overrides when pubspec_overrides.yaml contains bitbucket.org', async () => {
      mockedVerifyFlutterEnvironment.mockResolvedValue({ valid: true, errors: [] });
      mockFileSystem({
        melos: true,
        overrides: 'dependency_overrides:\n  some_package:\n    git:\n      url: https://USERNAME_REPOSITORY:PASSWORD_REPOSITORY@bitbucket.org/rappinc/repo.git',
      });
      const result = await skill.verifyEnvironment('/repo');
      expect(result.warnings?.some(w => w.includes('Bitbucket'))).toBe(true);
    });
  });

  describe('build', () => {
    it('runs melos bootstrap before flutter pub get in apps/app', async () => {
      mockedVerifyFlutterEnvironment.mockResolvedValue({ valid: true, errors: [] });
      mockFileSystem({ melos: true });
      mockedRunMelosBootstrap.mockResolvedValue(successResult('melos bootstrap'));
      mockedRunFlutterPubGet.mockResolvedValue(successResult('flutter pub get'));
      const result = await skill.build('/repo');
      expect(result.passed).toBe(true);
      expect(mockedRunMelosBootstrap).toHaveBeenCalledWith('/repo');
      expect(mockedRunFlutterPubGet).toHaveBeenCalledWith('/repo/apps/app');
    });

    it('throws GaiaBuildError when melos bootstrap fails', async () => {
      mockFileSystem({ melos: true });
      mockedRunMelosBootstrap.mockResolvedValue(failureResult('melos bootstrap'));
      await expect(skill.build('/repo')).rejects.toThrow('[Flutter Web] `melos bootstrap` failed');
    });

    it('runs flutter pub get only for non-melos repo', async () => {
      mockFileSystem({});
      mockedRunFlutterPubGet.mockResolvedValue(successResult('flutter pub get'));
      const result = await skill.build('/repo');
      expect(result.passed).toBe(true);
      expect(mockedRunMelosBootstrap).not.toHaveBeenCalled();
      expect(mockedRunFlutterPubGet).toHaveBeenCalledWith('/repo');
    });

    it('produces web build command with base-href and dart-define variables', async () => {
      process.env.BACKEND_API = 'https://api.example.com';
      process.env.FIREBASE_API_KEY = 'fb-key';
      process.env.FLUTTER_WEB_BASE_HREF = '/banking-accounts/pyme/account-basics/';
      mockFileSystem({ melos: true });
      mockedRunMelosBootstrap.mockResolvedValue(successResult('melos bootstrap'));
      mockedRunFlutterPubGet.mockResolvedValue(successResult('flutter pub get'));
      const result = await skill.build('/repo');
      expect(result.command).toContain('flutter build web --release');
      expect(result.command).toContain('--base-href=/banking-accounts/pyme/account-basics/');
      expect(result.command).toContain('--dart-define=BACKEND_API=https://api.example.com');
      expect(result.command).toContain('--dart-define=FIREBASE_API_KEY=fb-key');
    });
  });

  describe('test', () => {
    it('runs flutter tests and returns success', async () => {
      mockedRunFlutterTests.mockResolvedValue(successResult('flutter test'));
      const result = await skill.test('/repo', 'account_summary');
      expect(result.passed).toBe(true);
      expect(mockedRunFlutterTests).toHaveBeenCalledWith({ workingDir: '/repo', module: 'account_summary', platform: 'chrome' });
    });

    it('throws GaiaTestError when flutter tests fail', async () => {
      mockedRunFlutterTests.mockResolvedValue(failureResult('flutter test'));
      await expect(skill.test('/repo', 'account_summary')).rejects.toThrow('[Flutter Web] `flutter test` failed');
    });
  });

  describe('analyze', () => {
    it('runs dart analyze in the feature package directory', async () => {
      mockedRunDartAnalyze.mockResolvedValue(successResult('dart analyze'));
      const result = await skill.analyze('/repo', 'account_summary');
      expect(result.passed).toBe(true);
      expect(mockedRunDartAnalyze).toHaveBeenCalledWith('/repo/packages/features/account_summary');
    });

    it('throws GaiaTestError when dart analyze fails', async () => {
      mockedRunDartAnalyze.mockResolvedValue(failureResult('dart analyze'));
      await expect(skill.analyze('/repo', 'account_summary')).rejects.toThrow('[Flutter Web] `dart analyze` found issues');
    });
  });

  describe('getPromptContext', () => {
    it('uses fluro routing and package layout for known feature', () => {
      const ctx = skill.getPromptContext({ title: 'Add feature', module: 'account_summary', repo: 'rpp-account-basics-multiplatform-pyme' });
      expect(ctx.specSystem).toContain('fluro');
      expect(ctx.specSystem).toContain('NEVER go_router');
      expect(ctx.implementerSystem).toContain('packages/features/account_summary');
      expect(ctx.implementerSystem).toContain('lib/account_summary.dart');
      expect(ctx.implementerSystem).toContain('lib/src/core/account_summary_router.dart');
      expect(ctx.implementerSystem).toContain('lib/src/core/account_summary_routes.dart');
      expect(ctx.implementerSystem).toContain('lib/src/data/models/');
      expect(ctx.implementerSystem).toContain('lib/src/presentation/');
      expect(ctx.reviewerSystem).toContain('fluro');
      expect(ctx.conventions).toMatchObject({
        routing: 'fluro',
        featurePackage: 'account_summary',
        baseHref: '/banking-accounts/pyme/account-basics/',
        fvmVersion: '3.35.7',
        dartSdk: '3.9.2',
      });
    });

    it('falls back to placeholder feature when module is omitted', () => {
      const ctx = skill.getPromptContext({ title: 'Add feature', repo: 'rpp-account-basics-multiplatform-pyme' });
      expect(ctx.implementerSystem).toContain('packages/features/account_summary');
      expect(ctx.implementerSystem).toContain('lib/account_summary.dart');
    });

    it('documents separate GitHub credentials for RPP repo — not rappi-inc token', () => {
      const ctx = skill.getPromptContext({ title: 'Add feature', module: 'account_summary', repo: 'rpp-co/rpp-account-basics-multiplatform-pyme' });
      expect(ctx.conventions?.repoOwner).toBe('rpp-co');
      expect(ctx.conventions?.credentialNote).toContain('GITHUB_TOKEN');
      expect(ctx.conventions?.credentialNote).not.toContain('rappi-inc');
    });
  });
});
