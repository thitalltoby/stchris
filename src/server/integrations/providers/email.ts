import 'server-only';
import nodemailer from 'nodemailer';
import { httpCall, providerError, type Adapter } from '../core';

export interface MailInput { to: string; subject: string; text: string; html?: string }
export interface MailResult { status: 'SENT' | 'SKIPPED'; provider: string; messageId?: string; detail?: string }

export const EMAIL_PROVIDERS = ['smtp', 'resend', 'postmark', 'sendgrid'] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export interface EmailConfig {
  provider: EmailProvider;
  from: string;
  baseUrl?: string;
  host?: string;
  port?: string;
  secure?: string;
  user?: string;
  /** API key (resend, postmark, sendgrid) */
  apiKey?: string;
  pass?: string;
}

const DEFAULT_BASE: Record<string, string> = { resend: 'https://api.resend.com', postmark: 'https://api.postmarkapp.com', sendgrid: 'https://api.sendgrid.com' };

/** "Name <a@b.com>" → { name, email } */
export function parseFrom(from: string): { name?: string; email: string } {
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1]?.trim() || undefined, email: m[2]!.trim() } : { email: from.trim() };
}

/** Send one message. Throws on provider failure so the job queue can retry. "SENT" = accepted by the provider, not proof of inbox delivery. */
export async function sendWithConfig(c: EmailConfig, m: MailInput): Promise<MailResult> {
  const base = (c.baseUrl || DEFAULT_BASE[c.provider] || '').replace(/\/$/, '');
  if (c.provider === 'smtp') {
    const transport = nodemailer.createTransport({
      host: c.host,
      port: Number(c.port || 587),
      secure: c.secure === 'true' || c.secure === 'on' || c.secure === '1',
      auth: c.user ? { user: c.user, pass: c.pass } : undefined,
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
    const info = await transport.sendMail({ from: c.from, to: m.to, subject: m.subject, text: m.text, html: m.html });
    return { status: 'SENT', provider: 'smtp', messageId: info.messageId };
  }
  if (c.provider === 'resend') {
    const r = await httpCall(`${base}/emails`, { method: 'POST', headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: c.from, to: [m.to], subject: m.subject, text: m.text, html: m.html }) }, 15_000);
    if (!r.ok) throw new Error(`Resend responded ${providerError(r)}`);
    return { status: 'SENT', provider: 'resend', messageId: (r.json as { id?: string } | null)?.id };
  }
  if (c.provider === 'postmark') {
    const r = await httpCall(`${base}/email`, { method: 'POST', headers: { 'X-Postmark-Server-Token': c.apiKey ?? '', Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ From: c.from, To: m.to, Subject: m.subject, TextBody: m.text, HtmlBody: m.html, MessageStream: 'outbound' }) }, 15_000);
    const j = r.json as { ErrorCode?: number; Message?: string; MessageID?: string } | null;
    if (!r.ok || (j?.ErrorCode ?? 0) !== 0) throw new Error(`Postmark responded ${r.status}: ${j?.Message ?? 'unknown error'}`);
    return { status: 'SENT', provider: 'postmark', messageId: j?.MessageID };
  }
  if (c.provider === 'sendgrid') {
    const f = parseFrom(c.from);
    const content = [{ type: 'text/plain', value: m.text }, ...(m.html ? [{ type: 'text/html', value: m.html }] : [])];
    const r = await httpCall(`${base}/v3/mail/send`, { method: 'POST', headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ personalizations: [{ to: [{ email: m.to }] }], from: f.name ? { email: f.email, name: f.name } : { email: f.email }, subject: m.subject, content }) }, 15_000);
    if (!r.ok) throw new Error(`SendGrid responded ${providerError(r)}`);
    return { status: 'SENT', provider: 'sendgrid', messageId: r.headers.get('x-message-id') ?? undefined };
  }
  throw new Error('Unknown email provider.');
}

const api = { key: 'provider', values: ['resend', 'postmark', 'sendgrid'] };
const smtp = { key: 'provider', values: ['smtp'] };

export const emailAdapter: Adapter = {
  key: 'email',
  name: 'Email delivery',
  category: 'Messaging',
  kind: 'transport',
  purpose: 'Chooses how the platform sends email: verification links, request confirmations, quotation notices and staff alerts. When this is enabled it replaces the server’s environment settings; when it is off the server settings (RESEND_API_KEY or SMTP_*) are used.',
  state: 'implemented',
  requirements: ['A sending domain with SPF and DKIM set up, so messages reach inboxes', 'Either SMTP details or an API key from Resend, Postmark or SendGrid', 'A from address on that domain'],
  verification: 'Tested against local mock servers that check the exact requests. Not yet verified with a live Resend, Postmark, SendGrid or SMTP account: use “Send a test email” with your real credentials.',
  fields: [
    { key: 'provider', label: 'Provider', type: 'select', required: true, options: [{ value: 'smtp', label: 'SMTP server' }, { value: 'resend', label: 'Resend' }, { value: 'postmark', label: 'Postmark' }, { value: 'sendgrid', label: 'SendGrid' }] },
    { key: 'from', label: 'From address', placeholder: 'St. Chris Materials Desk <desk@your-domain.com>', required: true, help: 'Must be on a domain you have verified with the provider.' },
    { key: 'apiKey', label: 'API key', secret: true, showFor: api, required: true, help: 'Resend, Postmark (server token) and SendGrid.' },
    { key: 'host', label: 'SMTP host', showFor: smtp, required: true, placeholder: 'smtp.example.com' },
    { key: 'port', label: 'SMTP port', type: 'number', showFor: smtp, placeholder: '587' },
    { key: 'secure', label: 'Use TLS from the start (usually port 465)', type: 'checkbox', showFor: smtp },
    { key: 'user', label: 'SMTP username', showFor: smtp },
    { key: 'pass', label: 'SMTP password', secret: true, showFor: smtp },
    { key: 'baseUrl', label: 'API base URL (advanced)', showFor: api, help: 'Leave blank. Only for regional endpoints or a proxy.' },
  ],
  events: [],
  validate(config) {
    if (!parseFrom(config.from ?? '').email.includes('@')) throw new Error('Enter a from address such as Name <desk@your-domain.com>.');
  },
  async test(config, secrets, ctx) {
    const r = await sendWithConfig({ ...(config as unknown as EmailConfig), apiKey: secrets.apiKey, pass: secrets.pass }, {
      to: ctx.userEmail,
      subject: 'St. Chris Materials Desk: test message',
      text: 'This is a test message from the St. Chris Materials Desk. If you can read it, outbound email is working.',
    });
    return { ok: true, message: `The provider accepted a test message to ${ctx.userEmail}${r.messageId ? ` (id ${r.messageId.slice(0, 40)})` : ''}. Check that it arrives in the inbox.` };
  },
};
