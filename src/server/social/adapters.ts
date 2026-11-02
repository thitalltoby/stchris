import 'server-only';
import type { Platform } from '@/lib/journal';
import { escapeLinkedIn } from '@/lib/journal';

/** How a failed call should be handled. auth: the token or permissions are wrong, retrying cannot help. rate and transient: retry later. rejected: the platform refused this particular post. */
export type SocialErrorKind = 'auth' | 'rate' | 'transient' | 'rejected';

export class SocialError extends Error {
  constructor(message: string, public kind: SocialErrorKind, public status?: number) {
    super(message);
    this.name = 'SocialError';
  }
}

export interface PublishInput {
  externalId: string;
  token: string;
  text: string;
  url: string;
  title: string;
  excerpt: string;
  imageUrl?: string;
}
export interface PublishResult { externalId: string; url?: string }
export interface Adapter {
  verify(externalId: string, token: string): Promise<{ name?: string }>;
  publish(input: PublishInput): Promise<PublishResult>;
}

const DEFAULT_BASE: Record<Platform, string> = {
  linkedin: 'https://api.linkedin.com',
  facebook: 'https://graph.facebook.com/v23.0',
  instagram: 'https://graph.facebook.com/v23.0',
  x: 'https://api.x.com',
};
/** Test servers and proxies replace the base address through SOCIAL_API_BASE_<PLATFORM>. */
export const apiBase = (p: Platform) => (process.env[`SOCIAL_API_BASE_${p.toUpperCase()}`] || DEFAULT_BASE[p]).replace(/\/$/, '');
const LINKEDIN_VERSION = () => process.env.LINKEDIN_API_VERSION || '202510';
const TIMEOUT_MS = 20_000;

function providerMessage(body: string): string {
  try {
    const j = JSON.parse(body) as Record<string, any>;
    const m = j.error?.message ?? j.message ?? j.detail ?? j.title ?? j.error_description ?? (typeof j.error === 'string' ? j.error : '');
    if (m) return String(m).replace(/\s+/g, ' ').slice(0, 300);
  } catch { /* not JSON */ }
  return body.replace(/\s+/g, ' ').slice(0, 200);
}

async function http(url: string, init: RequestInit & { headers: Record<string, string> }): Promise<{ status: number; body: string; headers: Headers }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    const body = await res.text();
    if (res.ok) return { status: res.status, body, headers: res.headers };
    const msg = providerMessage(body);
    if (res.status === 401 || res.status === 403) throw new SocialError(`The platform refused the connection (${res.status}). Reconnect the account with a fresh token and the publishing permission. ${msg}`.trim(), 'auth', res.status);
    if (res.status === 429) throw new SocialError('The platform is limiting how fast we can post (rate limit). It will be retried automatically.', 'rate', 429);
    if (res.status >= 500) throw new SocialError(`The platform had a problem (${res.status}). It will be retried automatically.`, 'transient', res.status);
    throw new SocialError(`The platform rejected the post (${res.status}): ${msg || 'no reason given'}`, 'rejected', res.status);
  } catch (e) {
    if (e instanceof SocialError) throw e;
    throw new SocialError(e instanceof Error && e.name === 'AbortError' ? 'The platform did not answer in time. It will be retried automatically.' : 'Could not reach the platform. It will be retried automatically.', 'transient');
  } finally {
    clearTimeout(timer);
  }
}

const bearer = (t: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${t}`, ...extra });

const linkedin: Adapter = {
  async verify(_externalId, token) {
    // A token with only the posting permission cannot read anything, so a 403 here is not proof the token is bad:
    // the first real post is the proof. A 401 (expired or invalid) is.
    try {
      const r = await http(`${apiBase('linkedin')}/v2/userinfo`, { method: 'GET', headers: bearer(token) });
      return { name: (JSON.parse(r.body) as { name?: string }).name };
    } catch (e) {
      if (e instanceof SocialError && e.status === 403) return {};
      throw e;
    }
  },
  async publish(i) {
    const r = await http(`${apiBase('linkedin')}/rest/posts`, {
      method: 'POST',
      headers: bearer(i.token, { 'Content-Type': 'application/json', 'LinkedIn-Version': LINKEDIN_VERSION(), 'X-Restli-Protocol-Version': '2.0.0' }),
      body: JSON.stringify({
        author: i.externalId,
        commentary: escapeLinkedIn(i.text),
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        content: { article: { source: i.url, title: i.title.slice(0, 200), description: i.excerpt.slice(0, 250) } },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
    });
    const urn = r.headers.get('x-restli-id') ?? r.headers.get('x-linkedin-id') ?? '';
    if (!urn) throw new SocialError('LinkedIn accepted the post but did not return its identifier.', 'rejected');
    return { externalId: urn, url: `https://www.linkedin.com/feed/update/${urn}/` };
  },
};

const facebook: Adapter = {
  async verify(externalId, token) {
    const r = await http(`${apiBase('facebook')}/${encodeURIComponent(externalId)}?fields=name`, { method: 'GET', headers: bearer(token) });
    return { name: (JSON.parse(r.body) as { name?: string }).name };
  },
  async publish(i) {
    const r = await http(`${apiBase('facebook')}/${encodeURIComponent(i.externalId)}/feed`, {
      method: 'POST',
      headers: bearer(i.token, { 'Content-Type': 'application/json' }),
      // The link is carried as the post's link attachment; the caption does not repeat it
      body: JSON.stringify({ message: i.text.replace(i.url, '').trim(), link: i.url }),
    });
    const id = (JSON.parse(r.body) as { id?: string }).id;
    if (!id) throw new SocialError('Facebook accepted the post but did not return its identifier.', 'rejected');
    return { externalId: id, url: `https://www.facebook.com/${id}` };
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const instagram: Adapter = {
  async verify(externalId, token) {
    const r = await http(`${apiBase('instagram')}/${encodeURIComponent(externalId)}?fields=username`, { method: 'GET', headers: bearer(token) });
    return { name: (JSON.parse(r.body) as { username?: string }).username };
  },
  async publish(i) {
    if (!i.imageUrl) throw new SocialError('Instagram needs a picture.', 'rejected');
    const base = `${apiBase('instagram')}/${encodeURIComponent(i.externalId)}`;
    const headers = bearer(i.token, { 'Content-Type': 'application/json' });
    const created = await http(`${base}/media`, { method: 'POST', headers, body: JSON.stringify({ image_url: i.imageUrl, caption: i.text }) });
    const container = (JSON.parse(created.body) as { id?: string }).id;
    if (!container) throw new SocialError('Instagram did not return a media container.', 'rejected');
    // The picture is fetched and processed on Instagram's side; publish only once it reports FINISHED
    const wait = Number(process.env.SOCIAL_POLL_MS ?? 2000);
    for (let n = 0; n < 8; n++) {
      const st = await http(`${apiBase('instagram')}/${container}?fields=status_code`, { method: 'GET', headers: bearer(i.token) });
      const code = (JSON.parse(st.body) as { status_code?: string }).status_code;
      if (code === 'FINISHED') break;
      if (code === 'ERROR' || code === 'EXPIRED') throw new SocialError('Instagram could not process the picture. Check that it is a public JPEG, then retry.', 'rejected');
      if (n === 7) throw new SocialError('Instagram is still processing the picture. It will be retried automatically.', 'transient');
      await sleep(wait);
    }
    const pub = await http(`${base}/media_publish`, { method: 'POST', headers, body: JSON.stringify({ creation_id: container }) });
    const mediaId = (JSON.parse(pub.body) as { id?: string }).id;
    if (!mediaId) throw new SocialError('Instagram accepted the post but did not return its identifier.', 'rejected');
    let permalink: string | undefined;
    try {
      permalink = (JSON.parse((await http(`${apiBase('instagram')}/${mediaId}?fields=permalink`, { method: 'GET', headers: bearer(i.token) })).body) as { permalink?: string }).permalink;
    } catch { /* the post is live; the link is a convenience */ }
    return { externalId: mediaId, url: permalink };
  },
};

const x: Adapter = {
  async verify(_externalId, token) {
    const r = await http(`${apiBase('x')}/2/users/me`, { method: 'GET', headers: bearer(token) });
    const d = (JSON.parse(r.body) as { data?: { username?: string } }).data;
    return { name: d?.username };
  },
  async publish(i) {
    const r = await http(`${apiBase('x')}/2/tweets`, { method: 'POST', headers: bearer(i.token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ text: i.text }) });
    const id = (JSON.parse(r.body) as { data?: { id?: string } }).data?.id;
    if (!id) throw new SocialError('X accepted the post but did not return its identifier.', 'rejected');
    return { externalId: id, url: `https://x.com/i/web/status/${id}` };
  },
};

export const ADAPTERS: Record<Platform, Adapter> = { linkedin, facebook, instagram, x };
