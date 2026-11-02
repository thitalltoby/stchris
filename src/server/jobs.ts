import 'server-only';
import { db } from './db';
import { Prisma } from '@/generated/prisma/client';

export type JobHandler = (payload: any) => Promise<void>;
const handlers = new Map<string, JobHandler>();

export function registerJob(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

export async function enqueueJob(type: string, payload: Record<string, unknown> = {}, opts: { runAt?: Date; dedupeKey?: string; maxAttempts?: number } = {}) {
  try {
    return await db.job.create({
      data: { type, payload: payload as Prisma.InputJsonValue, runAt: opts.runAt ?? new Date(), dedupeKey: opts.dedupeKey, maxAttempts: opts.maxAttempts ?? 5 },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null; // already queued (dedupe)
    throw e;
  }
}

/**
 * Claim the next due job atomically. FOR UPDATE SKIP LOCKED lets several workers run safely.
 * Prisma stores UTC in timestamp-without-time-zone columns, so compare against UTC "now" whatever the server time zone.
 */
async function claim(): Promise<{ id: string; type: string; payload: unknown; attempts: number; maxAttempts: number } | null> {
  const rows = await db.$queryRaw<{ id: string; type: string; payload: unknown; attempts: number; maxAttempts: number }[]>`
    UPDATE "Job" SET "status" = 'RUNNING', "lockedAt" = (NOW() AT TIME ZONE 'UTC'), "attempts" = "attempts" + 1
    WHERE "id" = (
      SELECT "id" FROM "Job"
      WHERE ("status" = 'PENDING' AND "runAt" <= (NOW() AT TIME ZONE 'UTC'))
         OR ("status" = 'RUNNING' AND "lockedAt" < (NOW() AT TIME ZONE 'UTC') - INTERVAL '10 minutes')
      ORDER BY "runAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING "id", "type", "payload", "attempts", "maxAttempts"`;
  return rows[0] ?? null;
}

/** Exponential backoff: 1, 4, 16, 64 minutes... */
const backoffMs = (attempt: number) => Math.min(4 ** (attempt - 1), 360) * 60_000;

export async function runDueJobs(limit = 25): Promise<{ ran: number; failed: number }> {
  let ran = 0;
  let failed = 0;
  for (let i = 0; i < limit; i++) {
    const job = await claim();
    if (!job) break;
    const handler = handlers.get(job.type);
    try {
      if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
      await handler(job.payload);
      await db.job.update({ where: { id: job.id }, data: { status: 'DONE', finishedAt: new Date(), lockedAt: null, lastError: null } });
      ran++;
    } catch (e) {
      failed++;
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      const dead = job.attempts >= job.maxAttempts;
      await db.job.update({
        where: { id: job.id },
        data: dead
          ? { status: 'FAILED', lockedAt: null, lastError: msg, finishedAt: new Date() }
          : { status: 'PENDING', lockedAt: null, lastError: msg, runAt: new Date(Date.now() + backoffMs(job.attempts)) },
      });
    }
  }
  return { ran, failed };
}
