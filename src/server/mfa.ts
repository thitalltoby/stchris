import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { cookies } from 'next/headers';
import { db } from './db';
import { env } from './env';
import { audit } from './audit';
import { decryptJson, encryptJson, randomToken, sha256 } from './crypto';
import { AppError, conflict, forbidden, invalid, notFound } from './errors';
import { clientIp, rateLimit } from './rate-limit';
import { assertCan, type Principal } from './rbac';
import { revokeUserSessions } from './session';
import { getSetting } from './settings';
import { isInternal } from '@/lib/permissions';

// ─── TOTP (RFC 6238, HMAC-SHA1, 6 digits, 30 s) ───────────────────────

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const ISSUER = 'St. Chris Materials Desk';
const STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const totpStep = (atMs = Date.now()) => Math.floor(atMs / 1000 / STEP_SECONDS);

export function totpCode(secretB32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secretB32)).update(counter).digest();
  const off = h[h.length - 1]! & 0x0f;
  const bin = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(bin % 1_000_000).padStart(6, '0');
}

/** Accepts the current step and one either side (clock drift). Returns the matched step, or null. */
export function matchTotp(secretB32: string, codeRaw: string, now = Date.now()): number | null {
  const code = codeRaw.replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return null;
  const cur = totpStep(now);
  for (const step of [cur, cur - 1, cur + 1]) if (totpCode(secretB32, step) === code) return step;
  return null;
}

export const generateSecret = () => base32Encode(randomBytes(20));
export const otpauthUrl = (email: string, secret: string) =>
  `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;

// ─── Recovery codes ───────────────────────────────────────────────────

const normaliseRecovery = (c: string) => c.replace(/[\s-]/g, '').toLowerCase();
function newRecoveryCodes(n = 10): string[] {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: n }, () => {
    const b = randomBytes(10);
    const s = Array.from(b, (x) => alphabet[x % alphabet.length]).join('');
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

// ─── Policy and status ────────────────────────────────────────────────

export async function mfaRequiredFor(role: Parameters<typeof isInternal>[0]): Promise<boolean> {
  if (!isInternal(role)) return false;
  return (await getSetting('security')).requireStaffMfa;
}

export async function getMfaStatus(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, include: { mfaRecoveryCodes: { where: { usedAt: null }, select: { id: true } } } });
  if (!u) throw notFound();
  return { enabled: !!u.mfaEnabledAt, enabledAt: u.mfaEnabledAt, pending: !u.mfaEnabledAt && !!u.mfaSecretEnc, recoveryCodesLeft: u.mfaRecoveryCodes.length };
}

// ─── Enrolment ────────────────────────────────────────────────────────

export async function beginEnrollment(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) throw notFound();
  if (!isInternal(u.role)) throw forbidden();
  if (u.mfaEnabledAt) throw conflict('Two-factor sign-in is already on. Turn it off first to enrol a different device.');
  const secret = generateSecret();
  await db.user.update({ where: { id: userId }, data: { mfaSecretEnc: encryptJson({ secret }) } });
  const url = otpauthUrl(u.email, secret);
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 192, color: { dark: '#1C1D20', light: '#FFFFFF' } });
  return { secret, url, qrSvg };
}

/** Shows the QR code again for an enrolment that was started but not confirmed (e.g. after a page refresh). */
export async function pendingEnrollment(userId: string, email: string) {
  const row = await db.user.findUnique({ where: { id: userId }, select: { mfaSecretEnc: true, mfaEnabledAt: true } });
  const secret = row && !row.mfaEnabledAt ? decryptJson<{ secret: string }>(row.mfaSecretEnc)?.secret : null;
  if (!secret) return null;
  const url = otpauthUrl(email, secret);
  return { secret, url, qrSvg: await QRCode.toString(url, { type: 'svg', margin: 1, width: 192, color: { dark: '#1C1D20', light: '#FFFFFF' } }) };
}

/** Returns the one-time recovery codes. They are never retrievable again. */
export async function confirmEnrollment(userId: string, code: string): Promise<string[]> {
  if (!(await rateLimit(`mfa:enrol:${userId}`, 10, 15 * 60))) throw new AppError('RATE_LIMITED', 'Too many attempts. Please wait a few minutes.');
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) throw notFound();
  if (u.mfaEnabledAt) throw conflict('Two-factor sign-in is already on.');
  const secret = decryptJson<{ secret: string }>(u.mfaSecretEnc)?.secret;
  if (!secret) throw invalid('Start again: scan a new QR code first.');
  const step = matchTotp(secret, code);
  if (step === null) throw invalid('That code is not right. Check the code in your authenticator app and try again.', { code: 'Incorrect or expired code.' });
  const codes = newRecoveryCodes();
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { mfaEnabledAt: new Date(), mfaLastStep: step } });
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.mfaRecoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: sha256(normaliseRecovery(c)) })) });
  });
  await audit({ id: u.id, label: u.name }, 'mfa.enabled', 'User', u.id);
  return codes;
}

export async function regenerateRecoveryCodes(userId: string, code: string): Promise<string[]> {
  await verifySecondFactor(userId, code, { allowRecovery: false });
  const codes = newRecoveryCodes();
  await db.$transaction(async (tx) => {
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.mfaRecoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: sha256(normaliseRecovery(c)) })) });
  });
  await audit({ id: userId, label: 'Staff' }, 'mfa.recovery_regenerated', 'User', userId);
  return codes;
}

export async function disableOwnMfa(userId: string, password: string, code: string) {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || !u.mfaEnabledAt) throw conflict('Two-factor sign-in is not on.');
  if (await mfaRequiredFor(u.role)) throw forbidden('Two-factor sign-in is required for staff, so it cannot be turned off. Ask a Super Admin if you need to move to a new phone.');
  if (!(await bcrypt.compare(password, u.passwordHash))) throw invalid('Your password is incorrect.', { password: 'Incorrect password.' });
  await verifySecondFactor(userId, code, { allowRecovery: true });
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { mfaSecretEnc: null, mfaEnabledAt: null, mfaLastStep: null } }),
    db.mfaRecoveryCode.deleteMany({ where: { userId } }),
  ]);
  await audit({ id: u.id, label: u.name }, 'mfa.disabled', 'User', u.id);
}

/** A Super Admin (user.manage) clears a colleague's second factor, e.g. after a lost phone. Forces a fresh sign-in. */
export async function adminResetMfa(actor: Principal, targetId: string) {
  assertCan(actor, 'user.manage');
  const t = await db.user.findUnique({ where: { id: targetId } });
  if (!t) throw notFound('User not found.');
  await db.$transaction([
    db.user.update({ where: { id: targetId }, data: { mfaSecretEnc: null, mfaEnabledAt: null, mfaLastStep: null } }),
    db.mfaRecoveryCode.deleteMany({ where: { userId: targetId } }),
    db.mfaChallenge.deleteMany({ where: { userId: targetId } }),
  ]);
  await revokeUserSessions(targetId);
  await audit({ id: actor.id, label: actor.name }, 'mfa.reset_by_admin', 'User', targetId);
}

// ─── Verifying a second factor ────────────────────────────────────────

/** Verify a TOTP (single use) or, optionally, a recovery code (single use). Throws a safe error on failure. */
export async function verifySecondFactor(userId: string, input: string, opts: { allowRecovery: boolean }): Promise<'totp' | 'recovery'> {
  if (!(await rateLimit(`mfa:verify:${userId}`, 10, 15 * 60))) throw new AppError('RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.');
  const u = await db.user.findUnique({ where: { id: userId } });
  const secret = u?.mfaEnabledAt ? decryptJson<{ secret: string }>(u.mfaSecretEnc)?.secret : null;
  if (!u || !secret) throw invalid('Two-factor sign-in is not set up for this account.');
  const bad = invalid('That code is not right or has already been used.', { code: 'Incorrect or used code.' });
  const compact = input.replace(/\s/g, '');
  if (/^\d{6}$/.test(compact)) {
    const step = matchTotp(secret, compact);
    if (step === null) throw bad;
    // single use: only a step later than the last accepted one is valid; the conditional update closes the race
    const res = await db.user.updateMany({ where: { id: userId, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] }, data: { mfaLastStep: step } });
    if (res.count !== 1) throw bad;
    return 'totp';
  }
  if (opts.allowRecovery) {
    const hash = sha256(normaliseRecovery(input));
    const res = await db.mfaRecoveryCode.updateMany({ where: { userId, codeHash: hash, usedAt: null }, data: { usedAt: new Date() } });
    if (res.count === 1) {
      await audit({ id: u.id, label: u.name }, 'mfa.recovery_code_used', 'User', u.id);
      return 'recovery';
    }
  }
  throw bad;
}

// ─── Sign-in challenge (password accepted, second factor pending) ──────

export const MFA_COOKIE = 'stchris_mfa';
const CHALLENGE_MINUTES = 5;
const MAX_CHALLENGE_ATTEMPTS = 5;

export async function startChallenge(userId: string, next: string | null) {
  const token = randomToken(32);
  await db.mfaChallenge.deleteMany({ where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] } });
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60_000);
  await db.mfaChallenge.create({ data: { tokenHash: sha256(token), userId, next, expiresAt } });
  (await cookies()).set(MFA_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.APP_URL.startsWith('https://'), path: '/admin', expires: expiresAt });
}

export async function currentChallenge() {
  const token = (await cookies()).get(MFA_COOKIE)?.value;
  if (!token) return null;
  const c = await db.mfaChallenge.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!c || c.expiresAt < new Date() || !c.user.isActive) return null;
  return c;
}

/** Complete the sign-in: returns the user to create a session for. */
export async function completeChallenge(code: string): Promise<{ userId: string; role: import('@/generated/prisma/enums').Role; next: string | null }> {
  const ip = await clientIp();
  if (!(await rateLimit(`mfa:ip:${ip}`, 60, 15 * 60))) throw new AppError('RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.');
  const c = await currentChallenge();
  if (!c) throw invalid('Your sign-in expired. Please enter your email and password again.');
  // count the attempt first, so parallel guesses cannot exceed the limit
  const upd = await db.mfaChallenge.updateMany({ where: { id: c.id, attempts: { lt: MAX_CHALLENGE_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
  if (upd.count !== 1) {
    await db.mfaChallenge.deleteMany({ where: { id: c.id } });
    throw invalid('Too many incorrect codes. Please sign in again with your password.');
  }
  try {
    const how = await verifySecondFactor(c.userId, code, { allowRecovery: true });
    await db.mfaChallenge.deleteMany({ where: { id: c.id } });
    (await cookies()).delete({ name: MFA_COOKIE, path: '/admin' });
    await audit({ id: c.userId, label: c.user.name }, 'auth.login_mfa', 'User', c.userId, { method: how }, ip);
    return { userId: c.userId, role: c.user.role, next: c.next };
  } catch (e) {
    await audit({ id: c.userId, label: c.user.name }, 'auth.login_mfa_failed', 'User', c.userId, undefined, ip);
    throw e;
  }
}

export async function cancelChallenge() {
  const jar = await cookies();
  const token = jar.get(MFA_COOKIE)?.value;
  if (token) await db.mfaChallenge.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete({ name: MFA_COOKIE, path: '/admin' });
}
