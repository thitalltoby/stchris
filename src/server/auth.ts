import 'server-only';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { env } from './env';
import { randomToken, sha256 } from './crypto';
import { audit } from './audit';
import { clientIp, rateLimit } from './rate-limit';
import { AppError, invalid } from './errors';
import { enqueueEmail } from './notify';
import { emailTemplate } from './email-templates';
import { isInternal } from '@/lib/permissions';
import type { Role } from '@/generated/prisma/enums';

const BCRYPT_COST = 12;
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;
// A real hash (made once) used to equalise timing when the account does not exist
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash(randomToken(12), BCRYPT_COST));

export const hashPassword = (pw: string) => bcrypt.hash(pw, BCRYPT_COST);

export function checkPasswordPolicy(pw: string): string | null {
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 128) return 'Use at most 128 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Include at least one letter and one number.';
  return null;
}

export const normaliseEmail = (e: string) => e.trim().toLowerCase();

export type LoginResult = { ok: true; userId: string; role: Role; emailVerified: boolean } | { ok: false; error: string };

export async function verifyLogin(emailRaw: string, password: string, scope: 'staff' | 'customer'): Promise<LoginResult> {
  const email = normaliseEmail(emailRaw);
  const ip = await clientIp();
  const generic = 'Email or password is incorrect.';
  if (!(await rateLimit(`login:ip:${ip}`, 40, 15 * 60)) || !(await rateLimit(`login:email:${email}`, 10, 15 * 60))) {
    return { ok: false, error: 'Too many sign-in attempts. Please wait a few minutes and try again.' };
  }
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    await bcrypt.compare(password, await getDummyHash());
    return { ok: false, error: generic };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: 'This account is temporarily locked after repeated failed attempts. Try again later or reset your password.' };
  }
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: failed >= MAX_FAILED ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: failed },
    });
    await audit({ id: user.id, label: user.name }, 'auth.login_failed', 'User', user.id, undefined, ip);
    return { ok: false, error: generic };
  }
  // Staff and customers sign in on separate pages; a wrong-page attempt gets the same generic error
  if ((scope === 'staff') !== isInternal(user.role)) return { ok: false, error: generic };
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await audit({ id: user.id, label: user.name }, 'auth.login', 'User', user.id, undefined, ip);
  return { ok: true, userId: user.id, role: user.role, emailVerified: !!user.emailVerifiedAt };
}

async function issueToken(userId: string, purpose: 'PASSWORD_RESET' | 'EMAIL_VERIFY', ttlMinutes: number): Promise<string> {
  const token = randomToken(32);
  await db.authToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
  await db.authToken.create({ data: { userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMinutes * 60_000) } });
  return token;
}

export async function sendVerificationEmail(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.emailVerifiedAt) return;
  const token = await issueToken(userId, 'EMAIL_VERIFY', 60 * 48);
  const url = `${env.APP_URL}/verify-email?token=${token}`;
  await enqueueEmail({
    type: 'auth.verify_email',
    to: user.email,
    subject: 'Confirm your email address — St. Chris Materials Desk',
    ...emailTemplate({
      heading: 'Confirm your email address',
      paragraphs: [`Hello ${user.name},`, 'Please confirm your email address so you can use the St. Chris Materials Desk customer portal and see your requests.'],
      cta: { label: 'Confirm email address', url },
      footnote: 'This link is valid for 48 hours. If you did not create an account, you can ignore this email.',
    }),
  });
}

export interface RegisterInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
  companyName: string;
  inviteToken?: string;
}

export async function registerCustomer(input: RegisterInput): Promise<{ userId: string }> {
  const email = normaliseEmail(input.email);
  const ip = await clientIp();
  if (!(await rateLimit(`register:ip:${ip}`, 10, 60 * 60))) throw new AppError('RATE_LIMITED', 'Too many sign-up attempts. Please try again later.');
  const policy = checkPasswordPolicy(input.password);
  if (policy) throw invalid(policy, { password: policy });
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    // Do not reveal whether the address is registered: behave as if sign-up succeeded and remind the owner
    await enqueueEmail({
      type: 'auth.already_registered',
      to: email,
      subject: 'You already have a St. Chris Materials Desk account',
      ...emailTemplate({
        heading: 'You already have an account',
        paragraphs: ['Someone (hopefully you) tried to create an account with this email address, but one already exists.'],
        cta: { label: 'Sign in', url: `${env.APP_URL}/login` },
        footnote: 'Forgotten your password? Use “Forgot password” on the sign-in page.',
      }),
    });
    return { userId: existing.id };
  }
  const passwordHash = await hashPassword(input.password);
  const verified = env.AUTH_REQUIRE_EMAIL_VERIFICATION ? null : new Date();
  const invite = input.inviteToken
    ? await db.companyInvite.findUnique({ where: { tokenHash: sha256(input.inviteToken) } })
    : null;
  if (input.inviteToken && (!invite || invite.acceptedAt || invite.expiresAt < new Date() || invite.email !== email)) {
    throw invalid('This invitation is invalid, already used, or has expired.');
  }
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { email, name: input.name.trim(), phone: input.phone?.trim() || null, passwordHash, role: 'CUSTOMER', emailVerifiedAt: verified },
    });
    let companyId: string;
    let role: 'OWNER' | 'MEMBER' = 'OWNER';
    if (invite) {
      companyId = invite.companyId;
      role = 'MEMBER';
      await tx.companyInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    } else {
      companyId = (await tx.company.create({ data: { name: input.companyName.trim() } })).id;
    }
    await tx.companyMembership.create({ data: { userId: u.id, companyId, role } });
    // A contact record in the CRM; linked to guest requests once the email is verified
    const contact = await tx.contact.findFirst({ where: { email, companyId } });
    if (!contact) await tx.contact.create({ data: { name: u.name, email, phone: u.phone, companyId, userId: verified ? u.id : null } });
    if (verified) await tx.contact.updateMany({ where: { email, userId: null }, data: { userId: u.id } });
    return u;
  });
  await audit({ id: user.id, label: user.name }, 'auth.register', 'User', user.id, { invited: !!invite }, ip);
  if (!verified) await sendVerificationEmail(user.id);
  return { userId: user.id };
}

export async function verifyEmailToken(token: string): Promise<boolean> {
  const t = await db.authToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!t || t.purpose !== 'EMAIL_VERIFY' || t.usedAt || t.expiresAt < new Date()) return false;
  await db.$transaction(async (tx) => {
    await tx.authToken.update({ where: { id: t.id }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: t.userId }, data: { emailVerifiedAt: new Date() } });
    await tx.contact.updateMany({ where: { email: t.user.email, userId: null }, data: { userId: t.userId } });
  });
  await audit({ id: t.userId, label: t.user.name }, 'auth.email_verified', 'User', t.userId);
  return true;
}

/** Always resolves the same way so callers cannot learn which addresses have accounts. */
export async function requestPasswordReset(emailRaw: string): Promise<void> {
  const email = normaliseEmail(emailRaw);
  const ip = await clientIp();
  if (!(await rateLimit(`reset:ip:${ip}`, 10, 60 * 60)) || !(await rateLimit(`reset:email:${email}`, 3, 60 * 60))) return;
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return;
  const token = await issueToken(user.id, 'PASSWORD_RESET', 60);
  const path = isInternal(user.role) ? 'admin/reset-password' : 'reset-password';
  await enqueueEmail({
    type: 'auth.password_reset',
    to: user.email,
    subject: 'Reset your password — St. Chris Materials Desk',
    ...emailTemplate({
      heading: 'Reset your password',
      paragraphs: [`Hello ${user.name},`, 'We received a request to reset your password. Use the button below to choose a new one.'],
      cta: { label: 'Choose a new password', url: `${env.APP_URL}/${path}?token=${token}` },
      footnote: 'This link is valid for 1 hour and can be used once. If you did not ask for this, you can ignore this email; your password will not change.',
    }),
  });
  await audit({ id: user.id, label: user.name }, 'auth.reset_requested', 'User', user.id, undefined, ip);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const policy = checkPasswordPolicy(newPassword);
  if (policy) throw invalid(policy, { password: policy });
  const t = await db.authToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!t || t.purpose !== 'PASSWORD_RESET' || t.usedAt || t.expiresAt < new Date()) {
    throw invalid('This reset link is invalid or has expired. Please request a new one.');
  }
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    await tx.authToken.update({ where: { id: t.id }, data: { usedAt: new Date() } });
    await tx.user.update({
      where: { id: t.userId },
      data: { passwordHash, failedLogins: 0, lockedUntil: null, emailVerifiedAt: t.user.emailVerifiedAt ?? new Date() },
    });
    await tx.session.deleteMany({ where: { userId: t.userId } }); // sign out everywhere
  });
  await audit({ id: t.userId, label: t.user.name }, 'auth.password_reset', 'User', t.userId);
}

export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) throw invalid('Your current password is incorrect.', { current: 'Incorrect password.' });
  const policy = checkPasswordPolicy(next);
  if (policy) throw invalid(policy, { next: policy });
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  await audit({ id: user.id, label: user.name }, 'auth.password_changed', 'User', user.id);
}
