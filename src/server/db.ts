import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { env } from './env';

const g = globalThis as unknown as { prisma?: PrismaClient };

function make(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 10 }) });
}

/** One client per process (dev reloads would otherwise open new pools). */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const client = (g.prisma ??= make());
    const v = (client as any)[prop];
    return typeof v === 'function' ? v.bind(client) : v;
  },
});

export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
