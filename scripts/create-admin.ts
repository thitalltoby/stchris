/** Create (or reset) a Super Admin. Usage: npm run admin:create -- you@company.com "Full Name" */
import 'dotenv/config';
import readline from 'node:readline';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import bcrypt from 'bcryptjs';
import { checkPasswordPolicy } from '../src/server/auth';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const ask = (q: string) => new Promise<string>((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a); }); });

async function main() {
  const email = (process.argv[2] ?? (await ask('Email: '))).trim().toLowerCase();
  const name = process.argv.slice(3).join(' ') || (await ask('Full name: '));
  const password = process.env.ADMIN_PASSWORD ?? (await ask('Password (min 12 chars; visible as you type): '));
  const problem = checkPasswordPolicy(password);
  if (problem) throw new Error(problem);
  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.upsert({
    where: { email },
    create: { email, name, role: 'SUPER_ADMIN', passwordHash, emailVerifiedAt: new Date() },
    update: { role: 'SUPER_ADMIN', passwordHash, isActive: true },
  });
  console.log(`Super Admin ready: ${email}`);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
