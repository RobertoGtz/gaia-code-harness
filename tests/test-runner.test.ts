import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runRepoSetupScript } from '../src/tools/test-runner';

describe('runRepoSetupScript', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gaia-setup-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns passed=true when no setup script exists', async () => {
    const result = await runRepoSetupScript(tmpDir);
    expect(result.passed).toBe(true);
    expect(result.command).toBe('');
  });

  it('executes scripts/setup.sh and reports success', async () => {
    const scriptDir = path.join(tmpDir, 'scripts');
    fs.mkdirSync(scriptDir);
    fs.writeFileSync(
      path.join(scriptDir, 'setup.sh'),
      '#!/bin/sh\necho "setup ok"\n',
      { mode: 0o755 }
    );

    const result = await runRepoSetupScript(tmpDir);

    expect(result.passed).toBe(true);
    expect(result.command).toContain('setup.sh');
    expect(result.stdout).toContain('setup ok');
  });

  it('executes scripts/setup.sh and reports failure', async () => {
    const scriptDir = path.join(tmpDir, 'scripts');
    fs.mkdirSync(scriptDir);
    fs.writeFileSync(
      path.join(scriptDir, 'setup.sh'),
      '#!/bin/sh\necho "setup failed" >&2\nexit 1\n',
      { mode: 0o755 }
    );

    const result = await runRepoSetupScript(tmpDir);

    expect(result.passed).toBe(false);
    expect(result.command).toContain('setup.sh');
    expect(result.stderr).toContain('setup failed');
    expect(result.exitCode).toBe(1);
  });

  it('preserves environment variables and sets GIT_LFS_SKIP_SMUDGE', async () => {
    process.env.SETUP_TEST_VAR = 'hello';
    const scriptDir = path.join(tmpDir, 'scripts');
    fs.mkdirSync(scriptDir);
    fs.writeFileSync(
      path.join(scriptDir, 'setup.sh'),
      '#!/bin/sh\necho "$SETUP_TEST_VAR"\necho "$GIT_LFS_SKIP_SMUDGE"\n',
      { mode: 0o755 }
    );

    const result = await runRepoSetupScript(tmpDir);

    expect(result.passed).toBe(true);
    expect(result.stdout).toContain('hello');
    expect(result.stdout).toContain('1');
    delete process.env.SETUP_TEST_VAR;
  });

  it('rewrites Bitbucket overrides to GitHub when RPP token is present', async () => {
    process.env.GITHUB_TOKEN_RPP = 'ghp_token';
    process.env.GITHUB_OWNER_RPP = 'roberto-gutierrez_ghrpp';

    // Origin remote determines the GitHub org for dependencies.
    execSync('git init', { cwd: tmpDir });
    execSync('git remote add origin https://github.com/rpp-co/test-repo.git', { cwd: tmpDir });

    const pkgDir = path.join(tmpDir, 'packages', 'feature');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'pubspec_overrides.yaml'),
      'dependency_overrides:\n' +
      '  pay_pkg:\n' +
      '    git:\n' +
      '      url: https://USERNAME_REPOSITORY:PASSWORD_REPOSITORY@bitbucket.org/rappinc/repo.git\n' +
      '      path: pkg\n',
      'utf8'
    );

    await runRepoSetupScript(tmpDir);

    const content = fs.readFileSync(path.join(pkgDir, 'pubspec_overrides.yaml'), 'utf8');
    expect(content).toContain('https://roberto-gutierrez_ghrpp:ghp_token@github.com/rpp-co/repo.git');
    expect(content).not.toContain('bitbucket.org');

    delete process.env.GITHUB_TOKEN_RPP;
    delete process.env.GITHUB_OWNER_RPP;
  });

  it('rewrites pre-injected Bitbucket credentials to RPP GitHub token', async () => {
    process.env.GITHUB_TOKEN_RPP = 'ghp_token2';
    process.env.GITHUB_OWNER_RPP = 'roberto-gutierrez_ghrpp';

    execSync('git init', { cwd: tmpDir });
    execSync('git remote add origin https://github.com/rpp-co/test-repo.git', { cwd: tmpDir });

    const pkgDir = path.join(tmpDir, 'packages', 'feature2');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'pubspec_overrides.yaml'),
      'dependency_overrides:\n' +
      '  pay_pkg:\n' +
      '    git:\n' +
      '      url: https://rgutierrezgonzalez:oldpass@bitbucket.org/rappinc/repo.git\n' +
      '      path: pkg\n',
      'utf8'
    );

    await runRepoSetupScript(tmpDir);

    const content = fs.readFileSync(path.join(pkgDir, 'pubspec_overrides.yaml'), 'utf8');
    expect(content).toContain('https://roberto-gutierrez_ghrpp:ghp_token2@github.com/rpp-co/repo.git');
    expect(content).not.toContain('bitbucket.org');
    expect(content).not.toContain('oldpass');

    delete process.env.GITHUB_TOKEN_RPP;
    delete process.env.GITHUB_OWNER_RPP;
  });

  it('normalizes GitHub URLs that point to the auth user instead of the org', async () => {
    process.env.GITHUB_TOKEN_RPP = 'ghp_token3';
    process.env.GITHUB_OWNER_RPP = 'roberto-gutierrez_ghrpp';

    execSync('git init', { cwd: tmpDir });
    execSync('git remote add origin https://github.com/rpp-co/test-repo.git', { cwd: tmpDir });

    const pkgDir = path.join(tmpDir, 'packages', 'feature3');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'pubspec_overrides.yaml'),
      'dependency_overrides:\n' +
      '  pay_pkg:\n' +
      '    git:\n' +
      '      url: https://roberto-gutierrez_ghrpp:oldtoken@github.com/roberto-gutierrez_ghrpp/repo.git\n' +
      '      path: pkg\n',
      'utf8'
    );

    await runRepoSetupScript(tmpDir);

    const content = fs.readFileSync(path.join(pkgDir, 'pubspec_overrides.yaml'), 'utf8');
    expect(content).toContain('https://roberto-gutierrez_ghrpp:ghp_token3@github.com/rpp-co/repo.git');
    expect(content).not.toContain('github.com/roberto-gutierrez_ghrpp/');

    delete process.env.GITHUB_TOKEN_RPP;
    delete process.env.GITHUB_OWNER_RPP;
  });
});
