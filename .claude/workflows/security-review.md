# Security Review Workflow

> Review a change or the whole repository for security risks before merging.

## When to use

- Before merging a PR with changes to authentication, authorization, input parsing, or secret handling.
- When adding a new dependency or external integration.
- Periodically as a repository sanity review.

## Steps

1. **Attack surface inventory**
   - List endpoints (`src/api/routes/`), webhooks (`src/api/routes/webhook.ts`), notifiers, and tool callers.
2. **Secrets and credentials**
   - Search for hardcoded tokens, keys, or passwords with `grep`.
   - Verify that `.env.example` documents all sensitive variables.
   - Confirm that `src/tools/git.ts` and similar do not log secrets.
3. **Input validation**
   - Review that endpoints validate and sanitize body/params/query.
   - Verify that `src/tools/jira.ts`, `src/tools/slack.ts`, etc., do not pass raw input to an LLM or shell.
4. **Dependencies**
   - Run `npm audit` and evaluate critical findings.
   - Check that no unnecessary or unaudited packages are installed.
5. **GitHub/Git permissions**
   - Review `GITHUB_TOKEN` scopes, error handling, and injected paths.
6. **Report**
   - Write a summary in `progress/security-review-<date>.md`.
   - If there is a critical risk, do not continue until the user authorizes it.

## Verification

- `npm audit` without critical vulnerabilities.
- `grep -R` of keywords (`password`, `token`, `secret`, `api_key`, `apikey`) returns no hardcoded hits.
