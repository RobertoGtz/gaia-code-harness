/**
 * Unit tests for GenericWebhookNotifier (src/notifiers/generic.ts).
 * Uses global fetch mock — no real HTTP calls.
 */
import { createHmac } from 'crypto';
import { GenericWebhookNotifier } from '../src/notifiers/generic';
import { JobEvent } from '../src/notifiers/base';

const baseEvent: JobEvent = {
  event:     'job.created',
  jobId:     'test-job-id',
  title:     'Test feature',
  status:    'pending',
  platform:  'flutter',
  timestamp: '2024-01-01T00:00:00.000Z',
};

describe('GenericWebhookNotifier', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as any).fetch;
  });

  // ── Basic POST ─────────────────────────────────────────────────────────────

  it('POSTs JSON to the configured URL', async () => {
    const notifier = new GenericWebhookNotifier('https://example.com/notify');
    await notifier.notify(baseEvent);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/notify');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('sends the event as JSON body', async () => {
    const notifier = new GenericWebhookNotifier('https://example.com/notify');
    await notifier.notify(baseEvent);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.jobId).toBe('test-job-id');
    expect(body.event).toBe('job.created');
  });

  // ── HMAC signing ───────────────────────────────────────────────────────────

  it('adds X-GAIA-Signature header when secret is provided', async () => {
    const secret   = 'my-secret';
    const notifier = new GenericWebhookNotifier('https://example.com/notify', secret);
    await notifier.notify(baseEvent);
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['X-GAIA-Signature']).toBeDefined();
    expect(headers['X-GAIA-Signature']).toMatch(/^sha256=/);
  });

  it('X-GAIA-Signature matches expected HMAC-SHA256', async () => {
    const secret   = 'my-secret';
    const notifier = new GenericWebhookNotifier('https://example.com/notify', secret);
    await notifier.notify(baseEvent);
    const payload  = JSON.stringify(baseEvent);
    const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    const actual   = fetchMock.mock.calls[0][1].headers['X-GAIA-Signature'];
    expect(actual).toBe(expected);
  });

  it('does NOT add X-GAIA-Signature when no secret', async () => {
    const notifier = new GenericWebhookNotifier('https://example.com/notify');
    await notifier.notify(baseEvent);
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['X-GAIA-Signature']).toBeUndefined();
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it('does not throw when fetch returns non-ok status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const notifier = new GenericWebhookNotifier('https://example.com/notify');
    await expect(notifier.notify(baseEvent)).resolves.not.toThrow();
  });

  it('does not throw when fetch rejects (network error)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const notifier = new GenericWebhookNotifier('https://example.com/notify');
    await expect(notifier.notify(baseEvent)).resolves.not.toThrow();
  });
});
