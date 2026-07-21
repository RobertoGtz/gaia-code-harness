/**
 * Unit tests for Figma design context reader (src/tools/figma.ts).
 * No real network calls; fetch is mocked.
 */
import {
  extractFigmaIds,
  formatFigmaNode,
  fetchFigmaDesignContext,
  FigmaConfigError,
  FigmaAuthError,
  FigmaNotFoundError,
} from '../src/tools/figma';

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('extractFigmaIds', () => {
  it('extracts fileKey and nodeId from a design URL with node-id', () => {
    const url = 'https://figma.com/design/ABC123/MyFile?node-id=1-234';
    expect(extractFigmaIds(url)).toEqual({ fileKey: 'ABC123', nodeId: '1:234' });
  });

  it('extracts fileKey when node-id is absent', () => {
    const url = 'https://figma.com/design/XYZ999/MyFile';
    expect(extractFigmaIds(url)).toEqual({ fileKey: 'XYZ999' });
  });

  it('throws for non-Figma URLs', () => {
    expect(() => extractFigmaIds('https://example.com/file')).toThrow();
  });
});

describe('formatFigmaNode', () => {
  it('summarizes a frame with children', () => {
    const node = {
      type: 'FRAME',
      name: 'Payment Screen',
      absoluteBoundingBox: { width: 375, height: 812 },
      children: [
        { type: 'TEXT', name: 'Title', characters: 'Pay now' },
        { type: 'RECTANGLE', name: 'Primary Button', fills: [{ color: { r: 0.2, g: 0.5, b: 1 } }] },
      ],
    };
    const text = formatFigmaNode(node);
    expect(text).toContain('FRAME: Payment Screen');
    expect(text).toContain('TEXT: Title');
    expect(text).toContain('Pay now');
    expect(text).toContain('RECTANGLE: Primary Button');
  });

  it('ignores vector/path-only nodes', () => {
    const node = { type: 'VECTOR', name: 'Checkmark' };
    expect(formatFigmaNode(node)).toBe('');
  });
});

describe('fetchFigmaDesignContext', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.FIGMA_ACCESS_TOKEN;
  });

  it('throws FigmaConfigError when token is missing', async () => {
    await expect(fetchFigmaDesignContext('https://figma.com/design/ABC123/file')).rejects.toBeInstanceOf(FigmaConfigError);
  });

  it('calls the Figma files endpoint with node-id', async () => {
    process.env.FIGMA_ACCESS_TOKEN = 'token-123';
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        document: {
          type: 'DOCUMENT',
          name: 'My File',
          children: [{
            id: '1:234',
            type: 'FRAME',
            name: 'Checkout',
            absoluteBoundingBox: { width: 100, height: 100 },
            children: [{ type: 'TEXT', name: 'Submit', characters: 'Submit' }],
          }],
        },
      }),
    });

    const ctx = await fetchFigmaDesignContext('https://figma.com/design/ABC123/file?node-id=1-234');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain('https://api.figma.com/v1/files/ABC123');
    expect(callUrl).toContain('node-id=1%3A234');
    expect(ctx).toContain('FRAME: Checkout');
    expect(ctx).toContain('Submit');
  });

  it('throws FigmaAuthError on 403', async () => {
    process.env.FIGMA_ACCESS_TOKEN = 'bad-token';
    mockFetch.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });
    await expect(fetchFigmaDesignContext('https://figma.com/design/ABC123/file')).rejects.toBeInstanceOf(FigmaAuthError);
  });

  it('throws FigmaNotFoundError on 404', async () => {
    process.env.FIGMA_ACCESS_TOKEN = 'token';
    mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
    await expect(fetchFigmaDesignContext('https://figma.com/design/MISSING/file')).rejects.toBeInstanceOf(FigmaNotFoundError);
  });
});
