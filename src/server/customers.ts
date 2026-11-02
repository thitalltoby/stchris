import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { db } from './db';
import { audit } from './audit';
import { conflict, invalid, notFound } from './errors';
import { assertCan, staffRequestScope, type Principal } from './rbac';
import { emailSchema } from '@/lib/validation';

const companySchema = z.object({
  name: z.string().trim().min(2, 'Enter the company name.').max(160),
  industry: z.string().trim().max(120).optional().default(''),
  website: z.string().trim().max(200).optional().default(''),
  address: z.string().trim().max(400).optional().default(''),
  notes: z.string().trim().max(4000).optional().default(''),
  ownerId: z.string().optional().default(''),
});

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(120),
  email: emailSchema,
  phone: z.string().trim().max(40).optional().default(''),
  jobTitle: z.string().trim().max(120).optional().default(''),
});

function fieldErrors(e: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const i of e.issues) fields[i.path.join('.')] = i.message;
  return invalid('Please check the highlighted fields.', fields);
}

export async function listCompanies(user: Principal, f: { q?: string; page?: number; ownerId?: string }) {
  assertCan(user, 'customer.view');
  const where: Prisma.CompanyWhereInput = {
    AND: [
      f.q?.trim() ? { OR: [{ name: { contains: f.q.trim(), mode: 'insensitive' } }, { contacts: { some: { OR: [{ email: { contains: f.q.trim(), mode: 'insensitive' } }, { name: { contains: f.q.trim(), mode: 'insensitive' } }] } } }] } : {},
      f.ownerId ? { ownerId: f.ownerId === 'none' ? null : f.ownerId } : {},
    ],
  };
  const pageSize = 20;
  const page = Math.max(f.page ?? 1, 1);
  const [total, items] = await Promise.all([
    db.company.count({ where }),
    db.company.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { owner: { select: { name: true } }, _count: { select: { requests: true, contacts: true, quotations: true } } },
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function getCompany(user: Principal, id: string) {
  assertCan(user, 'customer.view');
  const c = await db.company.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      contacts: { orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, emailVerifiedAt: true, lastLoginAt: true } } } },
      memberships: { include: { user: { select: { name: true, email: true } } } },
      requests: { where: staffRequestScope(user), orderBy: { submittedAt: 'desc' }, take: 50, include: { service: { select: { name: true } } } },
      quotations: { orderBy: { createdAt: 'desc' }, take: 30, include: { request: { select: { reference: true } }, revisions: { orderBy: { version: 'desc' }, take: 1 } } },
      tasks: { where: { status: 'OPEN' }, orderBy: { dueAt: 'asc' } },
      communications: { orderBy: { occurredAt: 'desc' }, take: 50 },
      documents: { orderBy: { createdAt: 'desc' }, take: 30 },
    },
  });
  if (!c) throw notFound('Customer not found.');
  return c;
}

export async function saveCompany(user: Principal, id: string | null, raw: unknown) {
  assertCan(user, 'customer.edit');
  const p = companySchema.safeParse(raw);
  if (!p.success) throw fieldErrors(p.error);
  const d = p.data;
  const data = { name: d.name, industry: d.industry || null, website: d.website || null, address: d.address || null, notes: d.notes || null, ownerId: d.ownerId || null };
  if (d.ownerId) {
    const o = await db.user.findFirst({ where: { id: d.ownerId, isActive: true, role: { not: 'CUSTOMER' } } });
    if (!o) throw invalid('Choose an active team member as relationship owner.');
  }
  const c = id ? await db.company.update({ where: { id }, data }) : await db.company.create({ data });
  await audit({ id: user.id, label: user.name }, id ? 'company.updated' : 'company.created', 'Company', c.id);
  return c;
}

export async function saveContact(user: Principal, companyId: string, contactId: string | null, raw: unknown) {
  assertCan(user, 'customer.edit');
  const p = contactSchema.safeParse(raw);
  if (!p.success) throw fieldErrors(p.error);
  const d = p.data;
  const dup = await db.contact.findFirst({ where: { email: d.email, companyId, NOT: contactId ? { id: contactId } : undefined } });
  if (dup) throw conflict('A contact with that email already exists for this company.');
  const data = { name: d.name, email: d.email, phone: d.phone || null, jobTitle: d.jobTitle || null, companyId };
  const c = contactId ? await db.contact.update({ where: { id: contactId }, data }) : await db.contact.create({ data });
  await audit({ id: user.id, label: user.name }, contactId ? 'contact.updated' : 'contact.created', 'Contact', c.id);
  return c;
}

export async function addCompanyNote(user: Principal, companyId: string, body: string, type: 'NOTE' | 'CALL' | 'MEETING' = 'NOTE') {
  assertCan(user, 'customer.edit');
  const text = body.trim();
  if (!text) throw invalid('Write something first.', { body: 'This cannot be empty.' });
  await db.communication.create({ data: { type, direction: 'INTERNAL', body: text.slice(0, 8000), companyId, authorId: user.id, authorLabel: user.name } });
}

export async function listStaff() {
  return db.user.findMany({ where: { isActive: true, role: { not: 'CUSTOMER' } }, orderBy: { name: 'asc' }, select: { id: true, name: true, role: true } });
}
