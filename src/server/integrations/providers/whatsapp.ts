import 'server-only';
import { httpCall, maskPhone, providerError, toE164, type Adapter } from '../core';
import { consentedNumber, messageFor } from './sms';

interface WaConfig { phoneNumberId?: string; apiVersion?: string; baseUrl?: string; templateStatus?: string; templateQuotation?: string; templateLanguage?: string; countryCode?: string; testNumber?: string }

/** WhatsApp Business Platform (Cloud API). Business-initiated messages must use a template Meta has approved. */
export async function sendTemplate(c: WaConfig, token: string, to: string, name: string, language: string, params: string[]): Promise<string> {
  const base = (c.baseUrl || 'https://graph.facebook.com').replace(/\/$/, '');
  const url = `${base}/${c.apiVersion || 'v20.0'}/${encodeURIComponent(c.phoneNumberId ?? '')}/messages`;
  const template: Record<string, unknown> = { name, language: { code: language } };
  if (params.length) template.components = [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }];
  const r = await httpCall(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template }) });
  if (!r.ok) {
    const e = (r.json as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(`WhatsApp responded ${r.status}: ${e ?? providerError(r)}`.slice(0, 300));
  }
  return String((r.json as { messages?: { id: string }[] } | null)?.messages?.[0]?.id ?? '');
}

export const whatsappAdapter: Adapter = {
  key: 'whatsapp',
  name: 'WhatsApp',
  category: 'Messaging',
  kind: 'events',
  purpose: 'Sends WhatsApp template messages when a request changes status and when a quotation is issued, only to customers who ticked the WhatsApp box on the request form. Messages are logged as “accepted by WhatsApp”; delivery and read receipts are not collected.',
  state: 'implemented',
  requirements: ['A Meta business account with a verified WhatsApp Business number', 'A permanent access token and the phone-number ID', 'Two approved message templates: one for request status ({{1}} reference, {{2}} status) and one for quotations ({{1}} quotation number, {{2}} request reference)'],
  verification: 'Tested against a local mock of the Cloud API that checks the exact request. Not yet verified with a live WhatsApp Business account: Meta’s template approval and number verification happen on their side.',
  fields: [
    { key: 'phoneNumberId', label: 'Phone number ID', required: true },
    { key: 'accessToken', label: 'Access token', secret: true, required: true },
    { key: 'templateStatus', label: 'Status template name', required: true, help: 'Body takes two variables: {{1}} request reference, {{2}} status.' },
    { key: 'templateQuotation', label: 'Quotation template name', required: true, help: 'Body takes two variables: {{1}} quotation number, {{2}} request reference.' },
    { key: 'templateLanguage', label: 'Template language code', placeholder: 'en' },
    { key: 'countryCode', label: 'Default country code for local numbers', placeholder: '234' },
    { key: 'testNumber', label: 'Number for test messages', placeholder: '+234…', help: 'The test sends Meta’s standard hello_world template (language en_US), which every new account has.' },
    { key: 'apiVersion', label: 'Graph API version (advanced)', placeholder: 'v20.0' },
    { key: 'baseUrl', label: 'API base URL (advanced)', help: 'Leave blank.' },
  ],
  events: ['request.status_changed', 'quotation.issued'],
  validate(config) {
    if (config.testNumber && !toE164(config.testNumber, config.countryCode || '234')) throw new Error('The test number is not a valid phone number.');
  },
  async test(config, secrets) {
    const n = toE164(config.testNumber ?? '', config.countryCode || '234');
    if (!n) throw new Error('Save a valid test number first.');
    const id = await sendTemplate(config, secrets.accessToken ?? '', n, 'hello_world', 'en_US', []);
    return { ok: true, message: `WhatsApp accepted the test template for ${maskPhone(n)}${id ? ` (id ${id.slice(0, 40)})` : ''}. Confirm it arrived.` };
  },
  async handle(event, payload, config, secrets) {
    const p = payload as Record<string, unknown>;
    const msg = messageFor(event, p);
    if (!msg) return { summary: 'Skipped: no customer message for this event' };
    const target = await consentedNumber(String(p.reference ?? p.request ?? ''), 'whatsapp', config.countryCode);
    if ('skip' in target) return { summary: `Skipped: ${target.skip}` };
    const status = event === 'request.status_changed';
    const id = await sendTemplate(config, secrets.accessToken ?? '', target.digits, (status ? config.templateStatus : config.templateQuotation) ?? '', config.templateLanguage || 'en', status ? msg.params.status : msg.params.quotation);
    return { summary: `Accepted by WhatsApp for ${maskPhone(target.digits)}${id ? ` (${id.slice(-12)})` : ''}` };
  },
};
