/**
 * @fileoverview Jira ticket reader — fetches issue details from Jira REST API.
 * @description Reads title, description, acceptance criteria, Figma links,
 *              priority, and labels from a Jira ticket.
 *
 * Required env vars:
 *   JIRA_BASE_URL   — e.g. https://your-org.atlassian.net
 *   JIRA_EMAIL      — Jira user email (basic auth)
 *   JIRA_API_TOKEN  — Jira API token
 */

import { Platform } from '../types';

// ─── Jira-specific errors ─────────────────────────────────────────────────────

export class JiraError extends Error {
  constructor(message: string, public readonly status?: number, public readonly jiraKey?: string) {
    super(message);
    this.name = 'JiraError';
  }
}

export class JiraConfigError extends JiraError {
  constructor() {
    super(
      '[Jira] Missing configuration. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env'
    );
    this.name = 'JiraConfigError';
  }
}

export class JiraAuthError extends JiraError {
  constructor(jiraKey: string) {
    super(
      `[Jira] Authentication failed for ${jiraKey}. Verify JIRA_EMAIL and JIRA_API_TOKEN are correct and the token has read access.`,
      401,
      jiraKey
    );
    this.name = 'JiraAuthError';
  }
}

export class JiraNotFoundError extends JiraError {
  constructor(jiraKey: string) {
    super(
      `[Jira] Ticket ${jiraKey} not found. Check the ticket key and that your account has Browse Projects permission.`,
      404,
      jiraKey
    );
    this.name = 'JiraNotFoundError';
  }
}

export class JiraRateLimitError extends JiraError {
  constructor(jiraKey: string, retryAfterSeconds?: number) {
    const hint = retryAfterSeconds ? ` Retry after ${retryAfterSeconds}s.` : '';
    super(
      `[Jira] Rate limit hit for ${jiraKey}.${hint} Wait before retrying or use a different API token.`,
      429,
      jiraKey
    );
    this.name = 'JiraRateLimitError';
  }
}

export class JiraServerError extends JiraError {
  constructor(jiraKey: string, status: number) {
    super(
      `[Jira] Jira server returned ${status} for ${jiraKey}. This is a temporary Jira issue — retry later.`,
      status,
      jiraKey
    );
    this.name = 'JiraServerError';
  }
}

export class JiraNetworkError extends JiraError {
  constructor(jiraKey: string, cause: Error) {
    super(
      `[Jira] Network error fetching ${jiraKey}: ${cause.message}. Check JIRA_BASE_URL and network connectivity.`,
      undefined,
      jiraKey
    );
    this.name = 'JiraNetworkError';
  }
}

export interface JiraTicketData {
  key: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  figmaUrl?: string;
  platform?: Platform;
  repo?: string;
  targetBranch?: string;
  priority?: string;
  labels: string[];
  epicKey?: string;
}

interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

function getConfig(): JiraConfig {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    throw new JiraConfigError();
  }

  return { baseUrl: baseUrl.replace(/\/$/, ''), email, apiToken };
}

function buildAuthHeader(config: JiraConfig): string {
  return 'Basic ' + Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function classifyError(status: number, jiraKey: string, retryAfter?: number): JiraError {
  if (status === 401 || status === 403) return new JiraAuthError(jiraKey);
  if (status === 404) return new JiraNotFoundError(jiraKey);
  if (status === 429) return new JiraRateLimitError(jiraKey, retryAfter);
  if (status >= 500) return new JiraServerError(jiraKey, status);
  return new JiraError(`[Jira] Unexpected HTTP ${status} for ${jiraKey}.`, status, jiraKey);
}

/**
 * Fetch a Jira URL with retries and clear error classification.
 */
async function fetchWithRetry(
  url: string,
  config: JiraConfig,
  jiraKey: string,
  opts: { retries?: number; baseDelayMs?: number } = {}
): Promise<Response> {
  const { retries = 3, baseDelayMs = 500 } = opts;
  let lastError: JiraError | undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: buildAuthHeader(config),
          Accept: 'application/json',
        },
      });

      if (res.ok) return res;

      const retryAfter = res.headers.get('retry-after');
      const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
      lastError = classifyError(res.status, jiraKey, retryAfterSeconds);

      // Do not retry auth/not-found/client errors
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throw lastError;
      }

      if (attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[Jira] Attempt ${attempt} failed for ${jiraKey} (HTTP ${res.status}). Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    } catch (err) {
      if (err instanceof JiraError) {
        lastError = err;
        if (err instanceof JiraAuthError || err instanceof JiraNotFoundError) throw err;
      } else if (err instanceof Error) {
        lastError = new JiraNetworkError(jiraKey, err);
      } else {
        lastError = new JiraError(`[Jira] Unknown error fetching ${jiraKey}: ${String(err)}`);
      }

      if (attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[Jira] Attempt ${attempt} failed for ${jiraKey}. Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new JiraError(`[Jira] Failed to fetch ${jiraKey} after ${retries} attempts.`);
}

/**
 * Fetch a Jira ticket by key (e.g. "PROJ-123") and extract structured data.
 */
export async function fetchJiraTicket(issueKey: string): Promise<JiraTicketData> {
  const config = getConfig();
  const url = `${config.baseUrl}/rest/api/3/issue/${issueKey}`;

  const res = await fetchWithRetry(url, config, issueKey);
  const data = await res.json() as any;
  const fields = data.fields;

  // Extract basic info
  const title = fields.summary ?? '';
  const priority = fields.priority?.name ?? '';
  const labels: string[] = fields.labels ?? [];
  const epicKey = fields.parent?.key ?? fields.customfield_10014 ?? undefined;

  // Extract description (ADF → plain text)
  const description = extractTextFromADF(fields.description);

  // Extract acceptance criteria from:
  // 1. Custom field "Acceptance Criteria" (common names)
  // 2. Parsing from description
  const acceptanceCriteria = extractAcceptanceCriteria(fields, description);

  // Extract Figma URL from description or custom field
  const figmaUrl = extractFigmaUrl(fields, description);

  // Infer platform from labels
  const platform = inferPlatform(labels);

  // Infer repo from custom field or labels
  const repo = fields.customfield_repo ?? inferRepo(labels);

  return {
    key: data.key,
    title,
    description,
    acceptanceCriteria,
    figmaUrl,
    platform,
    repo,
    priority,
    labels,
    epicKey,
  };
}

/**
 * Fetch all tickets in a Jira epic.
 */
export async function fetchJiraEpicTickets(epicKey: string): Promise<JiraTicketData[]> {
  const config = getConfig();
  const jql = encodeURIComponent(`"Epic Link" = "${epicKey}" OR parent = "${epicKey}" ORDER BY rank ASC`);
  const url = `${config.baseUrl}/rest/api/3/search?jql=${jql}&maxResults=50`;

  const res = await fetchWithRetry(url, config, epicKey);
  const data = await res.json() as any;
  const issues = data.issues ?? [];

  return issues.map((issue: any) => {
    const fields = issue.fields;
    const description = extractTextFromADF(fields.description);
    const labels: string[] = fields.labels ?? [];

    return {
      key: issue.key,
      title: fields.summary ?? '',
      description,
      acceptanceCriteria: extractAcceptanceCriteria(fields, description),
      figmaUrl: extractFigmaUrl(fields, description),
      platform: inferPlatform(labels),
      repo: fields.customfield_repo ?? inferRepo(labels),
      priority: fields.priority?.name ?? '',
      labels,
      epicKey,
    } as JiraTicketData;
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert Atlassian Document Format (ADF) to plain text.
 */
export function extractTextFromADF(adf: any): string {
  if (!adf || typeof adf !== 'object') return '';

  const lines: string[] = [];

  function walk(node: any, indent = '') {
    if (!node) return;

    if (node.type === 'text') {
      lines.push(indent + (node.text ?? ''));
      return;
    }

    if (node.type === 'hardBreak') {
      lines.push('');
      return;
    }

    // Handle list items
    if (node.type === 'listItem') {
      indent = indent + '- ';
    }

    if (node.type === 'heading') {
      lines.push(''); // blank line before headings
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child, indent);
      }
    }

    if (node.type === 'paragraph' || node.type === 'heading') {
      lines.push(''); // blank line after paragraphs
    }
  }

  walk(adf);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extract acceptance criteria from custom fields or description patterns.
 */
function extractAcceptanceCriteria(fields: any, description: string): string[] {
  // Try common custom field names for AC
  const acFields = [
    fields.customfield_10100, // "Acceptance Criteria" — varies by org
    fields.customfield_10101,
    fields.customfield_10028,
  ];

  for (const acField of acFields) {
    if (acField) {
      const text = typeof acField === 'string' ? acField : extractTextFromADF(acField);
      const parsed = parseACFromText(text);
      if (parsed.length > 0) return parsed;
    }
  }

  // Fallback: parse from description
  return parseACFromText(description);
}

/**
 * Parse acceptance criteria from text using common patterns:
 * - GIVEN/WHEN/THEN
 * - "AC:" or "Acceptance Criteria:" section
 * - Bullet points after "Criteria" heading
 */
export function parseACFromText(text: string): string[] {
  if (!text) return [];
  const criteria: string[] = [];

  // Pattern 1: GIVEN/WHEN/THEN blocks
  const gwtPattern = /(?:GIVEN|Given)\s+.+?(?:THEN|Then)\s+[^\n]+/g;
  const gwtMatches = text.match(gwtPattern);
  if (gwtMatches && gwtMatches.length > 0) {
    return gwtMatches.map(m => m.trim());
  }

  // Pattern 2: WHEN...THEN one-liners (EARS format)
  const whenThenPattern = /WHEN\s+.+?THEN\s+[^\n]+/gi;
  const wtMatches = text.match(whenThenPattern);
  if (wtMatches && wtMatches.length > 0) {
    return wtMatches.map(m => m.trim());
  }

  // Pattern 3: Section after "Acceptance Criteria" or "AC:"
  const acSection = text.match(/(?:Acceptance\s+Criteria|AC)\s*:?\s*\n([\s\S]+?)(?:\n\n|\n(?=[A-Z])|\$)/i);
  if (acSection) {
    const lines = acSection[1].split('\n').map(l => l.replace(/^[\s\-\*•]+/, '').trim()).filter(Boolean);
    if (lines.length > 0) return lines;
  }

  // Pattern 4: Bullet points that look like criteria
  const bullets = text.split('\n')
    .filter(l => /^[\s]*[-*•]\s/.test(l))
    .map(l => l.replace(/^[\s\-\*•]+/, '').trim())
    .filter(l => l.length > 10); // skip very short bullets

  if (bullets.length > 0) return bullets;

  return criteria;
}

/**
 * Extract Figma URL from description or custom field.
 */
function extractFigmaUrl(fields: any, description: string): string | undefined {
  // Check custom field
  if (fields.customfield_figma) return fields.customfield_figma;

  // Search in description
  const figmaPattern = /https:\/\/(?:www\.)?figma\.com\/(?:file|design)\/[^\s)>\]]+/i;
  const match = description.match(figmaPattern);
  return match?.[0];
}

/**
 * Infer platform from Jira labels.
 */
function inferPlatform(labels: string[]): Platform | undefined {
  const lower = labels.map(l => l.toLowerCase());
  if (lower.includes('flutter') || lower.includes('flutter_app')) return 'flutter';
  if (lower.includes('flutter_web')) return 'flutter_web';
  if (lower.includes('ios') || lower.includes('swift')) return 'ios';
  if (lower.includes('android') || lower.includes('kotlin')) return 'android';
  return undefined;
}

/**
 * Infer repo name from labels (convention: label "repo:name").
 */
function inferRepo(labels: string[]): string | undefined {
  const repoLabel = labels.find(l => l.startsWith('repo:'));
  return repoLabel?.slice(5) ?? undefined;
}
