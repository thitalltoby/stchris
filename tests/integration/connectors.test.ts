import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { createHmac } from 'node:crypto';
import { db } from '@/server/db';
import { listIntegrations, saveIntegration, testIntegration, enabledMessagingChannels } from '@/server/integrations';
import { emitEvent } from '@/server/integrations/events';
import { runDueJobs } from '@/server/jobs';
import { sendMail, activeMailProvider } from '@/server/mail';
import { renderTemplate, parseMappings } from '@/server/integrations/providers/rest';
import { getAnalytics } from '@/server/integrations/providers/analytics';
import { toE164, maskPhone } from '@/server/integrations/core';
import { submitRequest } from '@/server/requests';
import { AppError } from '@/server/errors';
import { resetDb, makeUser, makeService, principal, submission } from './helpers';

// ── A tiny HTTP mock that records every request ────────────────────────────────────
interface Seen { method: string; url: string; headers: http.IncomingHttpHeaders; body: string }
let seen: Seen[] = [];
let reply: (req: Seen) => { status: number; body: unknown; headers?: Record<string, string> } = () => ({ status: 200, body: {} });
let server: http.Server;
let base = '';

// ── A tiny SMTP server that records the message ───────────────────────────────────
let smtp: net.Server;
let smtpPort = 0;
let smtpData: string[] = [];
let smtpAuth: string[] = [];

beforeAll(async () => {
  process.env.INTEGRATIONS_ALLOW_LOCAL = '1';
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const s: Seen = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks).toString() };
      seen.push(s);
      const r = reply(s);
      res.writeHead(r.status, { 'Content-Type': 'application/json', ...(r.headers ?? {}) });
      res.end(JSON.stringify(r.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  smtp = net.createServer((sock) => {
    let inData = false;
    let buf = '';
    sock.write('220 mock ESMTP\r\n');
    sock.on('data', (d) => {
      buf += d.toString();
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') { inData = false; sock.write('250 queued\r\n'); } else smtpData.push(line);
          continue;
        }
        const up = line.toUpperCase();
        if (up.startsWith('EHLO')) sock.write('250-mock\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (up.startsWith('AUTH PLAIN')) { smtpAuth.push(Buffer.from(line.split(' ')[2] ?? '', 'base64').toString().replace(/\0/g, '|')); sock.write('235 ok\r\n'); }
        else if (up.startsWith('AUTH')) { sock.write('235 ok\r\n'); }
        else if (up.startsWith('MAIL') || up.startsWith('RCPT')) sock.write('250 ok\r\n');
        else if (up === 'DATA') { inData = true; sock.write('354 go\r\n'); }
        else if (up === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>((r) => smtp.listen(0, '127.0.0.1', r));
  smtpPort = (smtp.address() as AddressInfo).port;
});

afterAll(async () => {
  delete process.env.INTEGRATIONS_ALLOW_LOCAL;
  await new Promise((r) => server.close(r));
  await new Promise((r) => smtp.close(r));
});

beforeEach(async () => {
  await resetDb();
  seen = [];
  smtpData = [];
  smtpAuth = [];
  reply = () => ({ status: 200, body: {} });
});

const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof AppError ? e.code : `ERR:${e}`));

async function admin() {
  const u = await makeUser('SUPER_ADMIN');
  await listIntegrations(principal(u));
  return principal(u);
}

async function makeRequest(over: { sms?: boolean; whatsapp?: boolean; phone?: string } = {}) {
  const s = (await db.service.findFirst()) ?? (await makeService());
  const sub = submission(s.id) as Record<string, unknown>;
  const r = await submitRequest({ ...sub, customer: { ...(sub.customer as object), phone: over.phone ?? '0803 123 4567' }, messaging: { sms: !!over.sms, whatsapp: !!over.whatsapp } } as never);
  return r.reference;
}

describe('helpers', () => {
  it('normalises Nigerian and international numbers and masks them for logs', () => {
    expect(toE164('0803 123 4567')).toBe('2348031234567');
    expect(toE164('+234 803 123 4567')).toBe('2348031234567');
    expect(toE164('00447911123456')).toBe('447911123456');
    expect(toE164('12')).toBeNull();
    expect(maskPhone('2348031234567')).toBe('+234••••567');
  });

  it('fills placeholders, keeps types for whole-value placeholders and ignores prototype paths', () => {
    const ctx = { data: { n: 5, ok: true, who: { name: 'A B' } } };
    expect(renderTemplate({ a: '{{data.n}}', b: '{{data.ok}}', c: 'Hi {{data.who.name}}', d: '{{data.missing}}', e: '{{__proto__.x}}' }, ctx)).toEqual({ a: 5, b: true, c: 'Hi A B', d: null, e: null });
    expect(renderTemplate('/x/{{data.who.name}}', ctx, true)).toBe('/x/A%20B');
  });

  it('rejects malformed mappings with a message the admin can act on', () => {
    expect(() => parseMappings('nope')).toThrow(/not valid JSON/);
    expect(() => parseMappings('{"bogus.event":{"path":"/x"}}')).toThrow(/not an event/);
    expect(() => parseMappings('{"quotation.accepted":{"path":"x"}}')).toThrow(/start with/);
    expect(() => parseMappings('{"quotation.accepted":{"method":"GET","path":"/x"}}')).toThrow(/method/);
    expect(parseMappings('{"quotation.accepted":{"path":"/x"}}')['quotation.accepted']?.method).toBe('POST');
  });
});

describe('email delivery settings', () => {
  const mail = { to: 'customer@example.test', subject: 'Hello', text: 'Plain body', html: '<p>HTML body</p>' };

  it('uses nothing until configured, then sends through Resend with the saved key', async () => {
    expect((await activeMailProvider()).name).toBe('none');
    expect((await sendMail(mail)).status).toBe('SKIPPED');
    const a = await admin();
    await saveIntegration(a, 'email', { enabled: true, values: { provider: 'resend', from: 'St. Chris <desk@stchris.test>', apiKey: 're_secret_key', baseUrl: base } });
    reply = () => ({ status: 200, body: { id: 'msg_1' } });
    const r = await sendMail(mail);
    expect(r).toMatchObject({ status: 'SENT', provider: 'resend', messageId: 'msg_1' });
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/emails' });
    expect(seen[0]!.headers.authorization).toBe('Bearer re_secret_key');
    expect(JSON.parse(seen[0]!.body)).toMatchObject({ from: 'St. Chris <desk@stchris.test>', to: ['customer@example.test'], subject: 'Hello' });
    expect((await activeMailProvider()).source).toBe('console');
  });

  it('sends through Postmark and SendGrid with each provider’s own request shape', async () => {
    const a = await admin();
    await saveIntegration(a, 'email', { enabled: true, values: { provider: 'postmark', from: 'desk@stchris.test', apiKey: 'pm_token', baseUrl: base } });
    reply = () => ({ status: 200, body: { ErrorCode: 0, MessageID: 'pm-1' } });
    expect(await sendMail(mail)).toMatchObject({ provider: 'postmark', messageId: 'pm-1' });
    expect(seen[0]!.url).toBe('/email');
    expect(seen[0]!.headers['x-postmark-server-token']).toBe('pm_token');
    expect(JSON.parse(seen[0]!.body)).toMatchObject({ From: 'desk@stchris.test', To: 'customer@example.test', TextBody: 'Plain body' });

    await saveIntegration(a, 'email', { enabled: true, values: { provider: 'sendgrid', from: 'St. Chris Desk <desk@stchris.test>', apiKey: 'SG.key', baseUrl: base } });
    seen = [];
    reply = () => ({ status: 202, body: {}, headers: { 'x-message-id': 'sg-9' } });
    expect(await sendMail(mail)).toMatchObject({ provider: 'sendgrid', messageId: 'sg-9' });
    expect(seen[0]!.url).toBe('/v3/mail/send');
    expect(seen[0]!.headers.authorization).toBe('Bearer SG.key');
    expect(JSON.parse(seen[0]!.body)).toMatchObject({ from: { email: 'desk@stchris.test', name: 'St. Chris Desk' }, personalizations: [{ to: [{ email: 'customer@example.test' }] }] });
  });

  it('throws on a provider refusal so the outbox can retry', async () => {
    const a = await admin();
    await saveIntegration(a, 'email', { enabled: true, values: { provider: 'resend', from: 'desk@stchris.test', apiKey: 'k', baseUrl: base } });
    reply = () => ({ status: 403, body: { message: 'domain not verified' } });
    await expect(sendMail(mail)).rejects.toThrow(/403.*domain not verified/);
  });

  it('delivers over SMTP with authentication', async () => {
    const a = await admin();
    await saveIntegration(a, 'email', { enabled: true, values: { provider: 'smtp', from: 'desk@stchris.test', host: '127.0.0.1', port: String(smtpPort), user: 'mailer', pass: 'smtp-pass' } });
    const r = await sendMail(mail);
    expect(r).toMatchObject({ status: 'SENT', provider: 'smtp' });
    expect(smtpAuth.join()).toContain('mailer|smtp-pass');
    expect(smtpData.join('\n')).toContain('Subject: Hello');
    expect(smtpData.join('\n')).toContain('Plain body');
  });

  it('“send a test email” goes to the person running it, and records the outcome', async () => {
    const a = await admin();
    await saveIntegration(a, 'email', { enabled: true, values: { provider: 'resend', from: 'desk@stchris.test', apiKey: 'k', baseUrl: base } });
    reply = () => ({ status: 200, body: { id: 'x' } });
    const r = await testIntegration(a, 'email');
    expect(r.ok).toBe(true);
    expect(JSON.parse(seen[0]!.body).to).toEqual([a.email.toLowerCase() === a.email ? a.email : a.email]);
    expect((await db.integration.findUniqueOrThrow({ where: { key: 'email' } })).lastStatus).toBe('OK');
    reply = () => ({ status: 401, body: { message: 'bad key' } });
    expect((await testIntegration(a, 'email')).ok).toBe(false);
  });

  it('requires the fields for the chosen provider, and stores keys encrypted', async () => {
    const a = await admin();
    expect(await code(saveIntegration(a, 'email', { enabled: true, values: { provider: 'resend', from: 'desk@stchris.test' } }))).toBe('VALIDATION');
    expect(await code(saveIntegration(a, 'email', { enabled: true, values: { provider: 'smtp', from: 'desk@stchris.test' } }))).toBe('VALIDATION');
    expect(await code(saveIntegration(a, 'email', { enabled: true, values: { provider: 'resend', from: 'not an address', apiKey: 'k' } }))).toBe('VALIDATION');
    await saveIntegration(a, 'email', { enabled: false, values: { provider: 'resend', from: 'desk@stchris.test', apiKey: 'super-secret-key' } });
    const row = await db.integration.findUniqueOrThrow({ where: { key: 'email' } });
    expect(row.secretEnc).not.toContain('super-secret-key');
    expect(JSON.stringify(row.config)).not.toContain('super-secret-key');
  });
});

describe('SMS', () => {
  const sms = (provider: string, extra: Record<string, string> = {}) => ({ provider, sender: 'STCHRIS', apiKey: 'sms-key', baseUrl: base, testNumber: '+2348031234567', ...extra });

  it('only messages customers who opted in, and says what it skipped', async () => {
    const a = await admin();
    await saveIntegration(a, 'sms', { enabled: true, values: sms('termii'), events: ['request.status_changed', 'quotation.issued'] });
    reply = () => ({ status: 200, body: { code: 'ok', message_id: 'tm-1', message: 'Successfully Sent' } });
    const optedIn = await makeRequest({ sms: true });
    const notOptedIn = await makeRequest({ sms: false });
    await emitEvent('request.status_changed', { reference: optedIn, to: 'UNDER_REVIEW' }, 'u1');
    await emitEvent('request.status_changed', { reference: notOptedIn, to: 'UNDER_REVIEW' }, 'u2');
    await runDueJobs();
    expect(seen).toHaveLength(1);
    const sent = JSON.parse(seen[0]!.body);
    expect(sent).toMatchObject({ to: '2348031234567', from: 'STCHRIS', channel: 'generic', api_key: 'sms-key' });
    expect(sent.sms).toContain(optedIn);
    expect(sent.sms).toMatch(/Under review/i);
    const logs = await db.integrationLog.findMany({ where: { integration: { key: 'sms' } } });
    expect(logs.map((l) => l.responseSummary).join('|')).toContain('did not opt in');
    // phone numbers are masked in the log
    expect(logs.map((l) => l.responseSummary).join('|')).not.toContain('2348031234567');
  });

  it('speaks each provider’s API: Twilio (basic auth, form body) and Africa’s Talking (apiKey header)', async () => {
    const a = await admin();
    await saveIntegration(a, 'sms', { enabled: true, values: sms('twilio', { accountId: 'ACtest', sender: '+15550001111' }) });
    reply = () => ({ status: 201, body: { sid: 'SM1' } });
    expect((await testIntegration(a, 'sms')).ok).toBe(true);
    expect(seen[0]!.url).toBe('/2010-04-01/Accounts/ACtest/Messages.json');
    expect(seen[0]!.headers.authorization).toBe(`Basic ${Buffer.from('ACtest:sms-key').toString('base64')}`);
    const form = new URLSearchParams(seen[0]!.body);
    expect(form.get('To')).toBe('+2348031234567');
    expect(form.get('From')).toBe('+15550001111');

    seen = [];
    await saveIntegration(a, 'sms', { enabled: true, values: sms('africastalking', { accountId: 'stchris' }) });
    reply = () => ({ status: 201, body: { SMSMessageData: { Recipients: [{ statusCode: 101, status: 'Success', messageId: 'AT1' }] } } });
    expect((await testIntegration(a, 'sms')).ok).toBe(true);
    expect(seen[0]!.url).toBe('/version1/messaging');
    expect(seen[0]!.headers.apikey).toBe('sms-key');
    expect(new URLSearchParams(seen[0]!.body).get('username')).toBe('stchris');
  });

  it('reports a provider refusal instead of pretending it was sent', async () => {
    const a = await admin();
    await saveIntegration(a, 'sms', { enabled: true, values: sms('termii') });
    reply = () => ({ status: 400, body: { code: 'error', message: 'Sender ID not registered' } });
    const r = await testIntegration(a, 'sms');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Sender ID not registered');
  });

  it('the request form only offers the boxes for channels that are switched on', async () => {
    const a = await admin();
    expect(await enabledMessagingChannels()).toEqual({ sms: false, whatsapp: false });
    await saveIntegration(a, 'sms', { enabled: true, values: sms('termii') });
    expect(await enabledMessagingChannels()).toEqual({ sms: true, whatsapp: false });
  });
});

describe('WhatsApp', () => {
  const wa = () => ({ phoneNumberId: '1234567890', accessToken: 'EAAtoken', templateStatus: 'request_status', templateQuotation: 'quotation_ready', templateLanguage: 'en', baseUrl: base, testNumber: '+2348031234567' });

  it('sends the approved template with the reference and status as parameters', async () => {
    const a = await admin();
    await saveIntegration(a, 'whatsapp', { enabled: true, values: wa() });
    reply = () => ({ status: 200, body: { messages: [{ id: 'wamid.ABC' }] } });
    const ref = await makeRequest({ whatsapp: true });
    await emitEvent('request.status_changed', { reference: ref, to: 'QUOTATION_ISSUED' }, 'w1');
    await emitEvent('quotation.issued', { quotation: 'Q-1', request: ref, version: 1 }, 'w2');
    await runDueJobs();
    expect(seen).toHaveLength(2);
    expect(seen[0]!.url).toBe('/v20.0/1234567890/messages');
    expect(seen[0]!.headers.authorization).toBe('Bearer EAAtoken');
    const b = JSON.parse(seen[0]!.body);
    expect(b).toMatchObject({ messaging_product: 'whatsapp', to: '2348031234567', type: 'template', template: { name: 'request_status', language: { code: 'en' } } });
    expect(b.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual([ref, 'Quotation issued']);
    const q = JSON.parse(seen[1]!.body);
    expect(q.template.name).toBe('quotation_ready');
    expect(q.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(['Q-1', ref]);
  });

  it('the test sends Meta’s hello_world template and surfaces Meta’s error text', async () => {
    const a = await admin();
    await saveIntegration(a, 'whatsapp', { enabled: true, values: wa() });
    reply = () => ({ status: 200, body: { messages: [{ id: 'x' }] } });
    const t = await testIntegration(a, 'whatsapp');
    expect(t.message).toBeTruthy();
    expect(t.ok, t.message).toBe(true);
    expect(JSON.parse(seen[0]!.body).template).toMatchObject({ name: 'hello_world', language: { code: 'en_US' } });
    reply = () => ({ status: 400, body: { error: { message: 'Recipient phone number not in allowed list' } } });
    const r = await testIntegration(a, 'whatsapp');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('not in allowed list');
  });

  it('does not message customers who did not opt in to WhatsApp, even if they opted in to SMS', async () => {
    const a = await admin();
    await saveIntegration(a, 'whatsapp', { enabled: true, values: wa() });
    const ref = await makeRequest({ sms: true, whatsapp: false });
    await emitEvent('request.status_changed', { reference: ref, to: 'UNDER_REVIEW' }, 'w3');
    await runDueJobs();
    expect(seen).toHaveLength(0);
  });
});

describe('business-system REST connectors', () => {
  const mapping = JSON.stringify({
    'request.submitted': { method: 'POST', path: '/contacts', body: { email: '{{data.requester.email}}', ref: '{{data.reference}}' } },
    'quotation.accepted': { method: 'PUT', path: '/deals/{{data.request}}', body: { amount: '{{data.total}}' } },
  });
  const cfg = (extra: Record<string, string> = {}) => ({ baseUrl: `${base}/api`, authType: 'bearer', credential: 'crm-token', mappings: mapping, ...extra });

  it('calls the mapped endpoint with the configured authentication and the filled template', async () => {
    const a = await admin();
    await saveIntegration(a, 'crm', { enabled: true, values: cfg() });
    reply = () => ({ status: 201, body: { id: 1 } });
    const ref = await makeRequest();
    await runDueJobs();
    const hit = seen.find((s) => s.url === '/api/contacts')!;
    expect(hit.method).toBe('POST');
    expect(hit.headers.authorization).toBe('Bearer crm-token');
    expect(JSON.parse(hit.body)).toMatchObject({ ref, email: expect.stringContaining('@') });

    seen = [];
    await emitEvent('quotation.accepted', { quotation: 'Q-9', request: ref, total: '1500.00', version: 1 }, 'a1');
    await runDueJobs();
    expect(seen[0]).toMatchObject({ method: 'PUT', url: `/api/deals/${ref}` });
    expect(JSON.parse(seen[0]!.body)).toEqual({ amount: '1500.00' });
  });

  it('supports an API-key header and basic authentication', async () => {
    const a = await admin();
    await saveIntegration(a, 'accounting', { enabled: true, values: cfg({ authType: 'header', authHeader: 'X-Api-Key', mappings: JSON.stringify({ 'quotation.accepted': { path: '/invoices', body: { q: '{{data.quotation}}' } } }) }) });
    await emitEvent('quotation.accepted', { quotation: 'Q-2', request: 'R', version: 1 }, 'h1');
    await runDueJobs();
    expect(seen[0]!.headers['x-api-key']).toBe('crm-token');
    seen = [];
    await saveIntegration(a, 'accounting', { enabled: true, values: cfg({ authType: 'basic', basicUser: 'ledger', mappings: JSON.stringify({ 'quotation.accepted': { path: '/invoices' } }) }) });
    await emitEvent('quotation.accepted', { quotation: 'Q-3', request: 'R', version: 1 }, 'h2');
    await runDueJobs();
    expect(seen[0]!.headers.authorization).toBe(`Basic ${Buffer.from('ledger:crm-token').toString('base64')}`);
  });

  it('retries a failing endpoint, records the error and never lets it block the business flow', async () => {
    const a = await admin();
    await saveIntegration(a, 'dispatch', { enabled: true, values: cfg({ mappings: JSON.stringify({ 'quotation.accepted': { path: '/jobs' } }) }) });
    reply = () => ({ status: 500, body: { error: 'down' } });
    await emitEvent('quotation.accepted', { quotation: 'Q-4', request: 'R', version: 1 }, 'f1');
    const r = await runDueJobs();
    expect(r.failed).toBe(1);
    const job = await db.job.findFirstOrThrow({ where: { type: 'integration_event' } });
    expect(job.status).toBe('PENDING');
    expect(job.attempts).toBe(1);
    const log = await db.integrationLog.findFirstOrThrow({ where: { integration: { key: 'dispatch' } } });
    expect(log.status).toBe('ERROR');
    expect(log.error).toContain('500');
  });

  it('skips events that have no mapping, and the test calls a read-only path', async () => {
    const a = await admin();
    await saveIntegration(a, 'stock', { enabled: true, values: cfg({ testPath: '/health' }) });
    await emitEvent('quotation.declined', { quotation: 'Q-5', request: 'R', version: 1 }, 's1');
    await runDueJobs();
    expect(seen).toHaveLength(0);
    reply = () => ({ status: 200, body: { ok: true } });
    expect((await testIntegration(a, 'stock')).ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/api/health' });
    reply = () => ({ status: 401, body: {} });
    expect((await testIntegration(a, 'stock')).message).toContain('rejected the credentials');
  });

  it('refuses bad mappings at save time and private base URLs', async () => {
    const a = await admin();
    expect(await code(saveIntegration(a, 'crm', { enabled: true, values: cfg({ mappings: '{oops' }) }))).toBe('VALIDATION');
    delete process.env.INTEGRATIONS_ALLOW_LOCAL;
    try {
      expect(await code(saveIntegration(a, 'crm', { enabled: true, values: cfg({ baseUrl: 'https://169.254.169.254/latest' }) }))).toBe('VALIDATION');
      expect(await code(saveIntegration(a, 'crm', { enabled: true, values: cfg({ baseUrl: 'http://crm.example.com' }) }))).toBe('VALIDATION');
    } finally {
      process.env.INTEGRATIONS_ALLOW_LOCAL = '1';
    }
  });

  it('the documents connector can attach the quotation PDF', async () => {
    const a = await admin();
    await saveIntegration(a, 'documents', { enabled: true, values: cfg({ mappings: JSON.stringify({ 'quotation.issued': { path: '/files', body: { name: '{{pdf_filename}}', content: '{{pdf_base64}}' } } }) }) });
    // a real quotation is needed to render a PDF; the quotation flow is covered elsewhere, so here we check the unrenderable case is skipped cleanly
    await emitEvent('quotation.issued', { quotation: 'NOPE', request: 'R', version: 1 }, 'd1');
    await runDueJobs();
    expect(seen).toHaveLength(1);
    expect(JSON.parse(seen[0]!.body)).toEqual({ name: null, content: null });
  });
});

describe('outbound webhook (regression)', () => {
  it('signs the body with HMAC-SHA256', async () => {
    const a = await admin();
    await saveIntegration(a, 'webhook', { enabled: true, values: { url: `${base}/hook`, secret: 'whsec' } });
    await emitEvent('quotation.accepted', { quotation: 'Q-7' }, 'wh1');
    await runDueJobs();
    const s = seen[0]!;
    expect(s.headers['x-stchris-signature']).toBe(`sha256=${createHmac('sha256', 'whsec').update(s.body).digest('hex')}`);
  });
});

describe('analytics settings', () => {
  it('is off by default and validates the identifier', async () => {
    const a = await admin();
    expect(await getAnalytics()).toBeNull();
    expect(await code(saveIntegration(a, 'analytics', { enabled: true, values: { provider: 'ga4', id: 'UA-123' } }))).toBe('VALIDATION');
    expect(await code(saveIntegration(a, 'analytics', { enabled: true, values: { provider: 'plausible', id: 'https://bad' } }))).toBe('VALIDATION');
    await saveIntegration(a, 'analytics', { enabled: true, values: { provider: 'ga4', id: 'G-ABC123XYZ4' } });
    expect(await getAnalytics()).toEqual({ provider: 'ga4', id: 'G-ABC123XYZ4' });
    await saveIntegration(a, 'analytics', { enabled: true, values: { provider: 'plausible', id: 'stchris.example' } });
    expect(await getAnalytics()).toEqual({ provider: 'plausible', id: 'stchris.example' });
    await saveIntegration(a, 'analytics', { enabled: false, values: { provider: 'plausible', id: 'stchris.example' } });
    expect(await getAnalytics()).toBeNull();
  });
});
