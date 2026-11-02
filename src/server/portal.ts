import 'server-only';
import { db } from './db';
import { audit } from './audit';
import { conflict, forbidden, invalid } from './errors';
import { env } from './env';
import { randomToken, sha256 } from './crypto';
import { enqueueEmail } from './notify';
import { emailTemplate } from './email-templates';
import { emailSchema } from '@/lib/validation';
import { rateLimit } from './rate-limit';
import { AppError } from './errors';
import type { Principal } from './rbac';

export async function getPortalAccount(userId: string) {
  const memberships = await db.companyMembership.findMany({
    where: { userId },
    include: { company: { include: { memberships: { include: { user: { select: { name: true, email: true } } } }, invites: { where: { acceptedAt: null, expiresAt: { gt: new Date() } } } } } },
    orderBy: { createdAt: 'asc' },
  });
  return memberships;
}

/** A company owner invites a colleague. The invite token is bound to the email address and expires in 7 days. */
export async function inviteColleague(user: Principal, companyId: string, emailRaw: string) {
  const email = emailSchema.safeParse(emailRaw);
  if (!email.success) throw invalid('Enter a valid email address.', { email: 'Enter a valid email address.' });
  const membership = await db.companyMembership.findUnique({ where: { userId_companyId: { userId: user.id, companyId } }, include: { company: true } });
  if (!membership || membership.role !== 'OWNER') throw forbidden('Only the company owner can invite colleagues.');
  if (!(await rateLimit(`invite:${user.id}`, 10, 60 * 60))) throw new AppError('RATE_LIMITED', 'Too many invitations. Please try again later.');
  if (await db.user.findUnique({ where: { email: email.data } })) throw conflict('That person already has an account. Ask them to contact us to be added to your company.');
  const token = randomToken(32);
  await db.$transaction(async (tx) => {
    await tx.companyInvite.updateMany({ where: { companyId, email: email.data, acceptedAt: null }, data: { expiresAt: new Date() } });
    await tx.companyInvite.create({ data: { companyId, email: email.data, tokenHash: sha256(token), invitedById: user.id, expiresAt: new Date(Date.now() + 7 * 86_400_000) } });
    await audit({ id: user.id, label: user.name }, 'company.invite', 'Company', companyId, { email: email.data }, null, tx);
  });
  await enqueueEmail({
    type: 'company.invite',
    to: email.data,
    subject: `${user.name} invited you to the St. Chris Materials Desk`,
    ...emailTemplate({
      heading: 'You have been invited',
      paragraphs: [`${user.name} invited you to follow ${membership.company.name}’s requests and quotations with St. Chris.`],
      cta: { label: 'Create your account', url: `${env.APP_URL}/register?invite=${token}` },
      footnote: 'This invitation is valid for 7 days and only works for this email address.',
    }),
  });
}
