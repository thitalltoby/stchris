import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { db } from './db';
import { audit } from './audit';
import { forbidden, invalid, notFound } from './errors';
import { assertCan, type Principal } from './rbac';
import { can, isInternal } from '@/lib/permissions';
import { saveUpload, readStored, deleteStored } from './storage';
import { isServable } from './scan';
import { getSetting } from './settings';

export const STAFF_POST_KINDS: Record<string, string> = { ANNOUNCEMENT: 'Announcement', CIRCULAR: 'Circular', DEPARTMENT: 'Department update', TRAINING: 'Training', OPPORTUNITY: 'Staff opportunity', MANAGEMENT: 'From management' };

const assertInternal = (u: Principal) => { if (!isInternal(u.role)) throw forbidden(); };

// ─── Profiles and directory ────────────────────────────────────────

const profileSchema = z.object({
  jobTitle: z.string().trim().max(80).optional().default(''), department: z.string().trim().max(40).optional().default(''),
  location: z.string().trim().max(80).optional().default(''), phone: z.string().trim().max(40).optional().default(''),
  about: z.string().trim().max(600).optional().default(''), showInDirectory: z.coerce.boolean().default(true),
});

export async function getMyProfile(user: Principal) {
  assertInternal(user);
  return db.staffProfile.findUnique({ where: { userId: user.id } });
}

export async function saveMyProfile(user: Principal, raw: unknown) {
  assertInternal(user);
  const p = profileSchema.safeParse(raw);
  if (!p.success) throw invalid(p.error.issues[0]!.message);
  const depts = await getSetting('departments');
  if (p.data.department && !depts.some((d) => d.key === p.data.department)) throw invalid('Choose a department from the list.', { department: 'Unknown department.' });
  const row = await db.staffProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...p.data }, update: p.data });
  await audit({ id: user.id, label: user.name }, 'staff_profile.updated', 'StaffProfile', user.id);
  return row;
}

/** Colleagues who chose to be listed. Contact details are shown to signed-in staff only. */
export async function listDirectory(user: Principal, q = '') {
  assertInternal(user);
  const where: Prisma.UserWhereInput = { isActive: true, role: { not: 'CUSTOMER' }, OR: [{ staffProfile: { is: null } }, { staffProfile: { is: { showInDirectory: true } } }] };
  const people = await db.user.findMany({ where, select: { id: true, name: true, email: true, role: true, staffProfile: true }, orderBy: { name: 'asc' } });
  const t = q.trim().toLowerCase();
  return t ? people.filter((p) => [p.name, p.staffProfile?.jobTitle, p.staffProfile?.department, p.staffProfile?.location].some((v) => v?.toLowerCase().includes(t))) : people;
}

// ─── Announcements, circulars and updates ──────────────────────────

export async function listPostsFor(user: Principal, opts: { kind?: string } = {}) {
  assertInternal(user);
  const profile = await db.staffProfile.findUnique({ where: { userId: user.id } });
  const seeAll = can(user.role, 'staffportal.manage');
  const where: Prisma.StaffPostWhereInput = { status: 'PUBLISHED', ...(opts.kind ? { kind: opts.kind as never } : {}), ...(seeAll ? {} : { department: { in: ['', profile?.department ?? '__none__'] } }) };
  const posts = await db.staffPost.findMany({ where, orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }], take: 100, include: { author: { select: { name: true } }, reads: { where: { userId: user.id }, select: { readAt: true } } } });
  return posts.map((p) => ({ ...p, read: p.reads.length > 0 }));
}

export async function getPostFor(user: Principal, id: string) {
  assertInternal(user);
  const p = (await listPostsFor(user)).find((x) => x.id === id);
  if (!p) throw notFound('That post is not available.');
  await db.staffPostRead.upsert({ where: { postId_userId: { postId: id, userId: user.id } }, create: { postId: id, userId: user.id }, update: {} });
  return p;
}

export async function unreadCount(user: Principal) {
  return (await listPostsFor(user)).filter((p) => !p.read).length;
}

const postSchema = z.object({
  kind: z.string().refine((k) => k in STAFF_POST_KINDS, 'Choose a type.'),
  title: z.string().trim().min(3, 'Give the post a title.').max(160), body: z.string().trim().min(10, 'Write the message.').max(10000),
  department: z.string().trim().max(40).optional().default(''), pinned: z.coerce.boolean().default(false), publish: z.coerce.boolean().default(false),
});

export async function saveStaffPost(user: Principal, id: string | null, raw: unknown) {
  assertCan(user, 'staffportal.manage');
  const p = postSchema.safeParse(raw);
  if (!p.success) throw invalid(p.error.issues[0]!.message);
  const d = p.data;
  if (d.department && !(await getSetting('departments')).some((x) => x.key === d.department)) throw invalid('Choose a department from the list, or leave it for everyone.', { department: 'Unknown department.' });
  const existing = id ? await db.staffPost.findUnique({ where: { id } }) : null;
  if (id && !existing) throw notFound('Post not found.');
  const data = { kind: d.kind as never, title: d.title, body: d.body, department: d.department, pinned: d.pinned, status: d.publish ? ('PUBLISHED' as const) : ('DRAFT' as const), publishedAt: d.publish ? existing?.publishedAt ?? new Date() : existing?.publishedAt ?? null };
  const row = existing ? await db.staffPost.update({ where: { id: existing.id }, data }) : await db.staffPost.create({ data: { ...data, authorId: user.id } });
  await audit({ id: user.id, label: user.name }, existing ? 'staff_post.updated' : 'staff_post.created', 'StaffPost', row.id, { status: row.status });
  return row;
}
export async function deleteStaffPost(user: Principal, id: string) {
  assertCan(user, 'staffportal.manage');
  await db.staffPost.delete({ where: { id } }).catch(() => { throw notFound('Post not found.'); });
  await audit({ id: user.id, label: user.name }, 'staff_post.deleted', 'StaffPost', id);
}
export const listPostsAdmin = () => db.staffPost.findMany({ orderBy: { updatedAt: 'desc' }, take: 100, include: { author: { select: { name: true } }, _count: { select: { reads: true } } } });

// ─── Approved documents ────────────────────────────────────────────

export async function addStaffDocument(user: Principal, file: File, meta: { title: string; description?: string; category?: string; department?: string }) {
  assertCan(user, 'staffportal.manage');
  if (meta.title.trim().length < 3) throw invalid('Give the document a title.', { title: 'Required.' });
  if (!file || file.size === 0) throw invalid('Choose a file.', { file: 'Required.' });
  const stored = await saveUpload(file);
  try {
    const doc = await db.document.create({ data: { ...stored, visibility: 'INTERNAL', section: 'staff', title: meta.title.trim(), uploadedById: user.id, uploadedByLabel: user.name } });
    const row = await db.staffDocument.create({ data: { title: meta.title.trim(), description: (meta.description ?? '').trim(), category: (meta.category ?? '').trim() || 'General', department: meta.department ?? '', documentId: doc.id, uploadedById: user.id } });
    await audit({ id: user.id, label: user.name }, 'staff_document.added', 'StaffDocument', row.id, { title: row.title });
    return row;
  } catch (e) { await deleteStored(stored.storageKey).catch(() => undefined); throw e; }
}

export async function listStaffDocuments(user: Principal) {
  assertInternal(user);
  const profile = await db.staffProfile.findUnique({ where: { userId: user.id } });
  const seeAll = can(user.role, 'staffportal.manage');
  const rows = await db.staffDocument.findMany({ where: { visible: true, ...(seeAll ? {} : { department: { in: ['', profile?.department ?? '__none__'] } }) }, orderBy: [{ category: 'asc' }, { title: 'asc' }], include: { document: { select: { originalName: true, sizeBytes: true, mimeType: true, scanStatus: true } } } });
  return seeAll ? rows : rows.filter((r) => isServable(r.document.scanStatus));
}

/** The file behind an approved document, for signed-in staff only, and only once it has passed the scan. */
export async function getStaffDocumentFile(user: Principal, staffDocId: string) {
  assertInternal(user);
  const row = (await listStaffDocuments(user)).find((r) => r.id === staffDocId);
  if (!row || !isServable(row.document.scanStatus)) return null;
  const doc = await db.document.findUnique({ where: { id: row.documentId } });
  if (!doc) return null;
  const data = await readStored(doc.storageKey).catch(() => null);
  return data ? { doc, data } : null;
}

export async function removeStaffDocument(user: Principal, id: string) {
  assertCan(user, 'staffportal.manage');
  const row = await db.staffDocument.findUnique({ where: { id }, include: { document: true } });
  if (!row) throw notFound('Document not found.');
  await db.document.delete({ where: { id: row.documentId } }); // cascades to the staff document row
  await deleteStored(row.document.storageKey).catch(() => undefined);
  await audit({ id: user.id, label: user.name }, 'staff_document.removed', 'StaffDocument', id, { title: row.title });
}
