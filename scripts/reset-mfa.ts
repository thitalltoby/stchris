/** Clear a staff member's two-factor sign-in (lost phone and no recovery codes). Usage: npm run admin:reset-mfa -- person@company.com */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  const email = (process.argv[2] ?? '').trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run admin:reset-mfa -- person@company.com');
  const u = await db.user.findUnique({ where: { email } });
  if (!u) throw new Error(`No user with email ${email}`);
  await db.$transaction([
    db.user.update({ where: { id: u.id }, data: { mfaSecretEnc: null, mfaEnabledAt: null, mfaLastStep: null } }),
    db.mfaRecoveryCode.deleteMany({ where: { userId: u.id } }),
    db.mfaChallenge.deleteMany({ where: { userId: u.id } }),
    db.session.deleteMany({ where: { userId: u.id } }),
    db.auditEvent.create({ data: { actorLabel: 'Command line', action: 'mfa.reset_by_cli', entityType: 'User', entityId: u.id } }),
  ]);
  console.log(`Two-factor sign-in cleared for ${email}. They can set it up again after signing in.`);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
