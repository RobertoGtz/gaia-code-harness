/**
 * @fileoverview TDD cycle — F4: --dry-run CLI flag and dryRun job field
 * RED tests written before production code changes.
 */

import { parseArgs } from '../src/cli/run';
import { ReviewerAgent } from '../src/agents/reviewer';
import { CodeGenerationJob } from '../src/types';
import * as plugins from '../src/plugins';
import * as llm from '../src/tools/llm';
import * as gitTools from '../src/tools/git';
import * as fs from 'fs/promises';

jest.mock('../src/plugins');
jest.mock('../src/tools/llm');
jest.mock('../src/tools/git');
jest.mock('fs/promises');

const mockedPlugins = plugins as jest.Mocked<typeof plugins>;
const mockedLLM = llm as jest.Mocked<typeof llm>;
const mockedGit = gitTools as jest.Mocked<typeof gitTools>;
const mockedFs = fs as jest.Mocked<typeof fs>;

const WORKSPACE = '/workspace/job-dry-run';

function makeJob(overrides: Partial<CodeGenerationJob> = {}): CodeGenerationJob {
  return {
    id: 'job-dry-run',
    title: 'Dry run feature',
    platform: 'flutter',
    repo: 'org/repo',
    targetBranch: 'develop',
    acceptanceCriteria: [{ id: 'ac-1', text: 'WHEN x THEN y', testable: true }],
    maxFilesToTouch: 5,
    requireTests: true,
    progressLogs: [],
    status: 'reviewing',
    createdAt: new Date(),
    updatedAt: new Date(),
    initiativeId: 'init-1',
    branchName: 'feature/dry-run',
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
      ],
      risks: [],
    },
    ...overrides,
  };
}

// ─── Test 1: parseArgs --dry-run ──────────────────────────────────────────────

describe('parseArgs --dry-run', () => {
  it('has("--dry-run") returns true when --dry-run is in argv', () => {
    const { has } = parseArgs(['--job', 'job.json', '--dry-run', '--approve']);
    expect(has('--dry-run')).toBe(true);
  });

  it('has("--dry-run") returns false when --dry-run is absent', () => {
    const { has } = parseArgs(['--job', 'job.json', '--approve']);
    expect(has('--dry-run')).toBe(false);
  });
});

// ─── Test 2: CodeGenerationJob dryRun field ───────────────────────────────────

describe('CodeGenerationJob dryRun field', () => {
  it('accepts dryRun: true without TypeScript error', () => {
    // This is a compile-time check — if dryRun?: boolean is missing from the
    // interface the TypeScript compiler will reject this assignment.
    const job: CodeGenerationJob = makeJob({ dryRun: true });
    expect(job.dryRun).toBe(true);
  });

  it('accepts dryRun: false', () => {
    const job: CodeGenerationJob = makeJob({ dryRun: false });
    expect(job.dryRun).toBe(false);
  });

  it('dryRun is optional — omitting it does not throw', () => {
    const job: CodeGenerationJob = makeJob();
    expect(job.dryRun).toBeUndefined();
  });
});

// ─── Test 3: ReviewerAgent skips PR when dryRun: true ────────────────────────

describe('ReviewerAgent dryRun mode', () => {
  let agent: ReviewerAgent;
  let skillMock: any;
  let gitMock: any;

  beforeEach(() => {
    jest.clearAllMocks();

    agent = new ReviewerAgent();

    gitMock = {
      status: jest.fn(),
    };

    skillMock = {
      displayName: 'Flutter',
      srcDirs: ['lib'],
      sourceExtension: '.dart',
      verifyEnvironment: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
      test: jest.fn().mockResolvedValue({
        passed: true,
        command: 'flutter test',
        stdout: '',
        stderr: '',
        exitCode: 0,
        duration: 100,
      }),
      analyze: jest.fn().mockResolvedValue({
        passed: true,
        command: '',
        stdout: '',
        stderr: '',
        exitCode: 0,
        duration: 0,
      }),
      getPromptContext: jest.fn().mockReturnValue({
        specSystem: 'system',
        implementerSystem: 'impl-system',
        reviewerSystem: 'reviewer-system',
        filePatterns: {},
        forbidden: [],
      }),
    };

    mockedPlugins.loadSkill.mockResolvedValue(skillMock);
    mockedGit.initGit.mockReturnValue(gitMock as any);
    mockedGit.getModifiedFiles.mockResolvedValue([]);
    mockedGit.parseGitHubRepoFromRemote.mockResolvedValue({ owner: 'org', repo: 'repo' });

    // LLM review returns passing score
    (mockedLLM.callLLM as jest.MockedFunction<typeof llm.callLLM>).mockResolvedValue({
      text: '{"score": 90, "passed": true, "issues": []}',
      provider: 'openai',
      model: 'gpt-test',
    });

    // fs.writeFile for review report — silent
    mockedFs.writeFile.mockResolvedValue(undefined as any);

    jest.spyOn(agent as any, 'readHandoff').mockResolvedValue('');
    jest.spyOn(agent as any, 'writeHandoff').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('dryRun: true → createGitHubPR NOT called and prUrl is "dry-run://skipped"', async () => {
    const result = await agent.execute({
      job: makeJob({ dryRun: true }),
      workspacePath: WORKSPACE,
    });

    expect(mockedGit.createGitHubPR).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.prUrl).toBe('dry-run://skipped');
  });

  it('dryRun: false (default) → createGitHubPR IS called', async () => {
    mockedGit.createGitHubPR.mockResolvedValue({
      url: 'https://github.com/org/repo/pull/1',
      id: 'pr-1',
      number: 1,
    });
    mockedGit.addJiraComment.mockResolvedValue(undefined as any);

    const result = await agent.execute({
      job: makeJob({ dryRun: false }),
      workspacePath: WORKSPACE,
    });

    expect(mockedGit.createGitHubPR).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
