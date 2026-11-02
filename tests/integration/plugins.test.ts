import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { db } from '@/server/db';
import { resetDb, makeUser, principal, makeService } from './helpers';
import { saveMedia, listMedia, deleteMedia, getPublicMedia, checkImageRef, mediaUsage } from '@/server/media';
import { getPublicDocument, addSectionDocument, getSectionContent, saveSectionContent, resetSectionContent } from '@/server/section-pages';
import { selectHomeFigures, LEGACY_HOME_IDS } from '@/lib/figures';
import { saveService } from '@/server/content';
import { saveCategory } from '@/server/catalogue';

// a real, tiny JPEG (SOI + EOI with a JFIF header): enough for the type check and the scanner
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
const jpg = (name = 'site.jpg') => new File([JPEG], name, { type: 'image/jpeg' });
const pdf = (name = 'brochure.pdf') => new File([Buffer.from('%PDF-1.4\n%%EOF\n')], name, { type: 'application/pdf' });
const fail = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as Error & { code?: string }; } };

let P: ReturnType<typeof principal>;
let sales: ReturnType<typeof principal>;

beforeAll(async () => { await resetDb(); });
beforeEach(async () => {
  await db.document.deleteMany(); await db.product.deleteMany(); await db.category.deleteMany(); await db.siteSetting.deleteMany();
  const ops = await db.user.findFirst({ where: { role: 'OPS_ADMIN' } }) ?? await makeUser('OPS_ADMIN');
  P = principal(ops);
  const other = await db.user.findFirst({ where: { role: 'APPROVER' } }) ?? await makeUser('APPROVER');
  sales = principal(other);
});

describe('media library', () => {
  it('stores a JPEG as a public library photo with its description, and serves it', async () => {
    const d = await saveMedia(P, jpg(), 'Tiles stacked on pallets');
    expect(d.section).toBe('media');
    expect(d.visibility).toBe('PUBLIC');
    expect((await listMedia()).map((x) => x.id)).toContain(d.id);
    const pub = await getPublicMedia(d.id);
    expect(pub?.doc.mimeType).toBe('image/jpeg');
    expect(pub?.data.length).toBe(JPEG.length);
  });
  it('refuses non-images, mislabelled files, missing descriptions and people without the content permission', async () => {
    expect((await fail(saveMedia(P, pdf('report.pdf'), 'A description')))?.message).toMatch(/JPG or PNG/);
    expect((await fail(saveMedia(P, new File([Buffer.from('%PDF-1.4')], 'fake.jpg', { type: 'image/jpeg' }), 'A description')))?.message).toMatch(/valid JPG/);
    expect((await fail(saveMedia(P, jpg(), 'ab')))?.message).toMatch(/Describe the photo/);
    const viewer = principal(await makeUser('CUSTOMER'));
    expect((await fail(saveMedia(viewer, jpg(), 'A description')))?.code).toBe('FORBIDDEN');
  });
  it('does not serve a library photo as a downloadable document', async () => {
    const photo = await saveMedia(P, jpg(), 'A photograph for the site');
    expect(await getPublicDocument(photo.id)).toBeNull();
  });
  it('accepts only library or supplied photos as image references', async () => {
    const d = await saveMedia(P, jpg(), 'A photograph for the site');
    expect(await checkImageRef('')).toBeNull();
    expect(await checkImageRef('tank-blue')).toBe('tank-blue');
    expect(await checkImageRef(`media:${d.id}`)).toBe(`media:${d.id}`);
    expect((await fail(checkImageRef('media:does-not-exist')))?.message).toMatch(/Choose a photo/);
    expect((await fail(checkImageRef('../../etc/passwd')))?.message).toMatch(/Choose a photo/);
    expect((await fail(checkImageRef('some-other-key')))?.message).toMatch(/Choose a photo/); // a photo key from another project is not a St. Chris photo
  });
  it('shows where a photo is used and refuses to delete it while it is', async () => {
    const d = await saveMedia(P, jpg(), 'A photograph for the site');
    await saveCategory(P, null, { name: 'Test category', summary: 'A category for the test.', imageKey: `media:${d.id}` });
    expect(await mediaUsage(d.id)).toEqual(['Category: Test category']);
    expect((await fail(deleteMedia(P, d.id)))?.message).toMatch(/in use/);
    await db.category.deleteMany();
    await deleteMedia(P, d.id);
    expect(await getPublicMedia(d.id)).toBeNull();
  });
  it('lets a request type use a library photo, and keeps the old photo when the form does not send one', async () => {
    const d = await saveMedia(P, jpg(), 'A photograph for the site');
    const svc = await makeService();
    const base = { name: 'Bulk Supply', pillar: 'Storage', summary: 'Bulk supply of building materials.', description: 'Description of the service.' };
    await saveService(P, svc.id, { ...base, imageKey: `media:${d.id}` });
    expect((await db.service.findUnique({ where: { id: svc.id } }))?.imageKey).toBe(`media:${d.id}`);
    await saveService(P, svc.id, { ...base }); // no imageKey sent
    expect((await db.service.findUnique({ where: { id: svc.id } }))?.imageKey).toBe(`media:${d.id}`);
    await saveService(P, svc.id, { ...base, imageKey: '' });
    expect((await db.service.findUnique({ where: { id: svc.id } }))?.imageKey).toBeNull();
    expect((await fail(saveService(P, svc.id, { ...base, imageKey: 'media:nope' })))?.message).toMatch(/Choose a photo/);
  });
});

describe('company pages', () => {
  it('shows the draft copy until staff edit it, and a reset brings it back', async () => {
    const before = await getSectionContent('about');
    expect(before?.customised).toBe(false);
    expect(before?.body).toContain('St. Chris Global Limited');
    await saveSectionContent(P, 'about', { intro: 'A short introduction.', body: '## Hello\n\nEdited text.' });
    const after = await getSectionContent('about');
    expect(after?.customised).toBe(true);
    expect(after?.html).toContain('Edited text.');
    await resetSectionContent(P, 'about');
    expect((await getSectionContent('about'))?.customised).toBe(false);
  });
  it('does not know pages that are not defined, and keeps editing to content managers', async () => {
    expect(await getSectionContent('careers')).toBeNull();
    expect((await fail(saveSectionContent(sales, 'about', { intro: 'x', body: 'y' })))?.code).toBe('FORBIDDEN');
    expect((await fail(saveSectionContent(P, 'nope', { intro: 'x', body: 'y' })))?.message).toMatch(/Unknown page/);
  });
  it('lists downloads only on pages that allow them', async () => {
    expect((await fail(addSectionDocument(P, 'about', pdf(), 'Brochure')))?.message).toMatch(/does not list documents/);
  });
});

describe('key figures', () => {
  const f = (id: string, over: Partial<{ value: string; home: boolean; order: number; verified: boolean }> = {}) => ({ id, label: id, value: over.value ?? '1', verified: over.verified ?? true, home: over.home, order: over.order });
  it('falls back to the default figures until staff choose', () => {
    const facts = [f('history-since'), f('other')];
    expect(selectHomeFigures(facts).map((x) => x.id)).toEqual(LEGACY_HOME_IDS);
  });
  it('shows exactly what staff chose, in their order, never an empty value, and at most six', () => {
    const facts = [f('a', { home: true, order: 3 }), f('b', { home: true, order: 1 }), f('c', { home: false }), f('d', { home: true, value: '  ' }), ...['e', 'f', 'g', 'h', 'i'].map((id, i) => f(id, { home: true, order: 10 + i }))];
    const ids = selectHomeFigures(facts).map((x) => x.id);
    expect(ids).toEqual(['b', 'a', 'e', 'f', 'g', 'h']);
  });
});
