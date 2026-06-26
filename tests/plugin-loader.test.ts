/**
 * Unit tests for PluginLoader (src/harness/plugin-loader.ts).
 * Tests the loader using a temporary directory — no LLM, no agents invoked.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PluginLoader, createPluginLoader } from '../src/harness/plugin-loader';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-loader-test-'));
}

function writeDocs(dir: string, files: Record<string, string>): void {
  const docsDir = path.join(dir, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(docsDir, name), content, 'utf8');
  }
}

describe('PluginLoader', () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  // ── No docs directory ──────────────────────────────────────────────────────

  it('initializes without error when docs/ does not exist', async () => {
    const loader = new PluginLoader(dir);
    await expect(loader.initialize()).resolves.not.toThrow();
  });

  it('getConfig returns undefined when no gaia.json', async () => {
    const loader = new PluginLoader(dir);
    await loader.initialize();
    expect(loader.getConfig()).toBeUndefined();
  });

  it('hasCustomAgents returns false when no manifest or cache', async () => {
    const loader = new PluginLoader(dir);
    await loader.initialize();
    expect(loader.hasCustomAgents()).toBe(false);
  });

  it('getRulesMarkdown returns undefined when no RULES.md', async () => {
    const loader = new PluginLoader(dir);
    await loader.initialize();
    expect(loader.getRulesMarkdown()).toBeUndefined();
  });

  it('getUnitTestsMarkdown returns undefined when no UNIT_TESTS.md', async () => {
    const loader = new PluginLoader(dir);
    await loader.initialize();
    expect(loader.getUnitTestsMarkdown()).toBeUndefined();
  });

  it('getRulesAsContext returns empty string when nothing is loaded', async () => {
    const loader = new PluginLoader(dir);
    await loader.initialize();
    expect(loader.getRulesAsContext()).toBe('');
  });

  // ── With gaia.json ─────────────────────────────────────────────────────────

  it('loads gaia.json and exposes config', async () => {
    writeDocs(dir, {
      'gaia.json': JSON.stringify({
        name: 'TestPlugin',
        config: { testRules: ['No console.log'] },
      }),
    });
    const loader = new PluginLoader(dir);
    await loader.initialize();
    expect(loader.getConfig()).toBeDefined();
    expect(loader.getConfig()?.testRules).toContain('No console.log');
    expect(loader.hasCustomAgents()).toBe(true);
  });

  // ── With RULES.md ──────────────────────────────────────────────────────────

  it('loads RULES.md content', async () => {
    writeDocs(dir, { 'RULES.md': '# Project Rules\n- Use BLoC pattern' });
    const loader = new PluginLoader(dir);
    await loader.initialize();
    expect(loader.getRulesMarkdown()).toContain('Use BLoC pattern');
  });

  it('getRulesAsContext includes RULES.md content', async () => {
    writeDocs(dir, { 'RULES.md': '# Rules\n- Always write tests' });
    const loader = new PluginLoader(dir);
    await loader.initialize();
    expect(loader.getRulesAsContext()).toContain('Always write tests');
  });

  // ── With UNIT_TESTS.md ────────────────────────────────────────────────────

  it('loads UNIT_TESTS.md content', async () => {
    writeDocs(dir, { 'UNIT_TESTS.md': '# Unit Tests\n- Use widget tests' });
    const loader = new PluginLoader(dir);
    await loader.initialize();
    expect(loader.getUnitTestsMarkdown()).toContain('Use widget tests');
  });

  it('getRulesAsContext includes both RULES.md and UNIT_TESTS.md separated by ---', async () => {
    writeDocs(dir, {
      'RULES.md':      '# Rules\n- Rule A',
      'UNIT_TESTS.md': '# Unit Tests\n- Test B',
    });
    const loader = new PluginLoader(dir);
    await loader.initialize();
    const ctx = loader.getRulesAsContext();
    expect(ctx).toContain('Rule A');
    expect(ctx).toContain('Test B');
    expect(ctx).toContain('---');
  });

  // ── getRulesAsContext with structured config ──────────────────────────────

  it('getRulesAsContext includes patterns from config when no RULES.md', async () => {
    writeDocs(dir, {
      'gaia.json': JSON.stringify({
        name: 'TestPlugin',
        config: {
          patterns:  { widget: 'lib/widgets/**' },
          codeRules: ['No hardcoded strings'],
        },
      }),
    });
    const loader = new PluginLoader(dir);
    await loader.initialize();
    const ctx = loader.getRulesAsContext();
    expect(ctx).toContain('lib/widgets/**');
    expect(ctx).toContain('No hardcoded strings');
  });

  // ── createPluginLoader factory ────────────────────────────────────────────

  it('createPluginLoader returns an initialized PluginLoader', async () => {
    const loader = await createPluginLoader(dir);
    expect(loader).toBeInstanceOf(PluginLoader);
    expect(loader.getConfig()).toBeUndefined(); // no gaia.json in tmpDir
  });
});
