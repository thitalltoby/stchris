import 'server-only';
import { db } from './db';
import { audit } from './audit';
import { assertAnyCan, type Principal } from './rbac';
import { invalid, notFound } from './errors';
import { saveUpload, deleteStored, readStored } from './storage';
import { isServable } from './scan';
import { PHOTO_ALT } from '@/content/photos';

/** Media-library images are stored as public Documents under this section name. */
export const MEDIA_SECTION = 'media';
export const MEDIA_PREFIX = 'media:';
const IMAGE_EXT = /\.(jpe?g|png)$/i;

export async function saveMedia(user: Principal, file: File, alt: string) {
  assertAnyCan(user, ['content.manage', 'media.manage', 'journal.write']);
  const text = alt.trim().replace(/\s+/g, ' ');
  if (text.length < 5) throw invalid('Describe the photo in a few words (for people who cannot see it).', { alt: 'Required, at least 5 characters.' });
  if (text.length > 200) throw invalid('Keep the description under 200 characters.', { alt: 'Too long.' });
  if (!file || file.size === 0) throw invalid('Choose a photo to upload.', { file: 'Required.' });
  if (!IMAGE_EXT.test(file.name)) throw invalid('Photos must be JPG or PNG files.', { file: 'Choose a JPG or PNG.' });
  const stored = await saveUpload(file);
  try {
    const d = await db.document.create({ data: { ...stored, visibility: 'PUBLIC', section: MEDIA_SECTION, title: text, uploadedById: user.id, uploadedByLabel: user.name } });
    await audit({ id: user.id, label: user.name }, 'media.added', 'Document', d.id, { alt: text, name: stored.originalName });
    return d;
  } catch (e) {
    await deleteStored(stored.storageKey).catch(() => undefined);
    throw e;
  }
}

export async function listMedia(opts: { includeHeld?: boolean } = {}) {
  const docs = await db.document.findMany({ where: { visibility: 'PUBLIC', section: MEDIA_SECTION }, orderBy: { createdAt: 'desc' } });
  return opts.includeHeld ? docs : docs.filter((d) => isServable(d.scanStatus));
}

/** Where a library photo is used, so it is never deleted from under a page. */
export async function mediaUsage(id: string): Promise<string[]> {
  const key = `${MEDIA_PREFIX}${id}`;
  const [categories, products, services, pages, articles, entries, divisions, items] = await Promise.all([
    db.category.findMany({ where: { imageKey: key }, select: { name: true } }),
    db.product.findMany({ where: { imageKeys: { array_contains: key } }, select: { name: true } }),
    db.service.findMany({ where: { imageKey: key }, select: { name: true } }),
    db.siteSetting.findMany({ where: { key: { startsWith: 'page:' } } }),
    db.article.findMany({ where: { OR: [{ featuredImageKey: key }, { body: { contains: `/media/${id}` } }] }, select: { title: true } }),
    db.timelineEntry.findMany({ where: { imageKey: key }, select: { title: true } }),
    db.division.findMany({ where: { imageKey: key }, select: { name: true } }),
    db.mediaItem.findMany({ where: { imageKey: key }, select: { title: true } }),
  ]);
  return [
    ...categories.map((c) => `Category: ${c.name}`),
    ...products.map((p) => `Product: ${p.name}`),
    ...services.map((s) => `Request type: ${s.name}`),
    ...articles.map((a) => `Journal: ${a.title}`),
    ...entries.map((e) => `Profile entry: ${e.title}`),
    ...divisions.map((d) => `Division: ${d.name}`),
    ...items.map((m) => `Media centre: ${m.title}`),
    ...pages.filter((p) => (p.value as { photo?: string } | null)?.photo === key).map((p) => `Page: /${p.key.slice(5)}`),
  ];
}

export async function deleteMedia(user: Principal, id: string) {
  assertAnyCan(user, ['content.manage', 'media.manage']);
  const d = await db.document.findFirst({ where: { id, visibility: 'PUBLIC', section: MEDIA_SECTION } });
  if (!d) throw notFound('Photo not found.');
  const used = await mediaUsage(id);
  if (used.length) throw invalid(`This photo is in use (${used.join('; ')}). Choose a different photo there first.`);
  await db.document.delete({ where: { id } });
  await deleteStored(d.storageKey).catch(() => undefined);
  await audit({ id: user.id, label: user.name }, 'media.removed', 'Document', id, { alt: d.title });
}

/** Public image: only library photos that passed the scan. */
export async function getPublicMedia(id: string) {
  const d = await db.document.findFirst({ where: { id, visibility: 'PUBLIC', section: MEDIA_SECTION } });
  if (!d || !isServable(d.scanStatus)) return null;
  const data = await readStored(d.storageKey).catch(() => null);
  return data ? { doc: d, data } : null;
}

/** Choices for a photo picker: nothing, the supplied photographs, and the library. */
export async function photoOptions(opts: { libraryOnly?: boolean } = {}) {
  const lib = (await listMedia()).map((d) => ({ value: `${MEDIA_PREFIX}${d.id}`, label: `Uploaded: ${d.title ?? d.originalName}` }));
  const supplied = Object.entries(PHOTO_ALT).map(([k, v]) => ({ value: k, label: `Supplied: ${v}` }));
  return [{ value: '', label: 'No photo' }, ...lib, ...(opts.libraryOnly ? [] : supplied)];
}

/** An image reference is '', a supplied photograph's key, or media:<id> of a servable library photo. Returns the cleaned value or null. */
export async function checkImageRef(raw: string | null | undefined): Promise<string | null> {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (v in PHOTO_ALT) return v;
  if (v.startsWith(MEDIA_PREFIX)) {
    const d = await db.document.findFirst({ where: { id: v.slice(MEDIA_PREFIX.length), visibility: 'PUBLIC', section: MEDIA_SECTION } });
    if (d && isServable(d.scanStatus)) return v;
  }
  throw invalid('Choose a photo from the list.', { image: 'Not an available photo.' });
}
