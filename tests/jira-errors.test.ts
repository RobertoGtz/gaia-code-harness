import {
  JiraError,
  JiraConfigError,
  JiraAuthError,
  JiraNotFoundError,
  JiraRateLimitError,
  JiraServerError,
  JiraNetworkError,
} from '../src/tools/jira';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`PASS: ${message}`);
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function testErrorClasses(): void {
  const configErr = new JiraConfigError();
  assert(configErr.name === 'JiraConfigError', 'JiraConfigError has correct name');
  assert(configErr.message.includes('JIRA_BASE_URL'), 'JiraConfigError mentions env vars');

  const authErr = new JiraAuthError('PROJ-123');
  assert(authErr.name === 'JiraAuthError', 'JiraAuthError has correct name');
  assert(authErr.status === 401, 'JiraAuthError has status 401');
  assert(authErr.jiraKey === 'PROJ-123', 'JiraAuthError stores jiraKey');
  assert(authErr.message.includes('Authentication failed'), 'JiraAuthError message is clear');

  const notFoundErr = new JiraNotFoundError('PROJ-404');
  assert(notFoundErr.status === 404, 'JiraNotFoundError has status 404');
  assert(notFoundErr.message.includes('not found'), 'JiraNotFoundError message is clear');

  const rateErr = new JiraRateLimitError('PROJ-123', 30);
  assert(rateErr.status === 429, 'JiraRateLimitError has status 429');
  assert(rateErr.message.includes('30s'), 'JiraRateLimitError mentions retry-after');

  const serverErr = new JiraServerError('PROJ-123', 503);
  assert(serverErr.status === 503, 'JiraServerError has status 503');
  assert(serverErr.message.includes('503'), 'JiraServerError mentions status code');

  const netErr = new JiraNetworkError('PROJ-123', new Error('ECONNREFUSED'));
  assert(netErr.name === 'JiraNetworkError', 'JiraNetworkError has correct name');
  assert(netErr.message.includes('ECONNREFUSED'), 'JiraNetworkError includes cause message');
}

async function main(): Promise<void> {
  testErrorClasses();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
