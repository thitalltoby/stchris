import 'server-only';
import { z } from 'zod';
import { db } from './db';
import { getSetting } from './settings';
import { audit } from './audit';
import { conflict, invalid, notFound } from './errors';
import { assertCan, type Principal } from './rbac';
import { slugify } from '@/lib/format';
import { checkImageRef } from './media';
import type { FieldType } from '@/generated/prisma/enums';

// ─── Public reads ──────────────────────────────────────────────────

export const getVisibleServices = () => db.service.findMany({ where: { visible: true }, orderBy: { sortOrder: 'asc' } });

export const getServiceBySlug = (slug: string) =>
  db.service.findFirst({ where: { slug, visible: true }, include: { fields: { where: { visible: true }, orderBy: { sortOrder: 'asc' } } } });

export const getRequestableServices = () =>
  db.service.findMany({ where: { visible: true }, orderBy: { sortOrder: 'asc' }, include: { fields: { where: { visible: true }, orderBy: { sortOrder: 'asc' } } } });

export const getFaqs = () => db.faq.findMany({ where: { visible: true }, orderBy: { sortOrder: 'asc' } });

// ─── Services (admin) ──────────────────────────────────────────────

const serviceSchema = z.object({
  name: z.string().trim().min(3, 'Enter a name.').max(120),
  slug: z.string().trim().max(80).optional().default(''),
  pillar: z.string().trim().min(2).max(80),
  department: z.string().trim().max(40).optional(),
  acceptsItems: z.coerce.boolean().default(false),
  summary: z.string().trim().min(10, 'Write a short summary.').max(400),
  description: z.string().trim().min(10, 'Write a description.').max(12000),
  instructions: z.string().trim().max(1500).optional().default(''),
  highlights: z.string().optional().default(''),
  icon: z.string().trim().max(30).optional().default('route'),
  visible: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  imageKey: z.string().optional(),
});

export async function saveService(user: Principal, id: string | null, raw: unknown) {
  assertCan(user, 'service.manage');
  const p = serviceSchema.safeParse(raw);
  if (!p.success) throw invalid('Please check the highlighted fields.', Object.fromEntries(p.error.issues.map((i) => [i.path.join('.'), i.message])));
  const d = p.data;
  const slug = slugify(d.slug || d.name);
  const clash = await db.service.findFirst({ where: { slug, ...(id ? { NOT: { id } } : {}) } });
  if (clash) throw conflict('Another service already uses that web address.');
  const highlights = d.highlights.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 12);
  if (d.department && !(await getSetting('departments')).some((x) => x.key === d.department)) throw invalid('Choose a department from the list.', { department: 'Unknown department.' });
  const data = { ...(d.department ? { department: d.department } : {}), name: d.name, slug, pillar: d.pillar, acceptsItems: d.acceptsItems, summary: d.summary, description: d.description, instructions: d.instructions || null, highlights, icon: d.icon, visible: d.visible, sortOrder: d.sortOrder, needsReview: false, ...(d.imageKey !== undefined ? { imageKey: await checkImageRef(d.imageKey) } : {}) };
  const s = id ? await db.service.update({ where: { id }, data }) : await db.service.create({ data });
  await audit({ id: user.id, label: user.name }, id ? 'service.updated' : 'service.created', 'Service', s.id, { visible: s.visible });
  return s;
}

const fieldSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,40}$/, 'Use lowercase letters, numbers and underscores (e.g. cargo_type).'),
  label: z.string().trim().min(2).max(120),
  type: z.enum(['TEXT', 'TEXTAREA', 'NUMBER', 'SELECT', 'DATE', 'BOOLEAN']),
  required: z.coerce.boolean().default(false),
  options: z.string().optional().default(''),
  unit: z.string().trim().max(24).optional().default(''),
  helpText: z.string().trim().max(300).optional().default(''),
  placeholder: z.string().trim().max(120).optional().default(''),
  section: z.string().trim().max(60).optional().default('Requirement'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  visible: z.coerce.boolean().default(true),
});

export async function saveServiceField(user: Principal, serviceId: string, fieldId: string | null, raw: unknown) {
  assertCan(user, 'service.manage');
  const p = fieldSchema.safeParse(raw);
  if (!p.success) throw invalid('Please check the highlighted fields.', Object.fromEntries(p.error.issues.map((i) => [i.path.join('.'), i.message])));
  const d = p.data;
  const options = d.type === 'SELECT' ? d.options.split('\n').map((s) => s.trim()).filter(Boolean) : null;
  if (d.type === 'SELECT' && (!options || options.length < 2)) throw invalid('A choice field needs at least two options (one per line).', { options: 'Add at least two options.' });
  const clash = await db.serviceField.findFirst({ where: { serviceId, key: d.key, ...(fieldId ? { NOT: { id: fieldId } } : {}) } });
  if (clash) throw conflict('This service already has a field with that key.');
  const data = { key: d.key, label: d.label, type: d.type as FieldType, required: d.required, options: options as any, unit: d.unit || null, helpText: d.helpText || null, placeholder: d.placeholder || null, section: d.section || 'Requirement', sortOrder: d.sortOrder, visible: d.visible };
  const f = fieldId ? await db.serviceField.update({ where: { id: fieldId }, data }) : await db.serviceField.create({ data: { ...data, serviceId } });
  await audit({ id: user.id, label: user.name }, fieldId ? 'service.field_updated' : 'service.field_created', 'Service', serviceId, { key: d.key });
  return f;
}

export async function deleteServiceField(user: Principal, fieldId: string) {
  assertCan(user, 'service.manage');
  const f = await db.serviceField.findUnique({ where: { id: fieldId } });
  if (!f) throw notFound('Field not found.');
  await db.serviceField.delete({ where: { id: fieldId } }); // past requests keep their own label snapshot
  await audit({ id: user.id, label: user.name }, 'service.field_deleted', 'Service', f.serviceId, { key: f.key });
}

// ─── FAQs (admin) ──────────────────────────────────────────────────

export async function saveFaq(user: Principal, id: string | null, raw: { question: string; answer: string; sortOrder?: number; visible?: boolean }) {
  assertCan(user, 'content.manage');
  if (raw.question.trim().length < 5 || raw.answer.trim().length < 5) throw invalid('Write both a question and an answer.');
  const data = { question: raw.question.trim().slice(0, 300), answer: raw.answer.trim().slice(0, 3000), sortOrder: raw.sortOrder ?? 0, visible: raw.visible ?? true };
  const f = id ? await db.faq.update({ where: { id }, data }) : await db.faq.create({ data });
  await audit({ id: user.id, label: user.name }, id ? 'faq.updated' : 'faq.created', 'Faq', f.id);
}

export async function deleteFaq(user: Principal, id: string) {
  assertCan(user, 'content.manage');
  await db.faq.delete({ where: { id } });
  await audit({ id: user.id, label: user.name }, 'faq.deleted', 'Faq', id);
}
