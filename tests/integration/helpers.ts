import bcrypt from 'bcryptjs';
import { db } from '@/server/db';
import type { Role } from '@/generated/prisma/enums';

/** Empty every table in the dedicated test database. Refuses to run against anything that is not the test database. */
export async function resetDb() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/stchris_test/.test(url)) throw new Error(`Refusing to reset a database that is not the test database: ${url.replace(/:[^@]*@/, ':***@')}`);
  const rows = await db.$queryRawUnsafe<{ tablename: string }[]>(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '\\_prisma%'`);
  if (rows.length) await db.$executeRawUnsafe(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

let n = 0;
export const PASSWORD = 'Test-Password-2026';
let hash: string | undefined;

export async function makeUser(role: Role, over: Partial<{ email: string; name: string; verified: boolean; approvalLimit: string; isActive: boolean }> = {}) {
  hash ??= await bcrypt.hash(PASSWORD, 4);
  n++;
  return db.user.create({
    data: {
      email: over.email ?? `${role.toLowerCase()}.${n}@example.test`,
      name: over.name ?? `${role} ${n}`,
      passwordHash: hash,
      role,
      emailVerifiedAt: over.verified === false ? null : new Date(),
      approvalLimit: over.approvalLimit,
      isActive: over.isActive ?? true,
    },
  });
}

export const principal = (u: { id: string; name: string; email: string; role: Role }) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

export async function makeService() {
  return db.service.create({
    data: {
      slug: 'bulk-supply',
      name: 'Bulk Supply',
      pillar: 'Storage',
      summary: 'Bulk supply of building materials.',
      description: 'Description',
      fields: {
        create: [
          { key: 'capacity', label: 'Capacity required', type: 'NUMBER', required: true, unit: 'tonnes', sortOrder: 1 },
          { key: 'product', label: 'Product', type: 'TEXT', required: true, sortOrder: 2 },
          { key: 'duration', label: 'Duration', type: 'SELECT', required: false, options: ['Short', 'Long'], sortOrder: 3 },
        ],
      },
    },
  });
}

let k = 0;
export const submission = (serviceId: string, over: Record<string, unknown> = {}) => ({
  serviceId,
  details: { capacity: '15000', product: 'Crude oil' },
  recurrence: 'ONE_OFF',
  customer: { name: 'Ada Okafor', email: 'ada@example.test', phone: '+234 800 000 0001', companyName: 'Ada Energy Ltd' },
  idempotencyKey: `idem-${Date.now()}-${++k}-abcdef`,
  consent: true,
  ...over,
});

export const pdfFile = (name = 'spec.pdf') => new File([Buffer.from('%PDF-1.4\n%%EOF\n')], name, { type: 'application/pdf' });
