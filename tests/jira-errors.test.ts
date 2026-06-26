import {
  JiraConfigError,
  JiraAuthError,
  JiraNotFoundError,
  JiraRateLimitError,
  JiraServerError,
  JiraNetworkError,
} from '../src/tools/jira';

describe('Jira error classes', () => {
  it('JiraConfigError has correct name and mentions env vars', () => {
    const err = new JiraConfigError();
    expect(err.name).toBe('JiraConfigError');
    expect(err.message).toContain('JIRA_BASE_URL');
  });

  it('JiraAuthError has status 401 and stores jiraKey', () => {
    const err = new JiraAuthError('PROJ-123');
    expect(err.name).toBe('JiraAuthError');
    expect(err.status).toBe(401);
    expect(err.jiraKey).toBe('PROJ-123');
    expect(err.message).toContain('Authentication failed');
  });

  it('JiraNotFoundError has status 404', () => {
    const err = new JiraNotFoundError('PROJ-404');
    expect(err.status).toBe(404);
    expect(err.message).toContain('not found');
  });

  it('JiraRateLimitError has status 429 and mentions retry-after', () => {
    const err = new JiraRateLimitError('PROJ-123', 30);
    expect(err.status).toBe(429);
    expect(err.message).toContain('30s');
  });

  it('JiraServerError has the given HTTP status', () => {
    const err = new JiraServerError('PROJ-123', 503);
    expect(err.status).toBe(503);
    expect(err.message).toContain('503');
  });

  it('JiraNetworkError has correct name and includes cause message', () => {
    const err = new JiraNetworkError('PROJ-123', new Error('ECONNREFUSED'));
    expect(err.name).toBe('JiraNetworkError');
    expect(err.message).toContain('ECONNREFUSED');
  });
});
