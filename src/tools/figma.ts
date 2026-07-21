/**
 * @fileoverview Figma design context reader — fetches a Figma file/node and
 * converts it into a textual design context that can be injected into the
 * SpecAuthorAgent prompt.
 *
 * Required env var:
 *   FIGMA_ACCESS_TOKEN — personal access token with file_read scope.
 */

// ─── Errors ───────────────────────────────────────────────────────────────────

export class FigmaError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'FigmaError';
  }
}

export class FigmaConfigError extends FigmaError {
  constructor() {
    super('[Figma] Missing configuration. Set FIGMA_ACCESS_TOKEN in .env');
    this.name = 'FigmaConfigError';
  }
}

export class FigmaAuthError extends FigmaError {
  constructor() {
    super('[Figma] Authentication failed. Verify FIGMA_ACCESS_TOKEN is valid and has file_read scope.');
    this.name = 'FigmaAuthError';
  }
}

export class FigmaNotFoundError extends FigmaError {
  constructor(fileKey: string) {
    super(`[Figma] File or node not found: ${fileKey}. Check the URL and permissions.`);
    this.name = 'FigmaNotFoundError';
  }
}

// ─── URL parsing ──────────────────────────────────────────────────────────────

/**
 * Extract Figma file key and optional node id from a Figma URL.
 * Supports https://figma.com/design/{fileKey}/...?node-id={nodeId}
 * Node ids are normalized from "1-234" to "1:234" for the REST API.
 */
export function extractFigmaIds(figmaUrl: string): { fileKey: string; nodeId?: string } {
  const match = figmaUrl.match(/figma\.com\/design\/([A-Za-z0-9_-]+)/);
  if (!match) {
    throw new FigmaError(`[Figma] Cannot extract fileKey from URL: ${figmaUrl}`);
  }
  const fileKey = match[1];
  const nodeMatch = figmaUrl.match(/[?&]node-id=([^&]+)/);
  const nodeId = nodeMatch ? decodeURIComponent(nodeMatch[1]).replace('-', ':') : undefined;
  return { fileKey, nodeId };
}

// ─── Node formatting ──────────────────────────────────────────────────────────

interface FigmaNode {
  id?: string;
  type: string;
  name?: string;
  characters?: string;
  absoluteBoundingBox?: { width: number; height: number };
  fills?: Array<{ color?: { r: number; g: number; b: number; a?: number }; type?: string }>;
  cornerRadius?: number;
  strokeWeight?: number;
  children?: FigmaNode[];
}

function colorToString(color?: { r: number; g: number; b: number; a?: number }): string {
  if (!color) return 'none';
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = color.a ?? 1;
  return a < 1 ? `rgba(${r},${g},${b},${a.toFixed(2)})` : `rgb(${r},${g},${b})`;
}

function nodeSummary(node: FigmaNode): string {
  const parts: string[] = [];
  if (node.absoluteBoundingBox) {
    parts.push(`${node.absoluteBoundingBox.width}x${node.absoluteBoundingBox.height}`);
  }
  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.color) parts.push(`fill:${colorToString(fill.color)}`);
  }
  if (node.cornerRadius) parts.push(`radius:${node.cornerRadius}`);
  if (node.strokeWeight) parts.push(`stroke:${node.strokeWeight}`);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

/**
 * Recursively format a Figma node tree into a concise text description.
 * Skips decorative vector/path-only nodes.
 */
export function formatFigmaNode(node: FigmaNode, depth = 0): string {
  const skipTypes = new Set(['VECTOR', 'STAR', 'LINE', 'ELLIPSE', 'POLYGON', 'SLICE']);
  if (skipTypes.has(node.type)) return '';

  const indent = '  '.repeat(depth);
  const name = node.name || 'Untitled';
  const summary = nodeSummary(node);
  let lines = [`${indent}${node.type}: ${name}${summary}`];

  if (node.type === 'TEXT' && node.characters) {
    lines.push(`${indent}  text: "${node.characters.replace(/\n/g, ' ')}"`);
  }

  if (node.children) {
    for (const child of node.children) {
      const childText = formatFigmaNode(child, depth + 1);
      if (childText) lines.push(childText);
    }
  }

  // If a non-leaf node produced no visible children, still keep its own line.
  if (lines.length === 1 && depth > 0) {
    return lines[0];
  }
  return lines.join('\n');
}

// ─── Fetch design context ───────────────────────────────────────────────────────

function getConfig(): { token: string } {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) {
    throw new FigmaConfigError();
  }
  return { token };
}

function classifyError(status: number, fileKey: string): FigmaError {
  if (status === 401 || status === 403) return new FigmaAuthError();
  if (status === 404) return new FigmaNotFoundError(fileKey);
  return new FigmaError(`[Figma] API returned HTTP ${status}`, status);
}

/**
 * Fetch a Figma design URL and return a textual description of the requested node
 * (or the first top-level frame if no node-id is provided).
 */
export async function fetchFigmaDesignContext(figmaUrl: string): Promise<string> {
  const { fileKey, nodeId } = extractFigmaIds(figmaUrl);
  const { token } = getConfig();

  const params = new URLSearchParams();
  if (nodeId) params.set('node-id', nodeId);
  params.set('geometry', 'paths');

  const url = `https://api.figma.com/v1/files/${fileKey}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'X-Figma-Token': token },
  });

  if (!res.ok) {
    throw classifyError(res.status, fileKey);
  }

  const data = (await res.json()) as { document?: FigmaNode; name?: string };
  if (!data.document) {
    return `Figma file: ${data.name ?? fileKey}\nNo document structure available.`;
  }

  // If a node-id was requested, locate that node inside the document tree.
  const targetNode = nodeId ? findNodeById(data.document, nodeId) : undefined;
  const root = targetNode ?? firstFrame(data.document) ?? data.document;

  const formatted = formatFigmaNode(root);
  return [
    `Figma file: ${data.name ?? fileKey}${nodeId ? ` (node: ${nodeId})` : ''}`,
    '',
    formatted || '(no parseable nodes)',
  ].join('\n');
}

function findNodeById(root: FigmaNode, id: string): FigmaNode | undefined {
  if (root.id === id) return root;
  if (!root.children) return undefined;
  for (const child of root.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return undefined;
}

function firstFrame(root: FigmaNode): FigmaNode | undefined {
  if (root.type === 'FRAME' || root.type === 'CANVAS') return root;
  if (!root.children) return undefined;
  for (const child of root.children) {
    const found = firstFrame(child);
    if (found) return found;
  }
  return undefined;
}
