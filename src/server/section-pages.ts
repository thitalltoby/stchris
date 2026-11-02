import 'server-only';
import { db } from './db';
import { audit } from './audit';
import { assertCan, type Principal } from './rbac';
import { invalid, notFound } from './errors';
import { renderMarkdown } from './markdown';
import { saveUpload, deleteStored, readStored } from './storage';
import { isServable } from './scan';
import { checkImageRef } from './media';
import { sectionPageByPath, type SectionPageDef } from '@/content/section-pages';

export interface SectionContent {
  def: SectionPageDef;
  intro: string;
  body: string;
  html: string;
  /** Hero photograph: a supplied key or media:<id>; falls back to the page's built-in photo */
  photo: string | undefined;
  customised: boolean;
}

const key = (path: string) => `page:${path}`;

export async function getSectionContent(path: string): Promise<SectionContent | null> {
  const def = sectionPageByPath(path);
  if (!def) return null;
  const row = await db.siteSetting.findUnique({ where: { key: key(path) } });
  const v = (row?.value ?? {}) as { intro?: string; body?: string; photo?: string };
  const body = v.body?.trim() ? v.body : def.defaultBody;
  return { def, intro: v.intro?.trim() ? v.intro : def.intro, body, html: renderMarkdown(body), photo: v.photo !== undefined ? v.photo || undefined : def.photo, customised: !!row };
}

export async function saveSectionContent(user: Principal, path: string, input: { intro: string; body: string; photo?: string }) {
  assertCan(user, 'content.manage');
  const def = sectionPageByPath(path);
  if (!def) throw notFound('Unknown page.');
  if (input.body.length > 40_000) throw invalid('The page text is too long.', { body: 'Too long.' });
  if (input.intro.length > 400) throw invalid('Keep the introduction under 400 characters.', { intro: 'Too long.' });
  const photo = input.photo === undefined ? undefined : (await checkImageRef(input.photo)) ?? '';
  const value = { intro: input.intro.trim(), body: input.body, ...(photo !== undefined ? { photo } : {}) };
  await db.siteSetting.upsert({ where: { key: key(path) }, create: { key: key(path), value, updatedBy: user.id }, update: { value, updatedBy: user.id } });
  await audit({ id: user.id, label: user.name }, 'section_page.saved', 'Setting', key(path), { path });
}

export async function resetSectionContent(user: Principal, path: string) {
  assertCan(user, 'content.manage');
  await db.siteSetting.deleteMany({ where: { key: key(path) } });
  await audit({ id: user.id, label: user.name }, 'section_page.reset', 'Setting', key(path), { path });
}

// ─── Public documents (reports) ────────────────────────────────────

export async function listSectionDocuments(path: string, opts: { includeHeld?: boolean } = {}) {
  const docs = await db.document.findMany({ where: { visibility: 'PUBLIC', section: path }, orderBy: { createdAt: 'desc' } });
  return opts.includeHeld ? docs : docs.filter((d) => isServable(d.scanStatus));
}

export async function addSectionDocument(user: Principal, path: string, file: File, title: string) {
  assertCan(user, 'content.manage');
  const def = sectionPageByPath(path);
  if (!def?.documents) throw invalid('This page does not list documents.');
  if (title.trim().length < 3) throw invalid('Give the document a title.', { title: 'Required.' });
  if (!/\.pdf$/i.test(file.name)) throw invalid('Published reports must be PDF files.', { file: 'Choose a PDF.' });
  const stored = await saveUpload(file);
  try {
    const d = await db.document.create({ data: { ...stored, visibility: 'PUBLIC', section: path, title: title.trim(), uploadedById: user.id, uploadedByLabel: user.name } });
    await audit({ id: user.id, label: user.name }, 'section_document.added', 'Document', d.id, { path, title: title.trim() });
    return d;
  } catch (e) {
    await deleteStored(stored.storageKey).catch(() => undefined);
    throw e;
  }
}

export async function removeSectionDocument(user: Principal, documentId: string) {
  assertCan(user, 'content.manage');
  const d = await db.document.findFirst({ where: { id: documentId, visibility: 'PUBLIC' } });
  if (!d) throw notFound('Document not found.');
  await db.document.delete({ where: { id: d.id } });
  await deleteStored(d.storageKey).catch(() => undefined);
  await audit({ id: user.id, label: user.name }, 'section_document.removed', 'Document', d.id, { path: d.section, title: d.title });
}

/** Public download: only PUBLIC, scanned-clean documents that belong to a section page. */
export async function getPublicDocument(id: string) {
  const d = await db.document.findFirst({ where: { id, visibility: 'PUBLIC', section: { notIn: ['media'] }, NOT: { section: null } } });
  if (!d || !isServable(d.scanStatus)) return null;
  return { doc: d, data: await readStored(d.storageKey).catch(() => null) };
}
