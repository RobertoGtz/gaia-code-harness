/**
 * @fileoverview Generic HTTP webhook notifier
 * @description POSTs a JSON payload to any arbitrary endpoint.
 *              Configure via NOTIFY_WEBHOOK_URL env var.
 *              Optionally signs the payload with NOTIFY_WEBHOOK_SECRET (HMAC-SHA256).
 */

import { JobNotifier, JobEvent } from './base';
import { createHmac } from 'crypto';

export class GenericWebhookNotifier implements JobNotifier {
  constructor(
    private readonly url:    string,
    private readonly secret?: string,
  ) {}

  async notify(event: JobEvent): Promise<void> {
    try {
      const payload = JSON.stringify(event);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.secret) {
        const sig = createHmac('sha256', this.secret).update(payload).digest('hex');
        headers['X-GAIA-Signature'] = `sha256=${sig}`;
      }

      const res = await fetch(this.url, { method: 'POST', headers, body: payload });
      if (!res.ok) {
        console.warn(`[GenericWebhookNotifier] HTTP ${res.status} for event ${event.event}`);
      }
    } catch (err) {
      console.warn(`[GenericWebhookNotifier] Failed to send notification: ${err}`);
    }
  }
}
