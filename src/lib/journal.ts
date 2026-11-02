/** Pure helpers for the journal and for social posts. No database, no I/O: unit-tested directly. */

export const PLACEHOLDER = /\[\[[^\]]*\]\]/;

/** An article that still contains a [[like this]] marker is unfinished and cannot be published. */
export function findPlaceholders(text: string): string[] {
  return [...(text ?? '').matchAll(/\[\[([^\]]*)\]\]/g)].map((m) => m[1]!.trim() || 'placeholder');
}

export function readingMinutes(markdown: string): number {
  const words = (markdown ?? '').replace(/[#*_>`\[\]()!-]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function normaliseTags(raw: string | string[]): string[] {
  const list = Array.isArray(raw) ? raw : (raw ?? '').split(/[,\n]/);
  const out: string[] = [];
  for (const t of list) {
    const v = t.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9 \-]/g, '').replace(/\s+/g, '-').slice(0, 30);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= 10) break;
  }
  return out;
}

export interface VideoRef { provider: 'youtube' | 'vimeo'; id: string; embed: string; watch: string }

/** Accepts YouTube and Vimeo addresses only, and returns the privacy-friendly embed address. Anything else is rejected. */
export function parseVideoUrl(raw: string | null | undefined): VideoRef | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  let u: URL;
  try { u = new URL(v); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] ?? null;
  else if (host === 'youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,20})/); id = m?.[1] ?? null; }
  }
  if (id && /^[\w-]{6,20}$/.test(id)) return { provider: 'youtube', id, embed: `https://www.youtube-nocookie.com/embed/${id}`, watch: `https://www.youtube.com/watch?v=${id}` };
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = u.pathname.match(/(?:^\/|\/video\/)(\d{5,12})(?:\/|$)/);
    if (m) return { provider: 'vimeo', id: m[1]!, embed: `https://player.vimeo.com/video/${m[1]}?dnt=1`, watch: `https://vimeo.com/${m[1]}` };
  }
  return null;
}

// ── Social composition ───────────────────────────────────────────────

export const PLATFORMS = ['linkedin', 'facebook', 'instagram', 'x'] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface PlatformSpec {
  label: string;
  maxChars: number;
  maxHashtags: number;
  /** A link can sit in the post and be clicked */
  clickableLink: boolean;
  /** The platform will not take a post without an image */
  needsImage: boolean;
  /** Characters a link counts for, where the platform shortens them */
  linkLength?: number;
  /** Address that opens the platform's own composer for hand-posting */
  composer: (text: string, url: string) => string;
}

export const SPECS: Record<Platform, PlatformSpec> = {
  linkedin: { label: 'LinkedIn', maxChars: 3000, maxHashtags: 5, clickableLink: true, needsImage: false, composer: (_t, url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
  facebook: { label: 'Facebook', maxChars: 5000, maxHashtags: 5, clickableLink: true, needsImage: false, composer: (_t, url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  instagram: { label: 'Instagram', maxChars: 2200, maxHashtags: 15, clickableLink: false, needsImage: true, composer: () => 'https://www.instagram.com/' },
  x: { label: 'X', maxChars: 280, maxHashtags: 3, clickableLink: true, needsImage: false, linkLength: 23, composer: (t) => `https://x.com/intent/post?text=${encodeURIComponent(t)}` },
};

export function normaliseHashtags(raw: string | string[], max: number): string[] {
  const list = Array.isArray(raw) ? raw : (raw ?? '').split(/[\s,]+/);
  const out: string[] = [];
  for (const t of list) {
    const v = t.trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

export interface Composed { text: string; length: number; tooLong: boolean; notes: string[] }

/** The exact text a platform will receive: caption, hashtags and (where the platform allows) the link, with that platform's length rules applied. */
export function composePost(platform: Platform, input: { caption: string; hashtags: string[]; url: string; includeLink: boolean }): Composed {
  const spec = SPECS[platform];
  const notes: string[] = [];
  const tags = normaliseHashtags(input.hashtags, spec.maxHashtags);
  if (input.hashtags.length > tags.length) notes.push(`${spec.label} allows up to ${spec.maxHashtags} hashtags here; extras were left out.`);
  const tagLine = tags.map((t) => `#${t}`).join(' ');
  const caption = input.caption.trim();
  let link = '';
  if (input.includeLink) {
    if (spec.clickableLink) link = input.url;
    else notes.push(`${spec.label} does not make links in captions clickable, so the link is replaced by “link in bio”.`);
  }
  const parts = [caption, !spec.clickableLink && input.includeLink ? 'Full article: link in bio.' : '', tagLine, link].filter(Boolean);
  const text = parts.join('\n\n');
  const length = link && spec.linkLength ? text.length - link.length + spec.linkLength : text.length;
  return { text, length, tooLong: length > spec.maxChars, notes };
}

/** Why a post cannot go out automatically, or null when it can. */
export function manualReason(platform: Platform, ctx: { hasImage: boolean; imageIsJpeg: boolean; publicSite: boolean; composedTooLong: boolean }): string | null {
  const spec = SPECS[platform];
  if (ctx.composedTooLong) return `The text is longer than ${spec.label} allows (${spec.maxChars} characters). Shorten it, then retry.`;
  if (platform === 'instagram') {
    if (!ctx.hasImage) return 'Instagram needs a picture. Add a featured image to the article, or post this one by hand.';
    if (!ctx.imageIsJpeg) return 'Instagram accepts JPEG pictures only. Use a JPEG featured image, or post by hand.';
    if (!ctx.publicSite) return 'Instagram fetches the picture from the internet, so this works only on the live public website.';
  }
  return null;
}

/** LinkedIn's post text treats these characters as markup. */
export function escapeLinkedIn(text: string): string {
  return text.replace(/[\\(){}\[\]<>@*~_|]/g, (c) => `\\${c}`);
}
