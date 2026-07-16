import { EventEmitter } from 'events';
import { MutationTesterAgent } from '../src/agents/mutation-tester';
import * as plugins from '../src/plugins';
import * as llm from '../src/tools/llm';
import * as fileTool from '../src/tools/file';
import * as pluginLoader from '../src/harness/plugin-loader';
import * as fs from 'fs/promises';

jest.mock('../src/plugins');
jest.mock('../src/tools/llm');
jest.mock('../src/tools/file');
jest.mock('../src/harness/plugin-loader');
jest.mock('fs/promises');
jest.mock('child_process');

const { spawn } = require('child_process') as jest.Mocked<typeof import('child_process')>;

const mockedPlugins = plugins as jest.Mocked<typeof plugins>;
const mockedLLM = llm as jest.Mocked<typeof llm>;
const mockedFile = fileTool as jest.Mocked<typeof fileTool>;
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
    ...overrides,
  };
}

function makeSkillMock(testPassed: boolean) {
  return {
    displayName: 'Flutter',
    srcDirs: ['lib'],
    sourceExtension: '.dart',
    verifyEnvironment: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
    build: jest.fn().mockResolvedValue({ passed: true }),
    test: jest.fn().mockResolvedValue({
      passed: testPassed,
      command: 'flutter test',
      stdout: '',
      stderr: '',
      exitCode: testPassed ? 0 : 1,
      duration: 100,
    }),
    analyze: jest.fn().mockResolvedValue({ passed: true }),
    getPromptContext: jest.fn().mockReturnValue({
      specSystem: 'system',
      implementerSystem: 'impl-system',
      reviewerSystem: 'reviewer-system',
      filePatterns: {},
      forbidden: [],
    }),
  };
}

/**
 * Build a mock spawn process that emits stdout data (optional) then closes.
 */
function makeSpawnProc(exitCode: number, stdoutData?: string): any {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  process.nextTick(() => {
    if (stdoutData) proc.stdout.emit('data', Buffer.from(stdoutData));
    proc.emit('close', exitCode);
  });
  return proc;
}

const MUTATE_PY_JSON = JSON.stringify({
  score: 100,
  killed: 5,
  survived: 0,
  total: 5,
  survived_details: [],
});

const MUTATE_PY_JSON_LOW = JSON.stringify({
  score: 60,
  killed: 3,
  survived: 2,
  total: 5,
  survived_details: [
    { file: 'lib/widget.dart', row: 1, label: 'arithmetic', original: '+ 1', replacement: '- 1' },
    { file: 'lib/widget.dart', row: 2, label: 'logical', original: '&&', replacement: '||' },
  ],
});

describe('MutationTesterAgent', () => {
  let agent: MutationTesterAgent;
  let writeHandoffSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    agent = new MutationTesterAgent();

    jest.spyOn(agent as any, 'readHandoff').mockResolvedValue('');
    writeHandoffSpy = jest
      .spyOn(agent as any, 'writeHandoff')
      .mockResolvedValue(undefined);

    mockedPluginLoader.createPluginLoader.mockResolvedValue({
      getRulesAsContext: () => '',
    } as any);

    // fs.writeFile for report — best-effort, silently swallowed
    mockedFs.writeFile.mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── Strategy A (deterministic) ──────────────────────────────────────────

  describe('Strategy A — deterministic mutator (python3 + mutate.py available)', () => {
    beforeEach(() => {
      // python3 --version → exits 0
      // python3 [mutate.py ...] → exits 0 with JSON
      (spawn as jest.Mock).mockImplementation((cmd: string, args: string[]) => {
        const isPythonVersion = args.includes('--version');
        const isIgnore = (args as any).__opts?.stdio === 'ignore';
        return makeSpawnProc(0, isPythonVersion ? undefined : MUTATE_PY_JSON);
      });

      // mutate.py exists
      mockedFs.access.mockResolvedValue(undefined as any);

      // readdir returns one non-test dart file
      mockedFs.readdir.mockResolvedValue(['widget.dart'] as any);

      // stat → regular file
      mockedFs.stat.mockResolvedValue({ isDirectory: () => false } as any);
    });

    it('python3 available + mutate.py present → spawn called, callLLM NOT called', async () => {
      mockedPlugins.loadSkill.mockResolvedValue(makeSkillMock(true) as any);

      const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

      expect(result.success).toBe(true);
      expect(mockedLLM.callLLM).not.toHaveBeenCalled();
      expect(spawn).toHaveBeenCalled();
    });

    it('score >= 80% → { success: true }', async () => {
      mockedPlugins.loadSkill.mockResolvedValue(makeSkillMock(true) as any);

      const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

      expect(result.success).toBe(true);
      expect(result.output).toContain('100.0%');
    });

    it('score < 80% → { success: false, errorCode: "TEST_ERROR" }', async () => {
      mockedPlugins.loadSkill.mockResolvedValue(makeSkillMock(true) as any);

      // Override spawn for mutate.py run to return low score
      (spawn as jest.Mock).mockImplementation((cmd: string, args: string[]) => {
        const isPythonVersion = args.includes('--version');
        return makeSpawnProc(0, isPythonVersion ? undefined : MUTATE_PY_JSON_LOW);
      });

      const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TEST_ERROR');
    });
  });

  // ─── Strategy B (LLM fallback) ───────────────────────────────────────────

  describe('Strategy B — LLM fallback (python3 unavailable)', () => {
    beforeEach(() => {
      // python3 --version → exits 1 (unavailable)
      (spawn as jest.Mock).mockImplementation((_cmd: string, _args: string[]) =>
        makeSpawnProc(1)
      );

      // mutate.py access check → reject (does not exist)
      mockedFs.access.mockRejectedValue(new Error('ENOENT'));

      // source file content
      mockedFile.readFile.mockResolvedValue('const x = 1;\n' as any);
      mockedFile.writeFile.mockResolvedValue(undefined as any);

      // readdir + stat to discover source files
      mockedFs.readdir.mockResolvedValue(['widget.dart'] as any);
      mockedFs.stat.mockResolvedValue({ isDirectory: () => false } as any);
    });

    it('python3 unavailable → callLLM called for mutations', async () => {
      const skillMock = makeSkillMock(false); // tests fail → mutation killed
      mockedPlugins.loadSkill.mockResolvedValue(skillMock as any);

      (mockedLLM.callLLM as jest.MockedFunction<typeof llm.callLLM>).mockResolvedValue({
        text: '[{"line":1,"original":"const x = 1;","mutated":"const x = 2;","description":"changed constant"}]',
        provider: 'openai',
        model: 'gpt-test',
      });

      const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

      expect(mockedLLM.callLLM).toHaveBeenCalled();
      // Tests fail after mutation → killed → score = 100%
      expect(result.success).toBe(true);
    });

    it('LLM generates 0 mutations → { success: true, output contains "No mutations generated" }', async () => {
      mockedPlugins.loadSkill.mockResolvedValue(makeSkillMock(true) as any);

      (mockedLLM.callLLM as jest.MockedFunction<typeof llm.callLLM>).mockResolvedValue({
        text: '[]',
        provider: 'openai',
        model: 'gpt-test',
      });

      const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

      expect(result.success).toBe(true);
      expect(result.output).toContain('No mutations generated');
    });

    it('all LLM mutations killed (tests fail) → { success: true }', async () => {
      const skillMock = makeSkillMock(false); // tests always fail → every mutation killed
      mockedPlugins.loadSkill.mockResolvedValue(skillMock as any);

      (mockedLLM.callLLM as jest.MockedFunction<typeof llm.callLLM>).mockResolvedValue({
        text: '[{"line":1,"original":"const x = 1;","mutated":"const x = 2;","description":"changed constant"},{"line":1,"original":"const x = 1;","mutated":"const x = 0;","description":"zero constant"}]',
        provider: 'openai',
        model: 'gpt-test',
      });

      const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

      expect(result.success).toBe(true);
      expect(result.output).toContain('100.0%');
    });

    it('some LLM mutations survived (score < 80%) → { success: false }', async () => {
      // 4 mutations total, only 3 killed → 75% → below threshold
      const skillMock = makeSkillMock(false);
      // Make the 4th test call pass (mutation survived)
      skillMock.test
        .mockResolvedValueOnce({ passed: false, command: 'flutter test', stdout: '', stderr: '', exitCode: 1, duration: 100 })
        .mockResolvedValueOnce({ passed: false, command: 'flutter test', stdout: '', stderr: '', exitCode: 1, duration: 100 })
        .mockResolvedValueOnce({ passed: false, command: 'flutter test', stdout: '', stderr: '', exitCode: 1, duration: 100 })
        .mockResolvedValueOnce({ passed: true, command: 'flutter test', stdout: '', stderr: '', exitCode: 0, duration: 100 });

      mockedPlugins.loadSkill.mockResolvedValue(skillMock as any);

      (mockedLLM.callLLM as jest.MockedFunction<typeof llm.callLLM>).mockResolvedValue({
        text: '[{"line":1,"original":"a","mutated":"b","description":"mut1"},{"line":2,"original":"c","mutated":"d","description":"mut2"},{"line":3,"original":"e","mutated":"f","description":"mut3"},{"line":4,"original":"g","mutated":"h","description":"mut4"}]',
        provider: 'openai',
        model: 'gpt-test',
      });

      const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TEST_ERROR');
    });
  });

  // ─── Edge case ────────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('no source files found → { success: true, output contains "No source files" }', async () => {
      // python3 unavailable so we use LLM path; readdir returns only test files
      (spawn as jest.Mock).mockImplementation(() => makeSpawnProc(1));
      mockedFs.access.mockRejectedValue(new Error('ENOENT'));
      mockedFs.readdir.mockResolvedValue(['widget_test.dart'] as any); // has "test" in name → excluded
      mockedFs.stat.mockResolvedValue({ isDirectory: () => false } as any);

      mockedPlugins.loadSkill.mockResolvedValue(makeSkillMock(true) as any);

      const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

      expect(result.success).toBe(true);
      expect(result.output).toContain('No source files to mutate');
    });
  });
});
