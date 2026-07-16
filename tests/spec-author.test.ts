import { SpecAuthorAgent } from '../src/agents/spec-author';
import * as plugins from '../src/plugins';
import * as llm from '../src/tools/llm';
import * as repo from '../src/tools/repo';
import * as file from '../src/tools/file';
import * as pluginLoader from '../src/harness/plugin-loader';

jest.mock('../src/plugins');
jest.mock('../src/tools/llm');
jest.mock('../src/tools/repo');
jest.mock('../src/tools/file');
jest.mock('../src/harness/plugin-loader');

const mockedPlugins = plugins as jest.Mocked<typeof plugins>;
const mockedLLM = llm as jest.Mocked<typeof llm>;
const mockedRepo = repo as jest.Mocked<typeof repo>;
const mockedFile = file as jest.Mocked<typeof file>;
const mockedPluginLoader = pluginLoader as jest.Mocked<typeof pluginLoader>;

const SPEC_JSON = JSON.stringify({
  requirements: [{ id: 'r1', content: 'Do X', sourceAcId: 'ac-1' }],
  design: {
    affectedFiles: ['a.dart'],
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
  ],
  risks: [],
});

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

const WORKSPACE = '/workspace/job-001';

describe('SpecAuthorAgent', () => {
  let agent: SpecAuthorAgent;
  let skillMock: any;
  let writeHandoffSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    agent = new SpecAuthorAgent();

    skillMock = {
      displayName: 'Flutter Web',
      srcDirs: ['lib'],
      sourceExtension: '.dart',
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

    mockedFile.getDirectoryStructure.mockResolvedValue([
      { relativePath: 'lib/main.dart' } as any,
    ]);

    mockedFile.getRelevantFiles.mockResolvedValue({
      lib: ['lib/main.dart'],
      test: [],
      pubspec: false,
    } as any);

    mockedFile.getRelevantSourceContext.mockResolvedValue('// source');

    mockedFile.writeFile.mockResolvedValue(undefined as any);

    mockedPluginLoader.createPluginLoader.mockResolvedValue({
      getRulesAsContext: () => '',
    } as any);

    // First call → spec JSON, second call → gherkin text
    (mockedLLM.callLLM as jest.MockedFunction<typeof llm.callLLM>)
      .mockResolvedValueOnce({
        text: SPEC_JSON,
        provider: 'openai',
        model: 'gpt-test',
      })
      .mockResolvedValueOnce({
        text: 'Feature: Test\n  Scenario: @s1\n    Given x\n    When y\n    Then z',
        provider: 'openai',
        model: 'gpt-test',
      });

    (mockedLLM.extractJSON as jest.MockedFunction<typeof llm.extractJSON>).mockReturnValue(
      JSON.parse(SPEC_JSON) as any
    );

    writeHandoffSpy = jest
      .spyOn(agent as any, 'writeHandoff')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('success path — returns { success: true, nextStatus: "spec_ready", spec }', async () => {
    const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

    expect(result.success).toBe(true);
    expect(result.nextStatus).toBe('spec_ready');
    expect(result.spec).toBeDefined();
    expect(result.spec!.requirements).toHaveLength(1);
    expect(result.spec!.tasks).toHaveLength(1);
    expect(writeHandoffSpy).toHaveBeenCalledTimes(1);
  });

  it('setupRepository failure → returns { success: false, errorCode: "REPO_ERROR" }', async () => {
    mockedRepo.setupRepository.mockResolvedValue({
      success: false,
      output: '',
      error: 'clone failed',
    });

    const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('REPO_ERROR');
  });

  it('first callLLM (spec) throws → returns { success: false, errorCode: "SPEC_ERROR" }', async () => {
    (mockedLLM.callLLM as jest.MockedFunction<typeof llm.callLLM>)
      .mockReset()
      .mockRejectedValueOnce(new Error('LLM unavailable'));

    const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('SPEC_ERROR');
  });

  it('second callLLM (gherkin) throws → result.success = true, gherkinScenarios = ""', async () => {
    // Reset to one good spec call followed by a failure on gherkin
    (mockedLLM.callLLM as jest.MockedFunction<typeof llm.callLLM>)
      .mockReset()
      .mockResolvedValueOnce({
        text: SPEC_JSON,
        provider: 'openai',
        model: 'gpt-test',
      })
      .mockRejectedValueOnce(new Error('gherkin LLM error'));

    const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

    expect(result.success).toBe(true);
    expect(result.spec!.gherkinScenarios).toBe('');
  });

  it('gherkin fallback: spec saved correctly even when gherkinScenarios is empty string', async () => {
    (mockedLLM.callLLM as jest.MockedFunction<typeof llm.callLLM>)
      .mockReset()
      .mockResolvedValueOnce({
        text: SPEC_JSON,
        provider: 'openai',
        model: 'gpt-test',
      })
      .mockRejectedValueOnce(new Error('gherkin down'));

    const result = await agent.execute({ job: makeJob(), workspacePath: WORKSPACE });

    expect(result.success).toBe(true);
    expect(result.spec).toBeDefined();
    expect(result.spec!.gherkinScenarios).toBe('');
    // writeFile should still have been called for requirements/design/tasks
    expect(mockedFile.writeFile).toHaveBeenCalled();
  });
});
