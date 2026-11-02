import 'server-only';
import { z } from 'zod';
import type { Role } from '@/generated/prisma/enums';
import { db } from './db';
import { env } from './env';
import { audit } from './audit';
import { conflict, forbidden, invalid, notFound } from './errors';
import { assertCan, type Principal } from './rbac';
import { hashPassword, normaliseEmail } from './auth';
import { randomToken, sha256 } from './crypto';
import { enqueueEmail } from './notify';
import { emailTemplate } from './email-templates';
import { revokeUserSessions } from './session';
import { ROLE_LABELS, STAFF_ROLES } from '@/lib/permissions';
import { emailSchema } from '@/lib/validation';

const staffSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(120),
  email: emailSchema,
  role: z.enum(['SUPER_ADMIN', 'OPS_ADMIN', 'OPS_STAFF', 'COMMERCIAL', 'APPROVER']),
  approvalLimit: z.string().trim().optional().default(''),
});

export async function listUsers(user: Principal, f: { q?: string; role?: string }) {
  assertCan(user, 'user.manage');
  return db.user.findMany({
    where: {
      ...(f.role ? { role: f.role as Role } : {}),
      ...(f.q?.trim() ? { OR: [{ name: { contains: f.q.trim(), mode: 'insensitive' } }, { email: { contains: f.q.trim(), mode: 'insensitive' } }] } : {}),
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    take: 200,
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, emailVerifiedAt: true, approvalLimit: true, createdAt: true, mfaEnabledAt: true },
  });
}

export async function createStaffUser(actor: Principal, raw: unknown) {
  assertCan(actor, 'user.manage');
  const p = staffSchema.safeParse(raw);
  if (!p.success) throw invalid('Please check the highlighted fields.', Object.fromEntries(p.error.issues.map((i) => [i.path.join('.'), i.message])));
  const d = p.data;
  const email = normaliseEmail(d.email);
  if (await db.user.findUnique({ where: { email } })) throw conflict('A user with that email already exists.');
  const limit = d.approvalLimit ? Number(d.approvalLimit.replace(/,/g, '')) : null;
  if (d.approvalLimit && (!Number.isFinite(limit) || limit! < 0)) throw invalid('Approval limit must be a positive number.', { approvalLimit: 'Invalid number.' });
  const u = await db.user.create({
    data: { name: d.name, email, role: d.role as Role, passwordHash: await hashPassword(randomToken(24)), emailVerifiedAt: new Date(), approvalLimit: limit },
  });
  // The person sets their own password through a one-time link
  const token = randomToken(32);
  await db.authToken.create({ data: { userId: u.id, purpose: 'PASSWORD_RESET', tokenHash: sha256(token), expiresAt: new Date(Date.now() + 72 * 3600_000) } });
  await enqueueEmail({
    type: 'auth.staff_invite',
    to: email,
    subject: 'Your St. Chris Materials Desk account',
    ...emailTemplate({
      heading: 'Your account is ready',
      paragraphs: [`Hello ${u.name},`, `${actor.name} created a ${ROLE_LABELS[u.role]} account for you on the St. Chris Materials Desk. Choose your password to get started.`],
      cta: { label: 'Set your password', url: `${env.APP_URL}/admin/reset-password?token=${token}` },
      footnote: 'This link is valid for 72 hours.',
    }),
  });
  await audit({ id: actor.id, label: actor.name }, 'user.created', 'User', u.id, { role: u.role });
  return u;
}

async function superAdminCount(excludeId?: string) {
  return db.user.count({ where: { role: 'SUPER_ADMIN', isActive: true, ...(excludeId ? { NOT: { id: excludeId } } : {}) } });
}

export async function updateUser(actor: Principal, userId: string, patch: { role?: Role; isActive?: boolean; approvalLimit?: string | null; name?: string }) {
  assertCan(actor, 'user.manage');
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) throw notFound('User not found.');
  if (userId === actor.id && ((patch.role !== undefined && patch.role !== target.role) || patch.isActive === false)) throw forbidden('You cannot change your own role or deactivate yourself.');
  if (patch.role && patch.role !== 'CUSTOMER' && patch.role !== 'STAFF_MEMBER' && !STAFF_ROLES.includes(patch.role)) throw invalid('Invalid role.');
  if (target.role === 'SUPER_ADMIN' && ((patch.role && patch.role !== 'SUPER_ADMIN') || patch.isActive === false) && (await superAdminCount(userId)) === 0) {
    throw conflict('There must always be at least one active Super Admin.');
  }
  let limit: number | null | undefined;
  if (patch.approvalLimit !== undefined) {
    limit = patch.approvalLimit ? Number(String(patch.approvalLimit).replace(/,/g, '')) : null;
    if (limit !== null && (!Number.isFinite(limit) || limit < 0)) throw invalid('Approval limit must be a positive number.');
  }
  await db.user.update({
    where: { id: userId },
    data: { ...(patch.role ? { role: patch.role } : {}), ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}), ...(limit !== undefined ? { approvalLimit: limit } : {}), ...(patch.name ? { name: patch.name.trim() } : {}) },
  });
  if (patch.isActive === false || (patch.role && patch.role !== target.role)) await revokeUserSessions(userId);
  await audit({ id: actor.id, label: actor.name }, 'user.updated', 'User', userId, { patch: { ...patch } });
}
