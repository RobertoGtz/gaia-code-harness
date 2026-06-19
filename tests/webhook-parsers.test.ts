import { parseGenericBody, parseJiraWebhook } from '../src/api/routes/webhook';

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

function testGenericBody(): void {
  const body = {
    title: 'Add banner',
    platform: 'flutter',
    repo: 'demo-repo',
    targetBranch: 'develop',
    jiraTicketId: 'DEMO-100',
    tddMode: true,
    requireTests: false,
    maxFilesToTouch: 6,
    acceptanceCriteria: ['WHEN open THEN show banner'],
  };
  const result = parseGenericBody(body);
  assert(result !== null, 'parseGenericBody returns a trigger');
  assert(result?.requireTests === false, 'generic body respects requireTests:false');
  assert(result?.maxFilesToTouch === 6, 'generic body respects maxFilesToTouch:6');
  assert(result?.tddMode === true, 'generic body preserves tddMode');
}

function testGenericBodyDefaults(): void {
  const body = {
    title: 'Add banner',
    platform: 'ios',
    repo: 'demo-repo-ios',
  };
  const result = parseGenericBody(body);
  assert(result?.requireTests === true, 'generic body defaults requireTests to true');
  assert(result?.maxFilesToTouch === 5, 'generic body defaults maxFilesToTouch to 5');
  assert(result?.targetBranch === 'main', 'generic body defaults targetBranch to main');
}

function testJiraWebhookSkipTests(): void {
  const body = {
    issue: {
      key: 'DEMO-200',
      fields: {
        summary: 'Skip tests ticket',
        labels: ['flutter', 'skip-tests'],
        customfield_repo: 'demo-repo',
      },
    },
  };
  const result = parseJiraWebhook(body);
  assert(result?.requireTests === false, 'jira webhook label skip-tests sets requireTests false');
  assert(result?.maxFilesToTouch === 5, 'jira webhook defaults maxFilesToTouch to 5');
  assert(result?.platform === 'flutter', 'jira webhook infers platform from labels');
}

function testJiraWebhookRequireTestsDefault(): void {
  const body = {
    issue: {
      key: 'DEMO-201',
      fields: {
        summary: 'Normal ticket',
        labels: ['ios'],
        customfield_repo: 'demo-repo-ios',
      },
    },
  };
  const result = parseJiraWebhook(body);
  assert(result?.requireTests === true, 'jira webhook without skip-tests sets requireTests true');
}

async function main(): Promise<void> {
  testGenericBody();
  testGenericBodyDefaults();
  testJiraWebhookSkipTests();
  testJiraWebhookRequireTestsDefault();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
