import { ImplementerAgent } from '../src/agents/implementer';
import * as plugins from '../src/plugins';
import * as llm from '../src/tools/llm';
import * as repo from '../src/tools/repo';
import * as fileTool from '../src/tools/file';
import * as gitTools from '../src/tools/git';
import * as pluginLoader from '../src/harness/plugin-loader';
import * as fs from 'fs/promises';

jest.mock('../src/plugins');
jest.mock('../src/tools/llm');
jest.mock('../src/tools/repo');
jest.mock('../src/tools/file');
jest.mock('../src/tools/git');
jest.mock('../src/harness/plugin-loader');
jest.mock('fs/promises');

const mockedPlugins = plugins as jest.Mocked<typeof plugins>;
const mockedLLM = llm as jest.Mocked<typeof llm>;
const mockedRepo = repo as jest.Mocked<typeof repo>;
const mockedFile = fileTool as jest.Mocked<typeof fileTool>;
const mockedGit = gitTools as jest.Mocked<typeof gitTools>;
const mockedPluginLoader = pluginLoader as jest.Mocked<typeof pluginLoader>;
const mockedFs = fs as jest.Mocked<typeof fs>;

const WORKSPACE = '/workspace/job-001';

function makeJob(overrides: any = {}) {
  return {
    id: 'job-001',
    title: 'Add widget',
    platform: 'flutter',
    repo: 'org/repo',
    targetBranch: 'main',
    acceptanceCriteria: [{ id: 'ac-1', text: 'WHEN x THEN y', testable: true }],
    maxFilesToTouch: 10,
    requireTests: true,
    progressLogs: [],
    status: 'implementing',
    createdAt: new Date(),
    updatedAt: new Date(),
    initiativeId: 'init-1',
    spec: {
      requirements: [{ id: 'r1', content: 'Do X' }],
      design: {
        affectedFiles: ['lib/widget.dart'],
        newFiles: [],
        architectureDecisions: [],
        uiComponents: [],
      },
      tasks: [
        {
          id: 't1',
          description: 'Create widget',
          filePath: 'lib/widget.dart',
          type: 'create',
          status: 'pending',
        },
        {
          id: 't2',
          description: 'Test widget',
          filePath: 'test/widget_test.dart',
          type: 'test',
          status: 'pending',
        },
      ],
      risks: [],
    },
    ...overrides,
  };
}

function makePassingTestResult() {
  return {
    passed: true,
    command: 'flutter test',
    stdout: '',
    stderr: '',
    exitCode: 0,
    duration: 100,
  };
}

function makeFailingTestResult() {
  return {
    passed: false,
    command: 'flutter test',
    stdout: 'Test failed',
    stderr: 'error details',
    exitCode: 1,
    duration: 50,
  };
}

describe('ImplementerAgent', () => {
  let agent: ImplementerAgent;
  let skillMock: any;
  let gitMock: any;
  let writeHandoffSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    agent = new ImplementerAgent();

    gitMock = { status: jest.fn() };

    skillMock = {
      displayName: 'Flutter',
      srcDirs: ['lib'],
      sourceExtension: '.dart',
      verifyEnvironment: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
      build: jest.fn().mockResolvedValue({ passed: true, command: 'flutter pub get', stdout: '', stderr: '', exitCode: 0, duration: 200 }),
      test: jest.fn().mockResolvedValue(makePassingTestResult()),
      analyze: jest.fn().mockResolvedValue({ passed: true, command: '', stdout: '', stderr: '', exitCode: 0, duration: 0 }),
      getPromptContext: jest.fn().mockReturnValue({
        specSystem: 'system',
        implementerSystem: 'impl-system',
        reviewerSystem: 'reviewer-system',
        filePatterns: {},
        forbidden: [],
      }),
    };

    mockedPlugins.loadSkill.mockResolvedValue(skillMock);

    mockedRepo.setupRepository.mockResolvedValue({
      success: true,
      output: 'cloned',
    });

    mockedGit.initGit.mockReturnValue(gitMock as any);
    mockedGit.generateBranchName.mockReturnValue('feature/job-001-add-widget');
    mockedGit.createBranch.mockResolvedValue(undefined as any);
    mockedGit.commitAndPush.mockResolvedValue(undefined as any);

    mockedPluginLoader.createPluginLoader.mockResolvedValue({
      getRulesAsContext: () => '',
    } as any);

    (mockedLLM.callLLM as jest.MockedFunction<typeof llm.callLLM>).mockResolvedValue({
      text: 'export class Widget {}',
      provider: 'openai',
      model: 'gpt-test',
    });

    mockedFile.readFile.mockResolvedValue('' as any);
    mockedFile.writeFile.mockResolvedValue(undefined as any);

    // readHandoff returns empty (no previous handoff)
    jest.spyOn(agent as any, 'readHandoff').mockResolvedValue('');

    writeHandoffSpy = jest
      .spyOn(agent as any, 'writeHandoff')
      .mockResolvedValue(undefined);

    // fs.readFile for pubspec.yaml
    mockedFs.readFile.mockRejectedValue(new Error('no pubspec'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── execute() suite ──────────────────────────────────────────────────────

  describe('execute()', () => {
    it('success path — changes.length > 0 and branchName set', async () => {
      const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

      expect(result.success).toBe(true);
      expect(result.changes).toBeDefined();
      expect(result.changes!.length).toBeGreaterThan(0);
      expect(result.branchName).toBe('feature/job-001-add-widget');
    });

    it('setupRepository failure → { success: false, errorCode: "REPO_ERROR" }', async () => {
      mockedRepo.setupRepository.mockResolvedValue({
        success: false,
        output: '',
        error: 'clone failed',
      });

      const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('REPO_ERROR');
    });

    it('tests pass on first run — skill.test called once', async () => {
      await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

      // test is called for the initial run and should pass immediately
      expect(skillMock.test).toHaveBeenCalled();
      const calls = skillMock.test.mock.calls.length;
      // Only the single test run needed — no fix loop
      expect(calls).toBe(1);
    });

    it('tests fail then pass after fix — callLLM called for fixAllFiles', async () => {
      // First test call fails, second passes (after fix)
      skillMock.test
        .mockResolvedValueOnce(makeFailingTestResult())
        .mockResolvedValueOnce(makePassingTestResult());

      // fixAllFiles calls callLLM — return JSON with a fix
      (mockedLLM.callLLM as jest.MockedFunction<typeof llm.callLLM>)
        // first calls are generateCode for tasks
        .mockResolvedValueOnce({ text: 'export class Widget {}', provider: 'openai', model: 'gpt-test' })
        .mockResolvedValueOnce({ text: 'void main() {}', provider: 'openai', model: 'gpt-test' })
        // fix call
        .mockResolvedValueOnce({
          text: '{"lib/widget.dart":"export class Widget { fixed }","test/widget_test.dart":"void main() {}"}',
          provider: 'openai',
          model: 'gpt-test',
        });

      const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

      expect(result.success).toBe(true);
      // callLLM was called at least 3 times (2 code gen + 1 fix)
      expect(mockedLLM.callLLM).toHaveBeenCalledTimes(3);
    });

    it('tests fail 3 times → GaiaTestError → result.errorCode === "TEST_ERROR"', async () => {
      skillMock.test.mockResolvedValue(makeFailingTestResult());

      // fix calls always return empty JSON (no files fixed)
      (mockedLLM.callLLM as jest.MockedFunction<typeof llm.callLLM>).mockResolvedValue({
        text: '{}',
        provider: 'openai',
        model: 'gpt-test',
      });

      const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TEST_ERROR');
    });

    it('requireTests === false → skill.test NOT called', async () => {
      const result = await agent.execute({
        job: makeJob({ requireTests: false }),
        workspacePath: WORKSPACE,
      });

      expect(result.success).toBe(true);
      expect(skillMock.test).not.toHaveBeenCalled();
    });
  });

  // ─── executeTDD() suite ───────────────────────────────────────────────────

  describe('executeTDD()', () => {
    it('RED test passes immediately → logs warning but result.success = true', async () => {
      // baseline passes, RED test also passes immediately
      skillMock.test.mockResolvedValue(makePassingTestResult());

      const result = await agent.executeTDD({ job: makeJob(), workspacePath: WORKSPACE });

      expect(result.success).toBe(true);
      expect(result.branchName).toBeDefined();
    });

    it('RED test fails → GREEN fix applied → tests pass → success', async () => {
      // baseline passes, RED fails, GREEN passes after fix
      skillMock.test
        .mockResolvedValueOnce(makePassingTestResult()) // baseline
        .mockResolvedValueOnce(makeFailingTestResult()) // RED
        .mockResolvedValueOnce(makePassingTestResult()) // GREEN
        .mockResolvedValueOnce(makePassingTestResult()); // final run

      (mockedLLM.callLLM as jest.MockedFunction<typeof llm.callLLM>)
        // generateCode for impl tasks
        .mockResolvedValueOnce({ text: 'export class Widget {}', provider: 'openai', model: 'gpt-test' })
        // generateCode for test task
        .mockResolvedValueOnce({ text: 'void main() { test("x", () {}); }', provider: 'openai', model: 'gpt-test' })
        // GREEN fix
        .mockResolvedValueOnce({
          text: '{"lib/widget.dart":"export class Widget { green }"}',
          provider: 'openai',
          model: 'gpt-test',
        });

      const result = await agent.executeTDD({ job: makeJob(), workspacePath: WORKSPACE });

      expect(result.success).toBe(true);
    });

    it('baseline impl fails before RED → fixAllFiles called for impl', async () => {
      // baseline fails, then after fix passes, RED passes, final passes
      skillMock.test
        .mockResolvedValueOnce(makeFailingTestResult()) // baseline fails
        .mockResolvedValueOnce(makePassingTestResult()) // RED passes immediately
        .mockResolvedValueOnce(makePassingTestResult()); // final run

      (mockedLLM.callLLM as jest.MockedFunction<typeof llm.callLLM>)
        // generateCode for impl task
        .mockResolvedValueOnce({ text: 'export class Widget {}', provider: 'openai', model: 'gpt-test' })
        // fixAllFiles for baseline
        .mockResolvedValueOnce({
          text: '{"lib/widget.dart":"export class Widget { fixed }"}',
          provider: 'openai',
          model: 'gpt-test',
        })
        // generateCode for test task
        .mockResolvedValueOnce({ text: 'void main() {}', provider: 'openai', model: 'gpt-test' });

      const result = await agent.executeTDD({ job: makeJob(), workspacePath: WORKSPACE });

      expect(result.success).toBe(true);
      // fixAllFiles (via callLLM) should have been called for the baseline failure
      expect(mockedLLM.callLLM).toHaveBeenCalledTimes(3);
    });
  });
});
