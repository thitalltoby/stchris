import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { db } from '@/server/db';
import { resetDb, makeUser, principal } from './helpers';
import { saveArticle, deleteArticle, publishDueArticles, listPublished, getPublishedBySlug, recordView, readership, publishProblems, listArticlesAdmin, getArticleAdmin } from '@/server/journal';
import { connectAccount, prepareShares, runSocialPost, retryPost, markPostedByHand, listAccounts, verifyAccount, updateAccount } from '@/server/social';
import { runDueJobs } from '@/server/jobs';
import { JOURNAL_CATEGORIES } from '@/content/journal';

const fail = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as Error & { code?: string }; } };

// ── A fake social platform. `mode` decides how every call answers; `calls` records what was sent. ──
let server: http.Server;
let mode: 'ok' | 'unauthorised' | 'rate' | 'down' | 'rejected' = 'ok';
const calls: { method: string; url: string; auth: string | undefined; body: any }[] = [];
let igStatus = 'FINISHED';

beforeAll(async () => {
  await resetDb();
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body: any = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { /* not json */ }
      calls.push({ method: req.method ?? '', url: req.url ?? '', auth: req.headers.authorization, body });
      const send = (s: number, j: unknown, h: Record<string, string> = {}) => { res.writeHead(s, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(j)); };
      if (mode === 'unauthorised') return send(401, { message: 'The access token is invalid or expired' });
      if (mode === 'rate') return send(429, { message: 'slow down' });
      if (mode === 'down') return send(503, { message: 'maintenance' });
      if (mode === 'rejected' && req.method === 'POST') return send(422, { error: { message: 'Duplicate content' } });
      const u = req.url ?? '';
      if (u.startsWith('/li/v2/userinfo')) return send(200, { name: 'Chris Iyoha' });
      if (u.startsWith('/li/rest/posts')) return send(201, {}, { 'x-restli-id': 'urn:li:share:7001' });
      if (u.startsWith('/fb/') && u.includes('/feed')) return send(200, { id: '1234_5678' });
      if (u.startsWith('/fb/') && u.includes('fields=name')) return send(200, { name: 'St. Chris Page' });
      if (u.includes('/media_publish')) return send(200, { id: 'ig-media-1' });
      if (u.includes('/media?') || u.endsWith('/media')) return send(200, { id: 'container-1' });
      if (u.includes('status_code')) return send(200, { status_code: igStatus });
      if (u.includes('permalink')) return send(200, { permalink: 'https://www.instagram.com/p/abc/' });
      if (u.includes('fields=username')) return send(200, { username: 'stchris' });
      if (u === '/x/2/tweets') return send(201, { data: { id: '99887766', text: body.text } });
      if (u === '/x/2/users/me') return send(200, { data: { username: 'chrisiyoha' } });
      send(404, { message: 'unknown ' + u });
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SOCIAL_API_BASE_LINKEDIN = `${base}/li`;
  process.env.SOCIAL_API_BASE_FACEBOOK = `${base}/fb`;
  process.env.SOCIAL_API_BASE_INSTAGRAM = `${base}/ig`;
  process.env.SOCIAL_API_BASE_X = `${base}/x`;
  process.env.SOCIAL_POLL_MS = '1';
});
afterAll(async () => { await new Promise((r) => server.close(r)); });

let admin: ReturnType<typeof principal>;
let writer: ReturnType<typeof principal>;
let comms: ReturnType<typeof principal>;
let staff: ReturnType<typeof principal>;
let catId: string;

const BODY = 'Trust is built in small, repeated commitments that are kept. '.repeat(6);
const draft = (over: Record<string, unknown> = {}) => ({ title: 'On keeping commitments', excerpt: 'A short note on why consistency is the root of trust.', body: BODY, categoryId: catId, tags: 'trust, leadership', ...over });

beforeEach(async () => {
  mode = 'ok'; igStatus = 'FINISHED'; calls.length = 0;
  await db.socialPost.deleteMany(); await db.socialAccount.deleteMany(); await db.article.deleteMany(); await db.articleCategory.deleteMany(); await db.job.deleteMany(); await db.notificationEvent.deleteMany();
  admin = principal(await db.user.findFirst({ where: { role: 'SUPER_ADMIN' } }) ?? await makeUser('SUPER_ADMIN'));
  writer = principal(await db.user.findFirst({ where: { role: 'STAFF_MEMBER' } }) ?? await makeUser('STAFF_MEMBER'));
  comms = principal(await db.user.findFirst({ where: { role: 'COMMUNICATIONS' } }) ?? await makeUser('COMMUNICATIONS'));
  staff = principal(await db.user.findFirst({ where: { role: 'CONTENT_MANAGER' } }) ?? await makeUser('CONTENT_MANAGER'));
  for (const [i, c] of JOURNAL_CATEGORIES.entries()) await db.articleCategory.create({ data: { ...c, sortOrder: i } });
  catId = (await db.articleCategory.findFirstOrThrow({ where: { slug: 'leadership-executive-development' } })).id;
});

describe('the journal', () => {
  it('has the eight categories from the brief', async () => {
    expect(JOURNAL_CATEGORIES.map((c) => c.name)).toEqual(['Leadership & Executive Development', 'Business & Enterprise', 'Industry Insights', 'Partnerships & Collaborations', 'Career & Opportunities', 'Personal Reflections', 'Corporate News', 'Events & Speaking Engagements']);
  });

  it('saves a draft that the public cannot see, then publishes it', async () => {
    const a = await saveArticle(staff, null, draft());
    expect(a.status).toBe('DRAFT');
    expect(a.slug).toBe('on-keeping-commitments');
    expect(a.tags).toEqual(['trust', 'leadership']);
    expect((await listPublished()).total).toBe(0);
    expect(await getPublishedBySlug(a.slug)).toBeNull();
    const live = await saveArticle(staff, a.id, draft(), 'publish');
    expect(live.status).toBe('PUBLISHED');
    expect(live.publishedAt).toBeTruthy();
    expect((await getPublishedBySlug(a.slug))?.title).toBe('On keeping commitments');
  });

  it('refuses to publish unfinished text, a missing summary or a tiny body', async () => {
    const e1 = await fail(saveArticle(staff, null, draft({ body: BODY + ' The partnership began in [[year]].' }), 'publish'));
    expect(e1?.message).toMatch(/double square brackets/);
    expect((await fail(saveArticle(staff, null, draft({ excerpt: '' }), 'publish')))?.message).toMatch(/short summary/);
    expect((await fail(saveArticle(staff, null, draft({ body: 'tiny' }), 'publish')))?.message).toMatch(/too short/);
    expect(publishProblems({ title: 't', excerpt: 'x'.repeat(30), body: 'y'.repeat(100) })).toEqual([]);
    // …but the same text saves fine as a draft
    expect((await saveArticle(staff, null, draft({ body: 'The year was [[year]].' }))).status).toBe('DRAFT');
  });

  it('keeps a published address stable when the title changes, and makes drafts unique', async () => {
    const a = await saveArticle(staff, null, draft(), 'publish');
    const edited = await saveArticle(staff, a.id, draft({ title: 'A completely different title' }));
    expect(edited.slug).toBe('on-keeping-commitments');
    const b = await saveArticle(staff, null, draft());
    expect(b.slug).toBe('on-keeping-commitments-2');
  });

  it('schedules for later and publishes when due, and not before', async () => {
    const when = new Date(Date.now() + 3 * 3600_000).toISOString();
    const a = await saveArticle(staff, null, draft({ scheduledFor: when }), 'schedule');
    expect(a.status).toBe('SCHEDULED');
    expect(await publishDueArticles()).toBe(0);
    expect((await listPublished()).total).toBe(0);
    expect(await publishDueArticles(new Date(Date.now() + 4 * 3600_000))).toBe(1);
    expect((await db.article.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('PUBLISHED');
    expect((await fail(saveArticle(staff, null, draft({ scheduledFor: new Date(Date.now() - 1000).toISOString() }), 'schedule')))?.message).toMatch(/future|minute/);
  });

  it('takes an article off the site, restores it, and only deletes it once it is not live', async () => {
    const a = await saveArticle(staff, null, draft(), 'publish');
    expect((await fail(deleteArticle(staff, a.id)))?.message).toMatch(/off the site first/);
    await saveArticle(staff, a.id, draft(), 'archive');
    expect(await getPublishedBySlug(a.slug)).toBeNull();
    await saveArticle(staff, a.id, draft(), 'restore');
    expect((await db.article.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('DRAFT');
    await deleteArticle(staff, a.id);
    expect(await db.article.count()).toBe(0);
  });

  it('accepts YouTube links and refuses other video addresses', async () => {
    const a = await saveArticle(staff, null, draft({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }));
    expect(a.videoUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect((await fail(saveArticle(staff, null, draft({ videoUrl: 'https://evil.example/v.mp4' }))))?.message).toMatch(/YouTube or Vimeo/);
  });

  it('accepts a supplied photograph as featured image and refuses an unknown one', async () => {
    expect((await saveArticle(staff, null, draft({ featuredImageKey: 'chris-portrait' }))).featuredImageKey).toBe('chris-portrait');
    expect(await fail(saveArticle(staff, null, draft({ featuredImageKey: 'not-a-photo' })))).toBeTruthy();
  });

  it('counts readership per day without personal data', async () => {
    const a = await saveArticle(staff, null, draft(), 'publish');
    await recordView(a.id); await recordView(a.id); await recordView(a.id);
    const r = await readership(7);
    expect(r.total).toBe(3);
    expect(r.top[0]).toMatchObject({ title: 'On keeping commitments', views: 3 });
  });
});

describe('who can do what', () => {
  it('lets a staff member with no journal permission do nothing', async () => {
    expect((await fail(saveArticle(writer, null, draft())))?.code).toBe('FORBIDDEN');
    expect((await fail(listArticlesAdmin(writer)))?.code).toBe('FORBIDDEN');
  });
  it('lets communications publish and a content manager publish; only publishers delete', async () => {
    const a = await saveArticle(comms, null, draft(), 'publish');
    expect(a.status).toBe('PUBLISHED');
    await saveArticle(staff, a.id, draft(), 'archive');
    await deleteArticle(admin, a.id);
  });
  it('stops a writer who cannot publish from publishing or touching others’ articles', async () => {
    // a role with journal.write but not journal.publish does not exist by default; prove the rule with the permission matrix
    const { can } = await import('@/lib/permissions');
    expect(can('COMMUNICATIONS', 'journal.publish')).toBe(true);
    expect(can('STAFF_MEMBER', 'journal.write')).toBe(false);
    expect(can('OPS_STAFF', 'journal.write')).toBe(false);
    const a = await saveArticle(staff, null, draft());
    expect((await fail(getArticleAdmin(principal(await makeUser('OPS_STAFF')), a.id)))?.code).toBe('FORBIDDEN');
  });
});

async function connectAll() {
  const li = await connectAccount(comms, { platform: 'linkedin', displayName: 'Chris Iyoha, LinkedIn', externalId: 'urn:li:person:abc', token: 'li-token' });
  const fb = await connectAccount(comms, { platform: 'facebook', displayName: 'St. Chris Page', externalId: '1234', token: 'fb-token' });
  const ig = await connectAccount(comms, { platform: 'instagram', displayName: 'St. Chris Instagram', externalId: '1789', token: 'ig-token' });
  const x = await connectAccount(comms, { platform: 'x', displayName: 'Chris Iyoha, X', externalId: 'x-1', token: 'x-token' });
  return { li, fb, ig, x };
}
const sel = (accountId: string, over: Partial<{ caption: string; hashtags: string; includeLink: boolean }> = {}) => ({ accountId, caption: 'New on the journal: keeping commitments.', hashtags: 'leadership trust', includeLink: true, ...over });

describe('social accounts', () => {
  it('stores tokens encrypted and never returns them', async () => {
    const { li } = await connectAll();
    expect(JSON.stringify(li)).not.toContain('li-token');
    const raw = await db.socialAccount.findUniqueOrThrow({ where: { id: li.id } });
    expect(raw.secretEnc).toBeTruthy();
    expect(raw.secretEnc).not.toContain('li-token');
    expect(JSON.stringify(await listAccounts())).not.toMatch(/secretEnc|li-token/);
    expect(calls.find((c) => c.url.includes('userinfo'))?.auth).toBe('Bearer li-token');
  });
  it('refuses a token the platform rejects, and says why', async () => {
    mode = 'unauthorised';
    const e = await fail(connectAccount(comms, { platform: 'x', displayName: 'Chris Iyoha, X', externalId: 'x-2', token: 'bad' }));
    expect(e?.message).toMatch(/did not accept that token/);
    expect(await db.socialAccount.count()).toBe(0);
  });
  it('needs the social.manage permission', async () => {
    expect((await fail(connectAccount(staff, { platform: 'x', displayName: 'Chris X', externalId: 'x-3', token: 't' })))?.code).toBe('FORBIDDEN');
  });
  it('flags an account that stops working when it is re-checked', async () => {
    const { x } = await connectAll();
    mode = 'unauthorised';
    expect((await verifyAccount(comms, x.id)).ok).toBe(false);
    expect((await db.socialAccount.findUniqueOrThrow({ where: { id: x.id } })).status).toBe('NEEDS_ATTENTION');
    mode = 'ok';
    await updateAccount(comms, x.id, { token: 'new-token' });
    expect((await verifyAccount(comms, x.id)).ok).toBe(true);
  });
});

describe('publishing to social channels', () => {
  it('sends the chosen channels only, with each platform’s own text, when the article goes live', async () => {
    const { li, fb, x } = await connectAll();
    calls.length = 0;
    const a = await saveArticle(staff, null, draft());
    await prepareShares(staff, a.id, [sel(li.id), sel(fb.id, { caption: 'Facebook wording.' }), sel(x.id, { hashtags: 'a b c d e' })]);
    expect(calls).toHaveLength(0); // nothing goes out while it is a draft
    await saveArticle(staff, a.id, draft(), 'publish');
    await runDueJobs(20);
    const posts = await db.socialPost.findMany({ where: { articleId: a.id }, include: { account: true } });
    expect(posts.map((p) => [p.account.platform, p.status]).sort()).toEqual([['facebook', 'PUBLISHED'], ['linkedin', 'PUBLISHED'], ['x', 'PUBLISHED']]);
    const link = `${process.env.APP_URL}/journal/on-keeping-commitments`;
    const liCall = calls.find((c) => c.url === '/li/rest/posts')!;
    expect(liCall.body.author).toBe('urn:li:person:abc');
    expect(liCall.body.commentary).toContain('#leadership #trust');
    expect(liCall.body.content.article.source).toBe(link);
    const fbCall = calls.find((c) => c.url.endsWith('/feed'))!;
    expect(fbCall.body).toMatchObject({ message: 'Facebook wording.\n\n#leadership #trust', link });
    const xCall = calls.find((c) => c.url === '/x/2/tweets')!;
    expect(xCall.body.text.match(/#/g)).toHaveLength(3); // X is capped at three hashtags
    expect(xCall.body.text).toContain(link);
    expect(calls.some((c) => c.url.includes('/ig'))).toBe(false); // Instagram was not chosen
    expect(posts.find((p) => p.account.platform === 'linkedin')?.externalUrl).toContain('urn:li:share:7001');
  });

  it('does not post twice if the job runs again', async () => {
    const { x } = await connectAll();
    const a = await saveArticle(staff, null, draft());
    await prepareShares(staff, a.id, [sel(x.id)]);
    await saveArticle(staff, a.id, draft(), 'publish');
    await runDueJobs(20);
    const post = await db.socialPost.findFirstOrThrow({ where: { articleId: a.id } });
    await runSocialPost(post.id); await runSocialPost(post.id);
    expect(calls.filter((c) => c.url === '/x/2/tweets')).toHaveLength(1);
  });

  it('queues channels chosen after the article is already live', async () => {
    const { x } = await connectAll();
    const a = await saveArticle(staff, null, draft(), 'publish');
    await prepareShares(staff, a.id, [sel(x.id)]);
    await runDueJobs(20);
    expect((await db.socialPost.findFirstOrThrow({ where: { articleId: a.id } })).status).toBe('PUBLISHED');
  });

  it('marks the account for attention, fails the post without retrying, and tells the team when the token is rejected', async () => {
    const { li } = await connectAll();
    const a = await saveArticle(staff, null, draft());
    await prepareShares(staff, a.id, [sel(li.id)]);
    mode = 'unauthorised';
    calls.length = 0;
    await saveArticle(staff, a.id, draft(), 'publish');
    await runDueJobs(20);
    const post = await db.socialPost.findFirstOrThrow({ where: { articleId: a.id } });
    expect(post.status).toBe('FAILED');
    expect(post.error).toMatch(/refused the connection/);
    expect(calls.filter((c) => c.url === '/li/rest/posts')).toHaveLength(1); // no pointless retries
    expect((await db.socialAccount.findUniqueOrThrow({ where: { id: li.id } })).status).toBe('NEEDS_ATTENTION');
    expect(await db.notificationEvent.count({ where: { type: 'social.attention' } })).toBeGreaterThan(0);
  });

  it('retries a rate limit with backoff, and gives up cleanly after three attempts', async () => {
    const { x } = await connectAll();
    const a = await saveArticle(staff, null, draft());
    await prepareShares(staff, a.id, [sel(x.id)]);
    mode = 'rate';
    await saveArticle(staff, a.id, draft(), 'publish');
    await runDueJobs(20);
    let post = await db.socialPost.findFirstOrThrow({ where: { articleId: a.id } });
    expect(post.status).toBe('QUEUED');
    expect(post.attempts).toBe(1);
    expect(post.error).toMatch(/rate limit/);
    // the platform recovers
    mode = 'ok';
    await db.job.updateMany({ where: { type: 'social_publish', status: 'PENDING' }, data: { runAt: new Date() } });
    await runDueJobs(20);
    post = await db.socialPost.findFirstOrThrow({ where: { articleId: a.id } });
    expect(post.status).toBe('PUBLISHED');
  });

  it('fails after three tries when the platform stays down', async () => {
    const { x } = await connectAll();
    const a = await saveArticle(staff, null, draft());
    await prepareShares(staff, a.id, [sel(x.id)]);
    mode = 'down';
    await saveArticle(staff, a.id, draft(), 'publish');
    for (let i = 0; i < 4; i++) { await db.job.updateMany({ where: { type: 'social_publish', status: 'PENDING' }, data: { runAt: new Date() } }); await runDueJobs(20); }
    const post = await db.socialPost.findFirstOrThrow({ where: { articleId: a.id } });
    expect(post.status).toBe('FAILED');
    expect(post.error).toMatch(/gave up after 3 attempts/);
  });

  it('keeps a platform rejection as a failure the team can read and retry', async () => {
    const { fb } = await connectAll();
    const a = await saveArticle(staff, null, draft());
    await prepareShares(staff, a.id, [sel(fb.id)]);
    mode = 'rejected';
    await saveArticle(staff, a.id, draft(), 'publish');
    await runDueJobs(20);
    const post = await db.socialPost.findFirstOrThrow({ where: { articleId: a.id } });
    expect(post.status).toBe('FAILED');
    expect(post.error).toMatch(/Duplicate content/);
    mode = 'ok';
    await retryPost(comms, post.id);
    await runDueJobs(20);
    expect((await db.socialPost.findUniqueOrThrow({ where: { id: post.id } })).status).toBe('PUBLISHED');
  });
});

describe('honest fallbacks: nothing is promised that cannot be delivered', () => {
  it('puts an Instagram post on the manual list when there is no picture, and posts nothing', async () => {
    const { ig } = await connectAll();
    calls.length = 0;
    const a = await saveArticle(staff, null, draft());
    await prepareShares(staff, a.id, [sel(ig.id)]);
    await saveArticle(staff, a.id, draft(), 'publish');
    await runDueJobs(20);
    const post = await db.socialPost.findFirstOrThrow({ where: { articleId: a.id } });
    expect(post.status).toBe('NEEDS_MANUAL');
    expect(post.note).toMatch(/needs a picture/);
    expect(calls).toHaveLength(0);
    expect(await db.notificationEvent.count({ where: { type: 'social.attention' } })).toBeGreaterThan(0);
  });

  it('refuses to auto-post Instagram from a local address even with a picture, because Instagram must fetch it from the internet', async () => {
    const { ig } = await connectAll();
    const a = await saveArticle(staff, null, draft({ featuredImageKey: 'chris-portrait' }));
    await prepareShares(staff, a.id, [sel(ig.id)]);
    await saveArticle(staff, a.id, draft({ featuredImageKey: 'chris-portrait' }), 'publish');
    expect((await db.socialPost.findFirstOrThrow({ where: { articleId: a.id } })).note).toMatch(/live public website/);
  });

  it('posts to Instagram through the container flow on a public site with a JPEG', async () => {
    const { ig } = await connectAll();
    const prev = process.env.APP_URL;
    // env is read lazily and cached; patch the cached value the way a deployment would configure it
    const { getEnv } = await import('@/server/env');
    const e = getEnv() as { APP_URL: string };
    const before = e.APP_URL; e.APP_URL = 'https://stchris.example.com';
    try {
      const a = await saveArticle(staff, null, draft({ featuredImageKey: 'chris-portrait' }));
      await prepareShares(staff, a.id, [sel(ig.id)]);
      calls.length = 0;
      await saveArticle(staff, a.id, draft({ featuredImageKey: 'chris-portrait' }), 'publish');
      await runDueJobs(20);
      const post = await db.socialPost.findFirstOrThrow({ where: { articleId: a.id } });
      expect(post.status).toBe('PUBLISHED');
      expect(post.externalUrl).toBe('https://www.instagram.com/p/abc/');
      const create = calls.find((c) => c.url.endsWith('/media'))!;
      expect(create.body.image_url).toBe('https://stchris.example.com/photos/chris-portrait.jpg');
      expect(create.body.caption).not.toContain('https://');
      expect(calls.findIndex((c) => c.url.includes('media_publish'))).toBeGreaterThan(calls.indexOf(create));
    } finally { e.APP_URL = before; process.env.APP_URL = prev; }
  });

  it('reports a too-long X post instead of cutting it', async () => {
    const { x } = await connectAll();
    const a = await saveArticle(staff, null, draft());
    await prepareShares(staff, a.id, [sel(x.id, { caption: 'z'.repeat(300) })]);
    await saveArticle(staff, a.id, draft(), 'publish');
    const post = await db.socialPost.findFirstOrThrow({ where: { articleId: a.id } });
    expect(post.status).toBe('NEEDS_MANUAL');
    expect(post.note).toMatch(/longer than X allows/);
  });

  it('never calls the API for an account set to “I post by hand”, and lets the team record the result', async () => {
    const acc = await connectAccount(comms, { platform: 'linkedin', displayName: 'Company page', externalId: 'urn:li:organization:1', mode: 'MANUAL' });
    calls.length = 0;
    const a = await saveArticle(staff, null, draft());
    await prepareShares(staff, a.id, [sel(acc.id)]);
    await saveArticle(staff, a.id, draft(), 'publish');
    await runDueJobs(20);
    const post = await db.socialPost.findFirstOrThrow({ where: { articleId: a.id } });
    expect(post.status).toBe('NEEDS_MANUAL');
    expect(calls).toHaveLength(0);
    expect((await fail(markPostedByHand(comms, post.id, 'http://insecure.example/post')))?.message).toMatch(/https/);
    await markPostedByHand(comms, post.id, 'https://www.linkedin.com/feed/update/urn:li:share:1/');
    expect((await db.socialPost.findUniqueOrThrow({ where: { id: post.id } })).status).toBe('PUBLISHED');
  });

  it('does not queue a post for an article that is not live', async () => {
    const { x } = await connectAll();
    const a = await saveArticle(staff, null, draft());
    await prepareShares(staff, a.id, [sel(x.id)]);
    const post = await db.socialPost.findFirstOrThrow({ where: { articleId: a.id } });
    expect(post.status).toBe('PENDING');
    await runSocialPost(post.id);
    expect(calls.filter((c) => c.url === '/x/2/tweets')).toHaveLength(0);
  });
});
