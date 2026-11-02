import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { db } from './db';
import { audit } from './audit';
import { invalid, notFound, conflict } from './errors';
import { assertCan, type Principal } from './rbac';
import { checkImageRef } from './media';
import { getSetting, setSetting } from './settings';
import { slugify } from '@/lib/format';
import { parseVideoUrl } from '@/lib/journal';

const fieldErrors = (e: z.ZodError) => { const f: Record<string, string> = {}; for (const i of e.issues) f[String(i.path[0])] ??= i.message; return f; };
function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const r = schema.safeParse(raw);
  if (!r.success) throw invalid(r.error.issues[0]!.message, fieldErrors(r.error));
  return r.data;
}
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const httpsUrl = (v: string, label: string) => { if (!v) return null; try { const u = new URL(v); if (u.protocol !== 'https:') throw new Error(); return u.toString(); } catch { throw invalid(`${label} must be a full https:// address.`, { url: 'Not a valid address.' }); } };

// ─── Timeline (career, leadership, GeePee milestones, testimonials) ───

export const TIMELINE_SCOPES = ['chris', 'geepee'] as const;
export const TIMELINE_KINDS: Record<string, string> = { CAREER: 'Career', LEADERSHIP: 'Leadership engagement', TRAINING: 'Training and mentoring', MILESTONE: 'Milestone', TESTIMONIAL: 'Testimonial', INTERVIEW: 'Interview' };

export const getTimeline = (scope: string) => db.timelineEntry.findMany({ where: { scope, visible: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
export const listTimelineAdmin = (scope: string) => db.timelineEntry.findMany({ where: { scope }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });

const timelineSchema = z.object({
  scope: z.enum(TIMELINE_SCOPES),
  kind: z.string().refine((k) => k in TIMELINE_KINDS, 'Choose a type.'),
  period: z.string().trim().max(60).optional().default(''),
  title: z.string().trim().min(3, 'Give the entry a title.').max(160),
  body: z.string().trim().max(4000).optional().default(''),
  attribution: z.string().trim().max(120).optional().default(''),
  imageKey: z.string().optional().default(''),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  visible: z.coerce.boolean().default(true),
});

export async function saveTimelineEntry(user: Principal, id: string | null, raw: unknown) {
  assertCan(user, 'profile.manage');
  const d = parse(timelineSchema, raw);
  if (d.kind === 'TESTIMONIAL' && (!d.body || !d.attribution)) throw invalid('A testimonial needs the words and who said them.', { attribution: 'Required for a testimonial.' });
  const data = { ...d, attribution: d.attribution || null, imageKey: await checkImageRef(d.imageKey) };
  const row = id ? await db.timelineEntry.update({ where: { id }, data }).catch(() => { throw notFound('Entry not found.'); }) : await db.timelineEntry.create({ data });
  await audit({ id: user.id, label: user.name }, id ? 'timeline.updated' : 'timeline.created', 'TimelineEntry', row.id, { scope: d.scope, kind: d.kind });
  return row;
}
export async function deleteTimelineEntry(user: Principal, id: string) {
  assertCan(user, 'profile.manage');
  await db.timelineEntry.delete({ where: { id } }).catch(() => { throw notFound('Entry not found.'); });
  await audit({ id: user.id, label: user.name }, 'timeline.deleted', 'TimelineEntry', id);
}

// ─── Executive profile (settings) ──────────────────────────────────

const executiveSchema = z.object({
  headline: z.string().trim().min(5).max(200),
  strapline: z.string().trim().max(160).optional().default(''),
  portraitKey: z.string().optional().default(''),
  closing: z.string().trim().max(200).optional().default(''),
  sections: z.array(z.object({ id: z.string().min(1).max(30), title: z.string().trim().min(2).max(80), body: z.string().trim().min(10).max(3000) })).min(1).max(8),
  principles: z.array(z.object({ title: z.string().trim().min(2).max(80), body: z.string().trim().min(10).max(600) })).max(8).default([]),
  linkedin: z.string().trim().optional().default(''), x: z.string().trim().optional().default(''), instagram: z.string().trim().optional().default(''), facebook: z.string().trim().optional().default(''),
});

export async function saveExecutive(user: Principal, raw: unknown) {
  assertCan(user, 'profile.manage');
  const d = parse(executiveSchema, raw);
  const cur = await getSetting('executive');
  await setSetting('executive', { ...cur, ...d, portraitKey: (await checkImageRef(d.portraitKey)) ?? '', linkedin: httpsUrl(d.linkedin, 'LinkedIn address') ?? '', x: httpsUrl(d.x, 'X address') ?? '', instagram: httpsUrl(d.instagram, 'Instagram address') ?? '', facebook: httpsUrl(d.facebook, 'Facebook address') ?? '' }, user.id);
  await audit({ id: user.id, label: user.name }, 'executive.updated', 'SiteSetting', 'executive');
}

// ─── Divisions ─────────────────────────────────────────────────────

export const getDivisions = () => db.division.findMany({ where: { visible: true }, orderBy: { sortOrder: 'asc' } });
export const getDivision = (slug: string) => db.division.findFirst({ where: { slug, visible: true } });
export const listDivisionsAdmin = () => db.division.findMany({ orderBy: { sortOrder: 'asc' } });

const divisionSchema = z.object({
  name: z.string().trim().min(3).max(100), slug: z.string().trim().max(80).optional().default(''),
  tagline: z.string().trim().min(3).max(160), summary: z.string().trim().min(10).max(400), description: z.string().trim().min(10).max(8000),
  highlights: z.string().optional().default(''), offerings: z.string().optional().default(''), categorySlugs: z.string().optional().default(''),
  serviceSlug: z.string().trim().optional().default(''), imageKey: z.string().optional().default(''), icon: z.string().trim().max(30).optional().default('box'),
  visible: z.coerce.boolean().default(true), sortOrder: z.coerce.number().int().min(0).max(999).default(0), needsReview: z.coerce.boolean().default(false),
});

export async function saveDivision(user: Principal, id: string | null, raw: unknown) {
  assertCan(user, 'division.manage');
  const d = parse(divisionSchema, raw);
  const slug = slugify(d.slug || d.name);
  const clash = await db.division.findUnique({ where: { slug } });
  if (clash && clash.id !== id) throw conflict('Another division already uses that address.');
  if (d.serviceSlug && !(await db.service.findUnique({ where: { slug: d.serviceSlug } }))) throw invalid('Choose an existing request type for the enquiry button.', { serviceSlug: 'Unknown request type.' });
  const data = { name: d.name, slug, tagline: d.tagline, summary: d.summary, description: d.description, highlights: lines(d.highlights), offerings: lines(d.offerings), categorySlugs: lines(d.categorySlugs), serviceSlug: d.serviceSlug || null, imageKey: await checkImageRef(d.imageKey), icon: d.icon, visible: d.visible, sortOrder: d.sortOrder, needsReview: d.needsReview };
  const row = id ? await db.division.update({ where: { id }, data }).catch(() => { throw notFound('Division not found.'); }) : await db.division.create({ data });
  await audit({ id: user.id, label: user.name }, id ? 'division.updated' : 'division.created', 'Division', row.id, { name: row.name });
  return row;
}

// ─── Opportunities ─────────────────────────────────────────────────

export const OPPORTUNITY_KINDS: Record<string, string> = { CAREER: 'Career', DISTRIBUTION: 'Distribution', PARTNERSHIP: 'Partnership', SUPPLIER: 'Supplier or manufacturer', PROCUREMENT: 'Corporate procurement', INVESTMENT: 'Investment or strategic collaboration' };

export const getOpenOpportunities = () => db.opportunity.findMany({ where: { status: 'PUBLISHED', OR: [{ closesOn: null }, { closesOn: { gte: new Date() } }] }, orderBy: { publishedAt: 'desc' } });
export const getOpportunity = (slug: string) => db.opportunity.findFirst({ where: { slug, status: 'PUBLISHED' } });
export const listOpportunitiesAdmin = () => db.opportunity.findMany({ orderBy: { createdAt: 'desc' } });

const opportunitySchema = z.object({
  kind: z.string().refine((k) => k in OPPORTUNITY_KINDS, 'Choose a type.'),
  title: z.string().trim().min(3).max(140), summary: z.string().trim().min(10).max(300), body: z.string().trim().max(8000).optional().default(''),
  location: z.string().trim().max(120).optional().default(''), closesOn: z.string().optional().default(''), publish: z.coerce.boolean().default(false),
});

export async function saveOpportunity(user: Principal, id: string | null, raw: unknown) {
  assertCan(user, 'opportunity.manage');
  const d = parse(opportunitySchema, raw);
  const existing = id ? await db.opportunity.findUnique({ where: { id } }) : null;
  if (id && !existing) throw notFound('Opportunity not found.');
  let slug = existing?.slug ?? slugify(d.title);
  if (!existing) { for (let i = 2; await db.opportunity.findUnique({ where: { slug } }); i++) slug = `${slugify(d.title)}-${i}`; }
  const closes = d.closesOn ? new Date(d.closesOn) : null;
  const data = { kind: d.kind, title: d.title, summary: d.summary, body: d.body, location: d.location || null, closesOn: closes && !Number.isNaN(closes.getTime()) ? closes : null, status: d.publish ? ('PUBLISHED' as const) : ('DRAFT' as const), publishedAt: d.publish ? existing?.publishedAt ?? new Date() : existing?.publishedAt ?? null };
  const row = existing ? await db.opportunity.update({ where: { id: existing.id }, data }) : await db.opportunity.create({ data: { ...data, slug } });
  await audit({ id: user.id, label: user.name }, existing ? 'opportunity.updated' : 'opportunity.created', 'Opportunity', row.id, { title: row.title, status: row.status });
  return row;
}
export async function deleteOpportunity(user: Principal, id: string) {
  assertCan(user, 'opportunity.manage');
  await db.opportunity.delete({ where: { id } }).catch(() => { throw notFound('Opportunity not found.'); });
  await audit({ id: user.id, label: user.name }, 'opportunity.deleted', 'Opportunity', id);
}

// ─── Media centre ──────────────────────────────────────────────────

export const MEDIA_KINDS: Record<string, string> = { PRESS_RELEASE: 'Press release', INTERVIEW: 'Interview', PUBLICATION: 'Publication', SPEAKING: 'Speaking engagement', CONFERENCE: 'Conference appearance', ANNOUNCEMENT: 'Corporate announcement', COMMENTARY: 'Industry commentary', MENTION: 'Media mention', PHOTO: 'Photo', VIDEO: 'Video' };

export const getMediaItems = (kinds?: string[]) => db.mediaItem.findMany({ where: { status: 'PUBLISHED', ...(kinds ? { kind: { in: kinds } } : {}) }, orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }] });
export const listMediaItemsAdmin = () => db.mediaItem.findMany({ orderBy: [{ createdAt: 'desc' }] });

const mediaSchema = z.object({
  kind: z.string().refine((k) => k in MEDIA_KINDS, 'Choose a type.'),
  title: z.string().trim().min(3).max(160), summary: z.string().trim().max(400).optional().default(''), body: z.string().trim().max(8000).optional().default(''),
  source: z.string().trim().max(120).optional().default(''), url: z.string().trim().optional().default(''), eventDate: z.string().optional().default(''),
  location: z.string().trim().max(120).optional().default(''), imageKey: z.string().optional().default(''), videoUrl: z.string().trim().optional().default(''), publish: z.coerce.boolean().default(false),
});

export async function saveMediaItem(user: Principal, id: string | null, raw: unknown) {
  assertCan(user, 'media.manage');
  const d = parse(mediaSchema, raw);
  if (d.kind === 'VIDEO' && !d.videoUrl) throw invalid('Paste a YouTube or Vimeo link for the video.', { videoUrl: 'Required.' });
  if (d.kind === 'PHOTO' && !d.imageKey) throw invalid('Choose the photo.', { imageKey: 'Required.' });
  let videoUrl: string | null = null;
  if (d.videoUrl) { const v = parseVideoUrl(d.videoUrl); if (!v) throw invalid('Only YouTube and Vimeo links (https) are accepted.', { videoUrl: 'Not accepted.' }); videoUrl = v.watch; }
  const when = d.eventDate ? new Date(d.eventDate) : null;
  const data = { kind: d.kind, title: d.title, summary: d.summary, body: d.body, source: d.source || null, url: httpsUrl(d.url, 'The link'), eventDate: when && !Number.isNaN(when.getTime()) ? when : null, location: d.location || null, imageKey: await checkImageRef(d.imageKey), videoUrl, status: d.publish ? ('PUBLISHED' as const) : ('DRAFT' as const) };
  const row = id ? await db.mediaItem.update({ where: { id }, data }).catch(() => { throw notFound('Item not found.'); }) : await db.mediaItem.create({ data });
  await audit({ id: user.id, label: user.name }, id ? 'media_item.updated' : 'media_item.created', 'MediaItem', row.id, { kind: d.kind, status: row.status });
  return row;
}
export async function deleteMediaItem(user: Principal, id: string) {
  assertCan(user, 'media.manage');
  await db.mediaItem.delete({ where: { id } }).catch(() => { throw notFound('Item not found.'); });
  await audit({ id: user.id, label: user.name }, 'media_item.deleted', 'MediaItem', id);
}

// ─── SEO ───────────────────────────────────────────────────────────

export const getSeo = (path: string) => db.seoEntry.findUnique({ where: { path } }).catch(() => null);
export const listSeo = () => db.seoEntry.findMany({ orderBy: { path: 'asc' } });

export async function saveSeo(user: Principal, path: string, raw: { title?: string; description?: string; ogImageKey?: string; noindex?: boolean }) {
  assertCan(user, 'seo.manage');
  if (!/^\/[a-z0-9\-/]*$/i.test(path)) throw invalid('The page address must start with / and use plain letters, numbers and dashes.', { path: 'Not a valid page address.' });
  const title = (raw.title ?? '').trim(); const description = (raw.description ?? '').trim();
  if (title.length > 70) throw invalid('Keep the search title under 70 characters.', { title: 'Too long.' });
  if (description.length > 200) throw invalid('Keep the search description under 200 characters.', { description: 'Too long.' });
  const data = { title: title || null, description: description || null, ogImageKey: await checkImageRef(raw.ogImageKey), noindex: !!raw.noindex };
  if (!data.title && !data.description && !data.ogImageKey && !data.noindex) { await db.seoEntry.deleteMany({ where: { path } }); return; }
  await db.seoEntry.upsert({ where: { path }, create: { path, ...data }, update: data });
  await audit({ id: user.id, label: user.name }, 'seo.updated', 'SeoEntry', path);
}

export async function saveSeoSettings(user: Principal, raw: { searchConsoleToken?: string; defaultShareImage?: string }) {
  assertCan(user, 'seo.manage');
  const token = (raw.searchConsoleToken ?? '').trim();
  if (token && !/^[A-Za-z0-9_\-]{20,100}$/.test(token)) throw invalid('Paste only the verification code from Google Search Console (the part inside content="…"), not the whole tag.', { searchConsoleToken: 'Not a valid code.' });
  const cur = await getSetting('seo');
  await setSetting('seo', { ...cur, searchConsoleToken: token, defaultShareImage: (await checkImageRef(raw.defaultShareImage)) ?? '' }, user.id);
  await audit({ id: user.id, label: user.name }, 'seo.settings_updated', 'SiteSetting', 'seo');
}

// ─── Departments (enquiry routing) ─────────────────────────────────

const EMAIL_LIST = /^\s*[^\s@,]+@[^\s@,]+\.[^\s@,]+(\s*,\s*[^\s@,]+@[^\s@,]+\.[^\s@,]+)*\s*$/;

export async function saveDepartments(user: Principal, rows: { key: string; label: string; email: string; description: string }[]) {
  assertCan(user, 'settings.manage');
  if (rows.length < 1 || rows.length > 20) throw invalid('Keep between 1 and 20 departments.');
  const seen = new Set<string>();
  const clean = rows.map((r) => {
    const key = r.key.trim();
    if (!/^[a-z][a-z0-9-]{1,29}$/.test(key)) throw invalid(`“${r.label || key}”: the key must be lower-case letters, numbers and dashes.`, { key: 'Invalid key.' });
    if (seen.has(key)) throw invalid(`The key “${key}” is used twice.`);
    seen.add(key);
    if (r.label.trim().length < 3) throw invalid('Give every department a name.', { label: 'Required.' });
    const email = r.email.trim();
    if (email && !EMAIL_LIST.test(email)) throw invalid(`“${r.label}”: use a valid email address, or several separated by commas.`, { email: 'Not a valid email.' });
    return { key, label: r.label.trim(), email, description: r.description.trim().slice(0, 200) };
  });
  // a request type that points at a removed department would silently lose its routing
  const used = await db.service.findMany({ select: { name: true, department: true } });
  const orphan = used.find((s) => !seen.has(s.department));
  if (orphan) throw conflict(`“${orphan.name}” is routed to “${orphan.department}”. Keep that department, or change the request type first.`);
  await setSetting('departments', clean, user.id);
  await audit({ id: user.id, label: user.name }, 'departments.updated', 'SiteSetting', 'departments', { count: clean.length });
}

export type { Prisma };
