import 'server-only';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { env } from '../env';

export type IntegrationState = 'implemented' | 'awaiting-credentials';

export interface ConfigField {
  key: string;
  label: string;
  /** Stored encrypted and never shown again after saving */
  secret?: boolean;
  type?: 'text' | 'select' | 'textarea' | 'checkbox' | 'number';
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  /** A worked example shown under the field */
  example?: string;
  /** Required whenever the integration is enabled (and, if showFor is set, only when that condition holds) */
  required?: boolean;
  showFor?: { key: string; values: string[] };
}

export interface TestContext {
  /** Email address of the staff member running the test, for transports that send a test message */
  userEmail: string;
}

export interface Adapter {
  key: string;
  name: string;
  category: string;
  purpose: string;
  state: IntegrationState;
  /** transport: used by the platform itself (email). events: reacts to platform events. site: affects the public site. */
  kind?: 'transport' | 'events' | 'site';
  /** What St. Chris must confirm or supply before this can be connected */
  requirements: string[];
  /** Short, honest statement of what has and has not been verified */
  verification?: string;
  fields: ConfigField[];
  events: string[];
  /** Extra checks when saving (throw a message for the admin) */
  validate?(config: Record<string, string>, secrets: Record<string, string>): void;
  test?(config: Record<string, string>, secrets: Record<string, string>, ctx: TestContext): Promise<{ ok: boolean; message: string }>;
  handle?(event: string, payload: unknown, config: Record<string, string>, secrets: Record<string, string>): Promise<{ summary: string }>;
}

export const EVENTS = ['request.submitted', 'request.status_changed', 'quotation.issued', 'quotation.accepted', 'quotation.declined'] as const;
export type EventName = (typeof EVENTS)[number];

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) || // IETF protocol assignments / documentation
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast and reserved
    );
  }
  const v = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivateIp(mapped[1]!);
  // the URL parser normalises ::ffff:10.0.0.1 to ::ffff:a00:1
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
}

/** Refuse internal addresses so an admin-entered URL cannot be used to probe the private network. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('The URL is not valid.');
  }
  // Plain http and private addresses are a convenience for development and automated tests only (talking to a tool or a mock server on this machine). Production refuses both, whatever the environment says.
  const dev = env.NODE_ENV === 'development' || (env.NODE_ENV === 'test' && process.env.INTEGRATIONS_ALLOW_LOCAL === '1');
  if (u.protocol !== 'https:' && !(dev && u.protocol === 'http:')) throw new Error('Only https:// URLs are allowed.');
  if (u.username || u.password) throw new Error('Do not put credentials in the URL.');
  if (!dev) {
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('That address resolves to a private network and is not allowed.');
  }
  return u;
}


export interface HttpResult {
  status: number;
  ok: boolean;
  text: string;
  json: unknown;
  headers: Headers;
}

/** The one place outbound integration traffic leaves from: address checks, no redirects, a timeout and a size cap. */
export async function httpCall(url: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<HttpResult> {
  const u = await assertSafeUrl(url);
  let res: Response;
  try {
    res = await fetch(u, { ...init, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    // "fetch failed" alone does not help an administrator: say what went wrong at the network level
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    const name = (e as { name?: string }).name;
    throw new Error(name === 'TimeoutError' ? `No answer from ${u.host} within ${Math.round(timeoutMs / 1000)} seconds.` : `Could not reach ${u.host}${cause?.code ? ` (${cause.code})` : cause?.message ? ` (${cause.message})` : ''}.`);
  }
  const text = (await res.text().catch(() => '')).slice(0, 20_000);
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: res.status, ok: res.status >= 200 && res.status < 300, text, json, headers: res.headers };
}

/** Pull a short, safe error description out of a provider response. */
export function providerError(r: HttpResult): string {
  const j = r.json as Record<string, unknown> | null;
  const msg = (j && (j.message ?? j.error ?? j.Message ?? (j.errors as unknown))) ?? r.text;
  return `${r.status}: ${String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 200)}`;
}

/** Normalise a phone number to E.164 digits. Local Nigerian numbers (0803…) get the country code. */
export function toE164(raw: string, countryCode = '234'): string | null {
  let d = raw.replace(/[\s().-]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = countryCode + d.slice(1);
  if (!/^[1-9]\d{7,14}$/.test(d)) return null;
  return d;
}

export const maskPhone = (e164: string) => `+${e164.slice(0, 3)}••••${e164.slice(-3)}`;

/** Free-text fields that start the same way in logs and messages: keep a message to one SMS segment where we can. */
export const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + '…');
