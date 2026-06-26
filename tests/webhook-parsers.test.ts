import { parseGenericBody, parseJiraWebhook } from '../src/api/routes/webhook';

describe('parseGenericBody', () => {
  it('parses explicit fields correctly', () => {
    const result = parseGenericBody({
      title: 'Add banner',
      platform: 'flutter',
      repo: 'demo-repo',
      targetBranch: 'develop',
      jiraTicketId: 'DEMO-100',
      tddMode: true,
      requireTests: false,
      maxFilesToTouch: 6,
      acceptanceCriteria: ['WHEN open THEN show banner'],
    });
    expect(result).not.toBeNull();
    expect(result?.requireTests).toBe(false);
    expect(result?.maxFilesToTouch).toBe(6);
    expect(result?.tddMode).toBe(true);
  });

  it('applies correct defaults when optional fields are omitted', () => {
    const result = parseGenericBody({ title: 'Add banner', platform: 'ios', repo: 'demo-repo-ios' });
    expect(result?.requireTests).toBe(true);
    expect(result?.maxFilesToTouch).toBe(5);
    expect(result?.targetBranch).toBe('develop');
    expect(result?.tddMode).toBe(false);
  });

  it('passes optional fields through (figmaUrl, jiraEpicId, description, module)', () => {
    const result = parseGenericBody({
      title: 'Add feature',
      platform: 'android',
      repo: 'mi-org/mi-repo',
      figmaUrl: 'https://figma.com/file/abc/design',
      jiraEpicId: 'EPIC-42',
      description: 'Adds a new feature to the home screen',
      module: 'home',
    });
    expect(result?.figmaUrl).toBe('https://figma.com/file/abc/design');
    expect(result?.jiraEpicId).toBe('EPIC-42');
    expect(result?.description).toBe('Adds a new feature to the home screen');
    expect(result?.module).toBe('home');
  });

  it('returns null when required fields are missing', () => {
    expect(parseGenericBody({ platform: 'flutter', repo: 'x' })).toBeNull();
    expect(parseGenericBody({ title: 'x', repo: 'x' })).toBeNull();
    expect(parseGenericBody({ title: 'x', platform: 'flutter' })).toBeNull();
  });
});

describe('parseJiraWebhook', () => {
  it('sets requireTests:false when skip-tests label is present', () => {
    const result = parseJiraWebhook({
      issue: { key: 'DEMO-200', fields: { summary: 'Ticket', labels: ['flutter', 'skip-tests'], customfield_repo: 'demo-repo' } },
    });
    expect(result?.requireTests).toBe(false);
    expect(result?.maxFilesToTouch).toBe(5);
    expect(result?.platform).toBe('flutter');
  });

  it('defaults requireTests:true and targetBranch:develop when no special labels', () => {
    const result = parseJiraWebhook({
      issue: { key: 'DEMO-201', fields: { summary: 'Normal ticket', labels: ['ios'], customfield_repo: 'demo-repo-ios' } },
    });
    expect(result?.requireTests).toBe(true);
    expect(result?.targetBranch).toBe('develop');
    expect(result?.tddMode).toBe(false);
  });

  it('activates tddMode:true when tdd label is present', () => {
    const result = parseJiraWebhook({
      issue: { key: 'DEMO-300', fields: { summary: 'TDD ticket', labels: ['flutter', 'tdd'], customfield_repo: 'mi-org/mi-repo' } },
    });
    expect(result?.tddMode).toBe(true);
    expect(result?.platform).toBe('flutter');
  });

  it('returns null when issue field is missing', () => {
    expect(parseJiraWebhook({})).toBeNull();
    expect(parseJiraWebhook({ webhookEvent: 'jira:issue_created' })).toBeNull();
  });
});
