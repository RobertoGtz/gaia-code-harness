/**
 * Unit tests for notifier factory (src/notifiers/index.ts — buildNotifier).
 * Tests which notifier type is returned based on env vars.
 * No real HTTP calls are made.
 */
import { buildNotifier, NullNotifier } from '../src/notifiers';

function clearNotifierEnv() {
  delete process.env.SLACK_WEBHOOK_URL;
  delete process.env.GITHUB_CHECKS_TOKEN;
  delete process.env.GITHUB_OWNER;
  delete process.env.GITHUB_REPO;
  delete process.env.NOTIFY_WEBHOOK_URL;
  delete process.env.NOTIFY_WEBHOOK_SECRET;
  delete process.env.JIRA_BASE_URL;
  delete process.env.JIRA_EMAIL;
  delete process.env.JIRA_API_TOKEN;
  delete process.env.JIRA_TRANSITION_MAP;
}

describe('buildNotifier', () => {
  beforeEach(clearNotifierEnv);
  afterEach(clearNotifierEnv);

  it('returns NullNotifier when no env vars are set', () => {
    const notifier = buildNotifier();
    expect(notifier).toBeInstanceOf(NullNotifier);
  });

  it('NullNotifier.notify resolves without throwing', async () => {
    const notifier = new NullNotifier();
    await expect(notifier.notify({
      event:     'job.created',
      jobId:     'test-id',
      title:     'Test',
      status:    'pending',
      platform:  'flutter',
      timestamp: new Date().toISOString(),
    })).resolves.toBeUndefined();
  });

  it('returns a non-null notifier when SLACK_WEBHOOK_URL is set', () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    const notifier = buildNotifier();
    expect(notifier).not.toBeInstanceOf(NullNotifier);
  });

  it('returns a non-null notifier when NOTIFY_WEBHOOK_URL is set', () => {
    process.env.NOTIFY_WEBHOOK_URL = 'https://example.com/notify';
    const notifier = buildNotifier();
    expect(notifier).not.toBeInstanceOf(NullNotifier);
  });

  it('returns NullNotifier when GITHUB_CHECKS_TOKEN is set but GITHUB_OWNER/REPO are missing', () => {
    process.env.GITHUB_CHECKS_TOKEN = 'ghp_test';
    // No GITHUB_OWNER or GITHUB_REPO
    const notifier = buildNotifier();
    expect(notifier).toBeInstanceOf(NullNotifier);
  });

  it('returns a non-null notifier when all GitHub Checks env vars are set', () => {
    process.env.GITHUB_CHECKS_TOKEN = 'ghp_test';
    process.env.GITHUB_OWNER        = 'mi-org';
    process.env.GITHUB_REPO         = 'mi-repo';
    const notifier = buildNotifier();
    expect(notifier).not.toBeInstanceOf(NullNotifier);
  });

  it('returns NullNotifier when only JIRA_BASE_URL is set (email + token missing)', () => {
    process.env.JIRA_BASE_URL = 'https://mi-org.atlassian.net';
    const notifier = buildNotifier();
    expect(notifier).toBeInstanceOf(NullNotifier);
  });

  it('returns a non-null notifier when all Jira env vars are set', () => {
    process.env.JIRA_BASE_URL   = 'https://mi-org.atlassian.net';
    process.env.JIRA_EMAIL      = 'dev@mi-org.com';
    process.env.JIRA_API_TOKEN  = 'jira-token';
    const notifier = buildNotifier();
    expect(notifier).not.toBeInstanceOf(NullNotifier);
  });

  it('returns a composite notifier (not NullNotifier) when multiple notifiers are active', () => {
    process.env.SLACK_WEBHOOK_URL  = 'https://hooks.slack.com/test';
    process.env.NOTIFY_WEBHOOK_URL = 'https://example.com/notify';
    const notifier = buildNotifier();
    // Composite is not NullNotifier and has notify()
    expect(notifier).not.toBeInstanceOf(NullNotifier);
    expect(typeof notifier.notify).toBe('function');
  });
});
