import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import type { ArticleStatus } from '@/generated/prisma/enums';
import { db } from './db';
import { audit } from './audit';
import { conflict, forbidden, invalid, notFound } from './errors';
import { can } from '@/lib/permissions';
import type { Principal } from './rbac';
import { assertAnyCan } from './rbac';
import { checkImageRef } from './media';
import { slugify } from '@/lib/format';
import { findPlaceholders, normaliseTags, parseVideoUrl, readingMinutes } from '@/lib/journal';
import { queueSocialForArticle } from './social';

export const lagosDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

// ─── Public reads ──────────────────────────────────────────────────

let lastPromote = 0;
/** Scheduled articles whose time has come go live. Run by the worker every minute and, cheaply, before public reads. */
export async function publishDueArticles(now = new Date()): Promise<number> {
  const due = await db.article.findMany({ where: { status: 'SCHEDULED', scheduledFor: { lte: now } }, select: { id: true } });
  let n = 0;
  for (const a of due) {
    const r = await db.article.updateMany({ where: { id: a.id, status: 'SCHEDULED' }, data: { status: 'PUBLISHED', publishedAt: now } });
    if (r.count) {
      n++;
      await audit({ label: 'Scheduler' }, 'article.published', 'Article', a.id, { scheduled: true });
      await queueSocialForArticle(a.id).catch((e) => console.error('[social] queue failed', e));
    }
  }
  return n;
}

async function promoteIfDue() {
  if (Date.now() - lastPromote < 15_000) return;
  lastPromote = Date.now();
  await publishDueArticles().catch((e) => console.error('[journal] promote failed', e));
}

export const getJournalCategories = () => db.articleCategory.findMany({ orderBy: { sortOrder: 'asc' } });

export async function listPublished(opts: { category?: string; tag?: string; q?: string; take?: number; skip?: number; kind?: string } = {}) {
  await promoteIfDue();
  const where: Prisma.ArticleWhereInput = { status: 'PUBLISHED' };
  if (opts.category) where.category = { slug: opts.category };
  if (opts.tag) where.tags = { array_contains: opts.tag };
  if (opts.kind) where.kind = opts.kind;
  if (opts.q?.trim()) where.OR = [{ title: { contains: opts.q.trim(), mode: 'insensitive' } }, { excerpt: { contains: opts.q.trim(), mode: 'insensitive' } }];
  const [items, total] = await Promise.all([
    db.article.findMany({ where, orderBy: { publishedAt: 'desc' }, take: opts.take ?? 12, skip: opts.skip ?? 0, include: { category: true, author: { select: { name: true } } } }),
    db.article.count({ where }),
  ]);
  return { items, total };
}

export async function getPublishedBySlug(slug: string) {
  await promoteIfDue();
  return db.article.findFirst({ where: { slug, status: 'PUBLISHED' }, include: { category: true, author: { select: { name: true } } } });
}

export async function getRelated(articleId: string, categoryId: string, take = 3) {
  return db.article.findMany({ where: { status: 'PUBLISHED', categoryId, NOT: { id: articleId } }, orderBy: { publishedAt: 'desc' }, take, include: { category: true } });
}

export async function categoriesWithCounts() {
  const cats = await getJournalCategories();
  const counts = await db.article.groupBy({ by: ['categoryId'], where: { status: 'PUBLISHED' }, _count: true });
  return cats.map((c) => ({ ...c, count: counts.find((x) => x.categoryId === c.id)?._count ?? 0 }));
}

/** Counts one reading per article per day, with no personal data. Never fails the page. */
export async function recordView(articleId: string) {
  try {
    await db.articleView.upsert({ where: { articleId_day: { articleId, day: lagosDay() } }, create: { articleId, day: lagosDay(), count: 1 }, update: { count: { increment: 1 } } });
  } catch (e) {
    console.error('[journal] view not recorded', e);
  }
}

// ─── Editing ───────────────────────────────────────────────────────

const articleSchema = z.object({
  title: z.string().trim().min(3, 'Give the article a title.').max(160),
  subtitle: z.string().trim().max(200).optional().default(''),
  excerpt: z.string().trim().max(300, 'Keep the summary under 300 characters.').optional().default(''),
  body: z.string().max(60000).optional().default(''),
  categoryId: z.string().min(1, 'Choose a category.'),
  tags: z.string().optional().default(''),
  featuredImageKey: z.string().optional().default(''),
  featuredImageAlt: z.string().trim().max(200).optional().default(''),
  videoUrl: z.string().trim().max(300).optional().default(''),
  seoTitle: z.string().trim().max(70, 'Keep the search title under 70 characters.').optional().default(''),
  seoDescription: z.string().trim().max(200, 'Keep the search description under 200 characters.').optional().default(''),
  slug: z.string().trim().max(90).optional().default(''),
  scheduledFor: z.string().optional().default(''),
});

export type ArticleAction = 'save' | 'publish' | 'schedule' | 'unpublish' | 'archive' | 'restore';

async function uniqueSlug(base: string, exceptId?: string): Promise<string> {
  const root = slugify(base).slice(0, 80) || 'article';
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? root : `${root}-${i + 1}`;
    const hit = await db.article.findUnique({ where: { slug }, select: { id: true } });
    if (!hit || hit.id === exceptId) return slug;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** Writers can create drafts and edit their own; publishing and everything on other people's articles needs journal.publish. */
function canTouch(user: Principal, a: { authorId: string } | null): boolean {
  if (can(user.role, 'journal.publish')) return true;
  return can(user.role, 'journal.write') && (!a || a.authorId === user.id);
}

/** What stops an article going live, in plain words. Empty = ready. */
export function publishProblems(a: { title: string; excerpt: string; body: string; subtitle?: string | null; seoDescription?: string | null; seoTitle?: string | null }): string[] {
  const out: string[] = [];
  if (a.excerpt.trim().length < 20) out.push('Write a short summary (at least 20 characters). It is used in listings, search results and social posts.');
  if (a.body.trim().length < 80) out.push('The article body is too short to publish.');
  const marks = findPlaceholders([a.title, a.subtitle ?? '', a.excerpt, a.body, a.seoTitle ?? '', a.seoDescription ?? ''].join('\n'));
  if (marks.length) out.push(`Unfinished text in double square brackets must be replaced first: ${[...new Set(marks)].slice(0, 5).map((m) => `[[${m}]]`).join(', ')}.`);
  return out;
}

export async function saveArticle(user: Principal, id: string | null, raw: unknown, action: ArticleAction = 'save') {
  assertAnyCan(user, ['journal.write', 'journal.publish']);
  const parsed = articleSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] ??= i.message;
    throw invalid(parsed.error.issues[0]!.message, fields);
  }
  const d = parsed.data;
  const existing = id ? await db.article.findUnique({ where: { id } }) : null;
  if (id && !existing) throw notFound('Article not found.');
  if (!canTouch(user, existing)) throw forbidden('You can edit only your own articles.');
  const publishing = action === 'publish' || action === 'schedule';
  if ((publishing || action === 'unpublish' || action === 'archive' || action === 'restore') && !can(user.role, 'journal.publish')) throw forbidden('Only a publisher can publish, schedule or remove articles.');

  const category = await db.articleCategory.findUnique({ where: { id: d.categoryId } });
  if (!category) throw invalid('Choose a category.', { categoryId: 'Choose a category.' });
  const image = await checkImageRef(d.featuredImageKey);
  let videoUrl: string | null = null;
  if (d.videoUrl) {
    const v = parseVideoUrl(d.videoUrl);
    if (!v) throw invalid('Paste a YouTube or Vimeo link (https) for the video.', { videoUrl: 'Only YouTube and Vimeo links are accepted.' });
    videoUrl = v.watch;
  }
  const tags = normaliseTags(d.tags);
  if (publishing) {
    const problems = publishProblems(d);
    if (problems.length) throw invalid(problems[0]!, { body: problems.join(' ') });
  }
  let scheduledFor: Date | null = null;
  if (action === 'schedule') {
    scheduledFor = d.scheduledFor ? new Date(d.scheduledFor) : null;
    if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) throw invalid('Choose the date and time to publish.', { scheduledFor: 'Required.' });
    if (scheduledFor.getTime() < Date.now() + 60_000) throw invalid('Choose a time at least a minute from now.', { scheduledFor: 'Must be in the future.' });
  }

  const wasPublished = existing?.status === 'PUBLISHED';
  const base: Prisma.ArticleUncheckedUpdateInput = {
    title: d.title, subtitle: d.subtitle || null, excerpt: d.excerpt, body: d.body, categoryId: d.categoryId, tags,
    featuredImageKey: image, featuredImageAlt: d.featuredImageAlt || null, videoUrl,
    seoTitle: d.seoTitle || null, seoDescription: d.seoDescription || null, readingMinutes: readingMinutes(d.body),
  };
  // Published addresses stay stable. A draft can change its address.
  const slug = existing?.status === 'PUBLISHED' || existing?.status === 'ARCHIVED' ? existing.slug : await uniqueSlug(d.slug || d.title, existing?.id);
  let status: ArticleStatus = existing?.status ?? 'DRAFT';
  let publishedAt = existing?.publishedAt ?? null;
  let sched = existing?.scheduledFor ?? null;
  if (action === 'publish') { status = 'PUBLISHED'; publishedAt = wasPublished ? publishedAt : new Date(); sched = null; }
  else if (action === 'schedule') { status = 'SCHEDULED'; sched = scheduledFor; }
  else if (action === 'unpublish') { status = 'DRAFT'; sched = null; }
  else if (action === 'archive') { status = 'ARCHIVED'; sched = null; }
  else if (action === 'restore') { status = 'DRAFT'; }
  else if (existing?.status === 'SCHEDULED') { sched = d.scheduledFor ? new Date(d.scheduledFor) : sched; }

  const saved = existing
    ? await db.article.update({ where: { id: existing.id }, data: { ...base, slug, status, publishedAt, scheduledFor: sched } })
    : await db.article.create({ data: { ...(base as Prisma.ArticleUncheckedCreateInput), slug, status, publishedAt, scheduledFor: sched, authorId: user.id } as Prisma.ArticleUncheckedCreateInput });
  await audit({ id: user.id, label: user.name }, `article.${action === 'save' ? (existing ? 'edited' : 'created') : action}`, 'Article', saved.id, { title: saved.title, status: saved.status });
  if (action === 'publish' && !wasPublished) await queueSocialForArticle(saved.id).catch((e) => console.error('[social] queue failed', e));
  return saved;
}

export async function deleteArticle(user: Principal, id: string) {
  assertAnyCan(user, ['journal.publish']);
  const a = await db.article.findUnique({ where: { id } });
  if (!a) throw notFound('Article not found.');
  if (a.status === 'PUBLISHED') throw conflict('Take the article off the site first (archive or unpublish it), then delete it.');
  await db.article.delete({ where: { id } });
  await audit({ id: user.id, label: user.name }, 'article.deleted', 'Article', id, { title: a.title });
}

export async function listArticlesAdmin(user: Principal, opts: { status?: ArticleStatus; q?: string } = {}) {
  assertAnyCan(user, ['journal.write', 'journal.publish']);
  const where: Prisma.ArticleWhereInput = {};
  if (!can(user.role, 'journal.publish')) where.authorId = user.id;
  if (opts.status) where.status = opts.status;
  if (opts.q?.trim()) where.title = { contains: opts.q.trim(), mode: 'insensitive' };
  return db.article.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 200, include: { category: true, author: { select: { name: true } }, social: { include: { account: true } } } });
}

export async function getArticleAdmin(user: Principal, id: string) {
  assertAnyCan(user, ['journal.write', 'journal.publish']);
  const a = await db.article.findUnique({ where: { id }, include: { category: true, author: { select: { name: true } }, social: { include: { account: true }, orderBy: { createdAt: 'asc' } } } });
  if (!a) throw notFound('Article not found.');
  if (!canTouch(user, a)) throw forbidden('You can open only your own articles.');
  return a;
}

export async function readership(days = 30) {
  const since = lagosDay(new Date(Date.now() - days * 86_400_000));
  const rows = await db.articleView.findMany({ where: { day: { gte: since } }, include: { article: { select: { title: true, slug: true } } } });
  const byDay = new Map<string, number>();
  const byArticle = new Map<string, { title: string; slug: string; views: number }>();
  for (const r of rows) {
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.count);
    const e = byArticle.get(r.articleId) ?? { title: r.article.title, slug: r.article.slug, views: 0 };
    e.views += r.count;
    byArticle.set(r.articleId, e);
  }
  return { total: [...byDay.values()].reduce((a, b) => a + b, 0), byDay: [...byDay.entries()].sort(), top: [...byArticle.values()].sort((a, b) => b.views - a.views).slice(0, 8) };
}
