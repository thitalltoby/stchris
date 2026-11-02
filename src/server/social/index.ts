import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { env } from '../env';
import { audit } from '../audit';
import { conflict, forbidden, invalid, notFound } from '../errors';
import { assertCan, type Principal } from '../rbac';
import { decryptJson, encryptJson } from '../crypto';
import { enqueueJob, registerJob } from '../jobs';
import { enqueueEmail } from '../notify';
import { emailTemplate } from '../email-templates';
import { ADAPTERS, SocialError } from './adapters';
import { PLATFORMS, SPECS, composePost, manualReason, normaliseHashtags, type Platform } from '@/lib/journal';

const MAX_AUTO_ATTEMPTS = 3;
export const articleUrl = (slug: string) => `${env.APP_URL}/journal/${slug}`;
const isPlatform = (p: string): p is Platform => (PLATFORMS as readonly string[]).includes(p);

/** Account rows with the secret removed. The token never leaves the server. */
const SAFE_ACCOUNT = { id: true, platform: true, displayName: true, externalId: true, mode: true, status: true, tokenExpiresAt: true, lastCheckedAt: true, lastError: true, createdAt: true } as const;

export const listAccounts = () => db.socialAccount.findMany({ select: SAFE_ACCOUNT, orderBy: [{ platform: 'asc' }, { displayName: 'asc' }] });

// ─── Accounts ──────────────────────────────────────────────────────

const connectSchema = z.object({
  platform: z.string().refine(isPlatform, 'Choose a platform.'),
  displayName: z.string().trim().min(2, 'Name the account (for example “Chris Iyoha, LinkedIn”).').max(80),
  externalId: z.string().trim().min(2, 'Enter the account or page identifier.').max(200),
  token: z.string().trim().max(4000).optional().default(''),
  mode: z.enum(['AUTO', 'MANUAL']).default('AUTO'),
  tokenExpiresOn: z.string().optional().default(''),
});

export async function connectAccount(user: Principal, raw: unknown) {
  assertCan(user, 'social.manage');
  const p = connectSchema.safeParse(raw);
  if (!p.success) {
    const fields: Record<string, string> = {};
    for (const i of p.error.issues) fields[String(i.path[0])] ??= i.message;
    throw invalid(p.error.issues[0]!.message, fields);
  }
  const d = p.data;
  const platform = d.platform as Platform;
  if (d.mode === 'AUTO' && !d.token) throw invalid('Paste the access token, or choose “I post by hand” for this account.', { token: 'Required for automatic posting.' });
  if (await db.socialAccount.findUnique({ where: { platform_externalId: { platform, externalId: d.externalId } } })) throw conflict('That account is already connected.');
  let status = 'CONNECTED';
  let lastError: string | null = null;
  if (d.mode === 'AUTO') {
    try {
      await ADAPTERS[platform].verify(d.externalId, d.token);
    } catch (e) {
      // A bad token is refused up front. A platform that is merely unreachable does not stop the connection being saved.
      if (e instanceof SocialError && (e.kind === 'auth' || e.kind === 'rejected')) throw invalid(`${SPECS[platform].label} did not accept that token: ${e.message}`, { token: 'Not accepted.' });
      status = 'NEEDS_ATTENTION';
      lastError = e instanceof Error ? e.message : 'Could not check the connection.';
    }
  }
  const exp = d.tokenExpiresOn ? new Date(d.tokenExpiresOn) : null;
  const acc = await db.socialAccount.create({
    data: { platform, displayName: d.displayName, externalId: d.externalId, mode: d.mode, status, lastError, lastCheckedAt: new Date(), secretEnc: d.token ? encryptJson({ token: d.token }) : null, tokenExpiresAt: exp && !Number.isNaN(exp.getTime()) ? exp : null, connectedById: user.id },
    select: SAFE_ACCOUNT,
  });
  await audit({ id: user.id, label: user.name }, 'social.connected', 'SocialAccount', acc.id, { platform, mode: d.mode });
  return acc;
}

export async function verifyAccount(user: Principal, id: string) {
  assertCan(user, 'social.manage');
  const acc = await db.socialAccount.findUnique({ where: { id } });
  if (!acc) throw notFound('Account not found.');
  if (acc.mode === 'MANUAL') return { ok: true, message: 'This account is posted by hand, so there is no connection to check.' };
  const token = decryptJson<{ token: string }>(acc.secretEnc)?.token;
  if (!token) {
    await db.socialAccount.update({ where: { id }, data: { status: 'NEEDS_ATTENTION', lastError: 'No token stored. Reconnect the account.', lastCheckedAt: new Date() } });
    return { ok: false, message: 'No token is stored for this account. Reconnect it.' };
  }
  try {
    await ADAPTERS[acc.platform as Platform].verify(acc.externalId, token);
    await db.socialAccount.update({ where: { id }, data: { status: 'CONNECTED', lastError: null, lastCheckedAt: new Date() } });
    return { ok: true, message: 'The connection works.' };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Check failed.';
    await db.socialAccount.update({ where: { id }, data: { status: 'NEEDS_ATTENTION', lastError: message, lastCheckedAt: new Date() } });
    return { ok: false, message };
  }
}

export async function updateAccount(user: Principal, id: string, patch: { mode?: 'AUTO' | 'MANUAL'; disabled?: boolean; token?: string }) {
  assertCan(user, 'social.manage');
  const acc = await db.socialAccount.findUnique({ where: { id } });
  if (!acc) throw notFound('Account not found.');
  const data: Prisma.SocialAccountUpdateInput = {};
  if (patch.mode) data.mode = patch.mode;
  if (patch.disabled !== undefined) data.status = patch.disabled ? 'DISABLED' : 'CONNECTED';
  if (patch.token) { data.secretEnc = encryptJson({ token: patch.token.trim() }); data.status = 'CONNECTED'; data.lastError = null; }
  await db.socialAccount.update({ where: { id }, data });
  await audit({ id: user.id, label: user.name }, 'social.updated', 'SocialAccount', id, { mode: patch.mode, disabled: patch.disabled, tokenChanged: !!patch.token });
}

export async function disconnectAccount(user: Principal, id: string) {
  assertCan(user, 'social.manage');
  const acc = await db.socialAccount.findUnique({ where: { id }, select: { platform: true, displayName: true } });
  if (!acc) throw notFound('Account not found.');
  await db.socialAccount.delete({ where: { id } });
  await audit({ id: user.id, label: user.name }, 'social.disconnected', 'SocialAccount', id, { platform: acc.platform });
}

// ─── Per-article channel choices ───────────────────────────────────

export interface ShareSelection { accountId: string; caption: string; hashtags: string; includeLink: boolean }

/** Saves which channels an article goes to, with each platform's own caption, hashtags and link choice. If the article is already live, posts are queued at once. */
export async function prepareShares(user: Principal, articleId: string, selections: ShareSelection[]) {
  assertCan(user, 'social.publish');
  const article = await db.article.findUnique({ where: { id: articleId }, select: { id: true, status: true } });
  if (!article) throw notFound('Article not found.');
  const accounts = await db.socialAccount.findMany({ where: { id: { in: selections.map((s) => s.accountId) } } });
  const keep: string[] = [];
  for (const s of selections) {
    const acc = accounts.find((a) => a.id === s.accountId);
    if (!acc) throw invalid('One of the chosen accounts no longer exists.');
    if (acc.status === 'DISABLED') throw invalid(`${acc.displayName} is switched off. Switch it on in Social accounts first.`);
    const caption = s.caption.trim();
    if (!caption) throw invalid(`Write a caption for ${acc.displayName}.`, { [`caption-${acc.id}`]: 'Required.' });
    const hashtags = normaliseHashtags(s.hashtags, SPECS[acc.platform as Platform].maxHashtags);
    const existing = await db.socialPost.findUnique({ where: { articleId_accountId: { articleId, accountId: acc.id } } });
    if (existing && ['PUBLISHED', 'QUEUED'].includes(existing.status)) { keep.push(acc.id); continue; } // never rewrite what is out or in flight
    await db.socialPost.upsert({
      where: { articleId_accountId: { articleId, accountId: acc.id } },
      create: { articleId, accountId: acc.id, caption, hashtags, includeLink: s.includeLink, status: 'PENDING' },
      update: { caption, hashtags, includeLink: s.includeLink, status: 'PENDING', error: null, note: null },
    });
    keep.push(acc.id);
  }
  // Channels that were un-ticked before anything went out are removed
  await db.socialPost.deleteMany({ where: { articleId, accountId: { notIn: keep }, status: { in: ['PENDING', 'FAILED', 'NEEDS_MANUAL', 'CANCELLED'] } } });
  await audit({ id: user.id, label: user.name }, 'social.channels_set', 'Article', articleId, { accounts: keep.length });
  if (article.status === 'PUBLISHED') await queueSocialForArticle(articleId);
}

// ─── Publishing ────────────────────────────────────────────────────

async function imageFacts(key: string | null): Promise<{ url?: string; jpeg: boolean }> {
  if (!key) return { jpeg: false };
  if (key.startsWith('media:')) {
    const d = await db.document.findFirst({ where: { id: key.slice(6), section: 'media', visibility: 'PUBLIC' }, select: { id: true, mimeType: true } });
    return d ? { url: `${env.APP_URL}/media/${d.id}`, jpeg: d.mimeType === 'image/jpeg' } : { jpeg: false };
  }
  return { url: `${env.APP_URL}/photos/${key}.jpg`, jpeg: true };
}

const isPublicSite = () => { try { const h = new URL(env.APP_URL); return h.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.)/.test(h.hostname) && !h.hostname.endsWith('.test'); } catch { return false; } };

/** People who should hear when something needs a human: everyone who can publish socially, plus the article's author. */
async function teamRecipients(authorId: string): Promise<string[]> {
  const users = await db.user.findMany({ where: { isActive: true, OR: [{ id: authorId }, { role: { in: ['COMMUNICATIONS', 'CONTENT_MANAGER', 'SUPER_ADMIN'] } }] }, select: { email: true } });
  return [...new Set(users.map((u) => u.email))];
}

async function notifyTeam(post: { id: string; articleId: string; account: { platform: string; displayName: string } }, headline: string, detail: string) {
  const article = await db.article.findUnique({ where: { id: post.articleId }, select: { title: true, authorId: true } });
  if (!article) return;
  const tpl = emailTemplate({ heading: headline, paragraphs: [`Article: ${article.title}`, `Channel: ${post.account.displayName} (${SPECS[post.account.platform as Platform]?.label ?? post.account.platform})`, detail], cta: { label: 'Open the social queue', url: `${env.APP_URL}/admin/journal/social` } });
  await Promise.all((await teamRecipients(article.authorId)).map((to) => enqueueEmail({ type: 'social.attention', to, subject: `${headline}: ${article.title}`, ...tpl })));
}

/** Moves an article's prepared posts forward once it is live: automatic where the platform and account allow it, otherwise onto the manual list with a notification. */
export async function queueSocialForArticle(articleId: string) {
  const article = await db.article.findUnique({ where: { id: articleId } });
  if (!article || article.status !== 'PUBLISHED') return;
  const posts = await db.socialPost.findMany({ where: { articleId, status: 'PENDING' }, include: { account: true } });
  if (!posts.length) return;
  const img = await imageFacts(article.featuredImageKey);
  for (const p of posts) {
    const platform = p.account.platform as Platform;
    const composed = composePost(platform, { caption: p.caption, hashtags: p.hashtags as string[], url: articleUrl(article.slug), includeLink: p.includeLink });
    const reason = p.account.mode === 'MANUAL'
      ? 'This account is set to “I post by hand”. Copy the text below and post it, then mark it as posted.'
      : p.account.status !== 'CONNECTED' ? `The account needs attention (${p.account.lastError ?? 'not connected'}). Fix it in Social accounts, then retry, or post by hand.`
      : manualReason(platform, { hasImage: !!img.url, imageIsJpeg: img.jpeg, publicSite: isPublicSite(), composedTooLong: composed.tooLong });
    if (reason) {
      await db.socialPost.update({ where: { id: p.id }, data: { status: 'NEEDS_MANUAL', note: reason } });
      await notifyTeam(p, 'Post ready to share by hand', reason);
      continue;
    }
    await db.socialPost.update({ where: { id: p.id }, data: { status: 'QUEUED', note: null } });
    await enqueueJob('social_publish', { postId: p.id }, { dedupeKey: `social:${p.id}:${Date.now()}`, maxAttempts: MAX_AUTO_ATTEMPTS + 2 });
  }
}

/** Sends one queued post. Throws only for failures worth retrying, so the job runner backs off and tries again. */
export async function runSocialPost(postId: string) {
  const post = await db.socialPost.findUnique({ where: { id: postId }, include: { account: true, article: true } });
  if (!post || post.status !== 'QUEUED') return;
  if (post.article.status !== 'PUBLISHED') { await db.socialPost.update({ where: { id: postId }, data: { status: 'PENDING', note: 'Waiting for the article to be published.' } }); return; }
  const platform = post.account.platform as Platform;
  const token = decryptJson<{ token: string }>(post.account.secretEnc)?.token;
  if (!token || post.account.status === 'DISABLED') {
    await db.socialPost.update({ where: { id: postId }, data: { status: 'FAILED', error: 'The account has no usable token or is switched off.' } });
    return;
  }
  const url = articleUrl(post.article.slug);
  const composed = composePost(platform, { caption: post.caption, hashtags: post.hashtags as string[], url, includeLink: post.includeLink });
  const img = await imageFacts(post.article.featuredImageKey);
  try {
    const r = await ADAPTERS[platform].publish({ externalId: post.account.externalId, token, text: composed.text, url, title: post.article.title, excerpt: post.article.excerpt, imageUrl: img.url });
    await db.socialPost.update({ where: { id: postId }, data: { status: 'PUBLISHED', externalId: r.externalId, externalUrl: r.url ?? null, publishedAt: new Date(), error: null, note: null, attempts: { increment: 1 } } });
    await audit({ label: 'Social publisher' }, 'social.published', 'SocialPost', postId, { platform });
  } catch (e) {
    const err = e instanceof SocialError ? e : new SocialError('Unexpected error while posting.', 'transient');
    const attempts = post.attempts + 1;
    if (err.kind === 'auth') {
      await db.$transaction([
        db.socialPost.update({ where: { id: postId }, data: { status: 'FAILED', error: err.message, attempts } }),
        db.socialAccount.update({ where: { id: post.accountId }, data: { status: 'NEEDS_ATTENTION', lastError: err.message } }),
      ]);
      await notifyTeam(post, 'Social post failed: reconnect the account', err.message);
      return;
    }
    if (err.kind === 'rejected') {
      await db.socialPost.update({ where: { id: postId }, data: { status: 'FAILED', error: err.message, attempts } });
      await notifyTeam(post, 'Social post was rejected', err.message);
      return;
    }
    if (attempts >= MAX_AUTO_ATTEMPTS) {
      await db.socialPost.update({ where: { id: postId }, data: { status: 'FAILED', error: `${err.message} (gave up after ${attempts} attempts)`, attempts } });
      await notifyTeam(post, 'Social post failed after retries', err.message);
      return;
    }
    await db.socialPost.update({ where: { id: postId }, data: { error: err.message, attempts } });
    throw err; // job runner retries with backoff
  }
}

registerJob('social_publish', (p: { postId: string }) => runSocialPost(p.postId));

/** Put a failed or manual post back in the queue. */
export async function retryPost(user: Principal, id: string) {
  assertCan(user, 'social.publish');
  const post = await db.socialPost.findUnique({ where: { id } });
  if (!post) throw notFound('Post not found.');
  if (post.status === 'PUBLISHED' || post.status === 'QUEUED') throw conflict('This post is already out or waiting to go out.');
  await db.socialPost.update({ where: { id }, data: { status: 'PENDING', error: null, note: null, attempts: 0 } });
  await queueSocialForArticle(post.articleId);
  await audit({ id: user.id, label: user.name }, 'social.retried', 'SocialPost', id);
}

export async function markPostedByHand(user: Principal, id: string, url: string) {
  assertCan(user, 'social.publish');
  const post = await db.socialPost.findUnique({ where: { id } });
  if (!post) throw notFound('Post not found.');
  if (post.status === 'PUBLISHED') return;
  let link: string | null = null;
  if (url.trim()) { try { const u = new URL(url.trim()); if (u.protocol !== 'https:') throw new Error(); link = u.toString(); } catch { throw invalid('Paste the address of the post (https://…), or leave it empty.', { url: 'Not a valid address.' }); } }
  await db.socialPost.update({ where: { id }, data: { status: 'PUBLISHED', externalUrl: link, publishedAt: new Date(), error: null, note: 'Posted by hand.' } });
  await audit({ id: user.id, label: user.name }, 'social.posted_by_hand', 'SocialPost', id);
}

export async function cancelPost(user: Principal, id: string) {
  assertCan(user, 'social.publish');
  const post = await db.socialPost.findUnique({ where: { id } });
  if (!post) throw notFound('Post not found.');
  if (post.status === 'PUBLISHED') throw forbidden('A post that is already out cannot be cancelled here. Delete it on the platform.');
  await db.socialPost.update({ where: { id }, data: { status: 'CANCELLED' } });
  await audit({ id: user.id, label: user.name }, 'social.cancelled', 'SocialPost', id);
}

export async function listSocialLog(opts: { status?: string; take?: number } = {}) {
  return db.socialPost.findMany({
    where: opts.status ? { status: opts.status as never } : {},
    orderBy: { updatedAt: 'desc' }, take: opts.take ?? 100,
    include: { account: { select: { platform: true, displayName: true } }, article: { select: { id: true, title: true, slug: true } } },
  });
}

export async function socialSummary() {
  const g = await db.socialPost.groupBy({ by: ['status'], _count: true });
  return Object.fromEntries(g.map((x) => [x.status, x._count])) as Record<string, number>;
}
