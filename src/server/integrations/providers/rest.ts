import 'server-only';
import { db } from '../../db';
import { renderQuotationPdf } from '../../pdf';
import { EVENTS, httpCall, providerError, type Adapter, type ConfigField } from '../core';

const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const WHOLE = /^\{\{\s*([\w.]+)\s*\}\}$/;
const ANY = /\{\{\s*([\w.]+)\s*\}\}/g;

function lookup(ctx: unknown, path: string): unknown {
  let cur: unknown = ctx;
  for (const part of path.split('.')) {
    if (FORBIDDEN.has(part) || cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** {{data.requester.email}} placeholders. A value that is exactly one placeholder keeps its type (number, boolean, null). */
export function renderTemplate(value: unknown, ctx: unknown, encode = false): unknown {
  if (typeof value === 'string') {
    const whole = !encode && WHOLE.exec(value);
    if (whole) return lookup(ctx, whole[1]!) ?? null;
    return value.replace(ANY, (_m, p: string) => { const v = lookup(ctx, p); const s = v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return encode ? encodeURIComponent(s) : s; });
  }
  if (Array.isArray(value)) return value.map((v) => renderTemplate(v, ctx, encode));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renderTemplate(v, ctx, encode)]));
  return value;
}

export interface Mapping { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; body?: unknown }

export function parseMappings(text: string): Record<string, Mapping> {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { throw new Error(`The event mappings are not valid JSON (${e instanceof Error ? e.message : 'parse error'}).`); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The event mappings must be a JSON object keyed by event name.');
  const out: Record<string, Mapping> = {};
  for (const [event, m] of Object.entries(raw as Record<string, unknown>)) {
    if (!(EVENTS as readonly string[]).includes(event)) throw new Error(`“${event}” is not an event. Use: ${EVENTS.join(', ')}.`);
    const mm = m as Partial<Mapping> | null;
    if (!mm || typeof mm !== 'object') throw new Error(`The mapping for ${event} must be an object.`);
    const method = String(mm.method ?? 'POST').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error(`${event}: method must be POST, PUT, PATCH or DELETE.`);
    if (typeof mm.path !== 'string' || !mm.path.startsWith('/')) throw new Error(`${event}: path must start with “/”, for example "/contacts".`);
    out[event] = { method: method as Mapping['method'], path: mm.path, body: mm.body };
  }
  if (!Object.keys(out).length) throw new Error('Add a mapping for at least one event.');
  return out;
}

function authHeaders(c: Record<string, string>, secrets: Record<string, string>): Record<string, string> {
  const cred = secrets.credential ?? '';
  switch (c.authType) {
    case 'bearer': return { Authorization: `Bearer ${cred}` };
    case 'header': return { [c.authHeader || 'X-Api-Key']: cred };
    case 'basic': return { Authorization: `Basic ${Buffer.from(`${c.basicUser ?? ''}:${cred}`).toString('base64')}` };
    default: return {};
  }
}

const joinUrl = (base: string, path: string) => base.replace(/\/$/, '') + path;

interface RestSpec { key: string; name: string; category: string; purpose: string; requirements: string[]; example: string; events?: string[] }

/**
 * A mapping-driven REST connector. St. Chris (or its integrator) says which endpoint each event should call and what the JSON
 * body looks like; the platform signs nothing and invents nothing: it fills the placeholders and sends the request.
 */
export function restAdapter(spec: RestSpec): Adapter {
  const fields: ConfigField[] = [
    { key: 'baseUrl', label: 'API base URL', required: true, placeholder: 'https://api.example.com/v1', help: 'https only. Private network addresses are refused.' },
    { key: 'authType', label: 'Authentication', type: 'select', required: true, options: [{ value: 'bearer', label: 'Bearer token' }, { value: 'header', label: 'API key in a header' }, { value: 'basic', label: 'Username and password' }, { value: 'none', label: 'None' }] },
    { key: 'authHeader', label: 'Header name (API key in a header)', placeholder: 'X-Api-Key', showFor: { key: 'authType', values: ['header'] } },
    { key: 'basicUser', label: 'Username (basic authentication)', showFor: { key: 'authType', values: ['basic'] } },
    { key: 'credential', label: 'Token, key or password', secret: true },
    { key: 'testPath', label: 'Path for “Run a test”', placeholder: '/', help: 'A GET request to this path must answer 2xx. Choose a harmless read-only endpoint.' },
    { key: 'mappings', label: 'Event mappings (JSON)', type: 'textarea', required: true, help: 'The example below shows the shape only: its paths and fields are placeholders to replace with the ones in the system’s own API documentation. For each event: the HTTP method, the path and the JSON body. Placeholders such as {{data.reference}} are filled from the event. Available: data.reference, data.status, data.service, data.requester.name / email / phone / company; for quotations data.quotation, data.version, data.request, data.total, data.currency; event, at.', example: spec.example },
  ];
  return {
    key: spec.key,
    name: spec.name,
    category: spec.category,
    kind: 'events',
    purpose: spec.purpose,
    state: 'implemented',
    requirements: spec.requirements,
    verification: 'The connector itself is tested against a local mock server (authentication, placeholder filling, retries, error reporting). It has not been connected to any specific vendor system: the vendor’s endpoints and fields come from the mapping St. Chris or its integrator writes.',
    fields,
    events: spec.events ?? [...EVENTS],
    validate(config) {
      parseMappings(config.mappings ?? '');
    },
    async test(config, secrets) {
      const r = await httpCall(joinUrl(config.baseUrl ?? '', config.testPath || '/'), { method: 'GET', headers: { Accept: 'application/json', ...authHeaders(config, secrets) } });
      if (r.status === 401 || r.status === 403) return { ok: false, message: `The service rejected the credentials (${r.status}).` };
      return r.ok ? { ok: true, message: `GET ${config.testPath || '/'} answered ${r.status}.` } : { ok: false, message: `GET ${config.testPath || '/'} answered ${providerError(r)}` };
    },
    async handle(event, payload, config, secrets) {
      const mapping = parseMappings(config.mappings ?? '')[event];
      if (!mapping) return { summary: `No mapping for ${event}: skipped` };
      const ctx: Record<string, unknown> = { event, at: new Date().toISOString(), data: payload };
      if (JSON.stringify(mapping.body ?? '').includes('pdf_base64') && event.startsWith('quotation.')) {
        const d = payload as { quotation?: string; version?: number };
        const rev = await db.quotationRevision.findFirst({ where: { version: d.version, quotation: { number: d.quotation } }, select: { id: true } });
        if (rev) { const pdf = await renderQuotationPdf(rev.id); ctx.pdf_base64 = pdf.buffer.toString('base64'); ctx.pdf_filename = pdf.filename; }
      }
      const path = String(renderTemplate(mapping.path, ctx, true));
      const body = mapping.body === undefined || mapping.method === 'DELETE' ? undefined : JSON.stringify(renderTemplate(mapping.body, ctx));
      const r = await httpCall(joinUrl(config.baseUrl ?? '', path), { method: mapping.method, headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), 'User-Agent': 'StChrisMaterialsDesk/1.0', ...authHeaders(config, secrets) }, body }, 20_000);
      if (!r.ok) throw new Error(`${mapping.method} ${path} answered ${providerError(r)}`);
      return { summary: `${mapping.method} ${path} → ${r.status}` };
    },
  };
}

const req = '{{data.reference}}';
export const restAdapters: Adapter[] = [
  restAdapter({
    key: 'crm', name: 'CRM', category: 'CRM',
    purpose: 'Creates or updates contacts and records request outcomes in the CRM St. Chris uses, by calling the CRM’s own REST API with the mapping you provide. The platform’s own company and contact records stay the source of truth for requests.',
    requirements: ['Which CRM St. Chris uses and an API credential (a private-app token or API key)', 'Which events matter: for example new request, and quotation accepted', 'The CRM’s endpoint paths and field names, to write into the mapping'],
    example: JSON.stringify({ 'request.submitted': { method: 'POST', path: '/contacts', body: { email: '{{data.requester.email}}', name: '{{data.requester.name}}', phone: '{{data.requester.phone}}', company: '{{data.requester.company}}', note: 'Request ' + req + ' (' + '{{data.service}}' + ')' } }, 'quotation.accepted': { method: 'POST', path: '/deals', body: { title: 'Quotation {{data.quotation}}', amount: '{{data.total}}', currency: '{{data.currency}}', reference: '{{data.request}}' } } }, null, 2),
  }),
  restAdapter({
    key: 'accounting', name: 'Accounting and invoicing', category: 'Accounting',
    purpose: 'When a quotation is accepted, calls the accounting system’s API to create the customer or an invoice draft, using the mapping you provide. Nothing is posted that you have not mapped, and no tax logic is applied by the platform.',
    requirements: ['Which accounting package St. Chris uses, with API credentials for a sandbox company file first', 'The chart of accounts, tax codes and invoicing rules (these are not guessed by the platform)', 'The endpoint paths and field names, to write into the mapping'],
    events: ['quotation.accepted'],
    example: JSON.stringify({ 'quotation.accepted': { method: 'POST', path: '/invoices', body: { status: 'DRAFT', reference: '{{data.quotation}}', total: '{{data.total}}', currency: '{{data.currency}}' } } }, null, 2),
  }),
  restAdapter({
    key: 'dispatch', name: 'Delivery and dispatch', category: 'Dispatch',
    purpose: 'Hands accepted orders to a delivery, dispatch or transport-management system through its REST API, using the mapping you provide.',
    requirements: ['Whether a dispatch system exists, with its API and a test environment', 'The data a job needs (goods, delivery location, time windows), which comes from the request’s answers', 'The endpoint paths and field names, to write into the mapping'],
    events: ['quotation.accepted', 'request.status_changed'],
    example: JSON.stringify({ 'quotation.accepted': { method: 'POST', path: '/jobs', body: { external_reference: '{{data.request}}', quotation: '{{data.quotation}}' } } }, null, 2),
  }),
  restAdapter({
    key: 'stock', name: 'Stock and inventory', category: 'Stock',
    purpose: 'Notifies a stock or inventory system when a quotation is accepted so stock can be reserved or ordered, using the mapping you provide. This platform does not show live stock levels and will not imply them.',
    requirements: ['The stock or inventory system and API access', 'Confirmed product codes (the catalogue SKUs must match the stock system)', 'The endpoint paths and field names, to write into the mapping'],
    events: ['quotation.accepted', 'request.status_changed'],
    example: JSON.stringify({ 'quotation.accepted': { method: 'POST', path: '/reservations', body: { reference: '{{data.request}}' } } }, null, 2),
  }),
  restAdapter({
    key: 'documents', name: 'Document management', category: 'Documents',
    purpose: 'Sends the quotation PDF to a document system when a quotation is issued, accepted or declined. Put {{pdf_base64}} in the body to include the PDF as base64 text, and {{pdf_filename}} for its name.',
    requirements: ['Which document store is used (SharePoint, Drive, other) and an API credential', 'The folder or collection conventions', 'The endpoint path and field names for uploading a file, to write into the mapping'],
    events: ['quotation.issued', 'quotation.accepted', 'quotation.declined'],
    example: JSON.stringify({ 'quotation.accepted': { method: 'POST', path: '/files', body: { filename: '{{pdf_filename}}', content_base64: '{{pdf_base64}}', reference: '{{data.request}}' } } }, null, 2),
  }),
];
