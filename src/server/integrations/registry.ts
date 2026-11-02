import 'server-only';
import { createHmac } from 'node:crypto';
import { assertSafeUrl, httpCall, EVENTS, type Adapter } from './core';
import { emailAdapter } from './providers/email';
import { smsAdapter } from './providers/sms';
import { whatsappAdapter } from './providers/whatsapp';
import { analyticsAdapter } from './providers/analytics';
import { restAdapters } from './providers/rest';

export { assertSafeUrl, EVENTS } from './core';
export type { Adapter, ConfigField, EventName, IntegrationState } from './core';

const webhook: Adapter = {
  key: 'webhook',
  name: 'Outbound webhook',
  category: 'Automation / CRM / Accounting middleware',
  purpose: 'Sends signed JSON events (new request, status change, quotation issued/accepted/declined) to any HTTPS endpoint — for example a CRM, an accounting system or an automation tool such as Zapier or n8n that St. Chris already uses.',
  state: 'implemented',
  kind: 'events',
  verification: 'Tested against a local mock receiver, including the signature check.',
  requirements: ['An HTTPS endpoint that accepts POST requests', 'A shared secret so the receiver can verify the X-StChris-Signature header'],
  fields: [
    { key: 'url', label: 'Endpoint URL', placeholder: 'https://example.com/hooks/stchris', required: true },
    { key: 'secret', label: 'Signing secret', secret: true, help: 'Used to compute an HMAC-SHA256 of the body. Share it with the receiver.', required: true },
  ],
  events: [...EVENTS],
  async test(config, secrets) {
    const body = JSON.stringify({ event: 'ping', at: new Date().toISOString() });
    const res = await post(config.url ?? '', secrets.secret ?? '', 'ping', body);
    return { ok: res.ok, message: res.ok ? `The endpoint answered ${res.status}.` : `The endpoint answered ${res.status}.` };
  },
  async handle(event, payload, config, secrets) {
    const body = JSON.stringify({ event, at: new Date().toISOString(), data: payload });
    const res = await post(config.url ?? '', secrets.secret ?? '', event, body);
    if (!res.ok) throw new Error(`Endpoint answered ${res.status}`);
    return { summary: `Delivered ${event} (${res.status})` };
  },
};

async function post(url: string, secret: string, event: string, body: string) {
  const u = await assertSafeUrl(url);
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  return fetch(u, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-StChris-Event': event, 'X-StChris-Signature': `sha256=${sig}`, 'User-Agent': 'StChrisMaterialsDesk/1.0' },
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
}


export const ADAPTERS: Adapter[] = [emailAdapter, webhook, smsAdapter, whatsappAdapter, analyticsAdapter, ...restAdapters];

export const adapterByKey = (key: string) => ADAPTERS.find((a) => a.key === key);
