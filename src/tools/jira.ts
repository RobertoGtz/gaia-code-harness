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
    throw new Error(
      '[Jira] Missing configuration. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env'
    );
  }

  return { baseUrl: baseUrl.replace(/\/$/, ''), email, apiToken };
}

function buildAuthHeader(config: JiraConfig): string {
  return 'Basic ' + Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
}

/**
 * Fetch a Jira ticket by key (e.g. "PROJ-123") and extract structured data.
 */
export async function fetchJiraTicket(issueKey: string): Promise<JiraTicketData> {
  const config = getConfig();
  const url = `${config.baseUrl}/rest/api/3/issue/${issueKey}`;

  const res = await fetch(url, {
    headers: {
      Authorization: buildAuthHeader(config),
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[Jira] Failed to fetch ${issueKey}: HTTP ${res.status} — ${text.slice(0, 300)}`);
  }

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

  const res = await fetch(url, {
    headers: {
      Authorization: buildAuthHeader(config),
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[Jira] Failed to fetch epic ${epicKey}: HTTP ${res.status} — ${text.slice(0, 300)}`);
  }

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
function extractTextFromADF(adf: any): string {
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
function parseACFromText(text: string): string[] {
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
