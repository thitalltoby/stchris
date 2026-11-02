import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { Role } from '@/generated/prisma/enums';
import { db } from './db';
import { env } from './env';
import { randomToken, sha256 } from './crypto';
import { isInternal } from '@/lib/permissions';
import { clientIp } from './rate-limit';

export const SESSION_COOKIE = 'stchris_session';
const STAFF_TTL_MS = 12 * 60 * 60 * 1000;
const CUSTOMER_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  mfaEnabled: boolean;
}

export async function createSession(user: { id: string; role: Role }, userAgent?: string | null) {
  const token = randomToken(32);
  const ttl = isInternal(user.role) ? STAFF_TTL_MS : CUSTOMER_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);
  await db.session.create({
    data: { tokenHash: sha256(token), userId: user.id, expiresAt, ip: await clientIp(), userAgent: userAgent?.slice(0, 200) ?? null },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.APP_URL.startsWith('https://'),
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Resolve the signed-in user for this request (cached per request). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.isActive) return null;
  if (Date.now() - s.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return { id: s.user.id, email: s.user.email, name: s.user.name, role: s.user.role, emailVerified: !!s.user.emailVerifiedAt, mfaEnabled: !!s.user.mfaEnabledAt };
});

export async function revokeUserSessions(userId: string, exceptTokenHash?: string) {
  await db.session.deleteMany({ where: { userId, ...(exceptTokenHash ? { NOT: { tokenHash: exceptTokenHash } } : {}) } });
}
