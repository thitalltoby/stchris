import 'server-only';
import { headers } from 'next/headers';
import { db } from './db';
import { env } from './env';

/** Best-effort client address. Forwarded headers are trusted only when TRUST_PROXY=true. */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    if (env.TRUST_PROXY) {
      const fwd = h.get('x-forwarded-for');
      if (fwd) return fwd.split(',')[0]!.trim().slice(0, 64);
      const real = h.get('x-real-ip');
      if (real) return real.slice(0, 64);
    }
  } catch {
    /* outside a request */
  }
  return 'unknown';
}

/**
 * Fixed-window limiter stored in PostgreSQL so it works across processes and restarts.
 * Returns true when the call is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < NOW() - (${windowSeconds} * INTERVAL '1 second') THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < NOW() - (${windowSeconds} * INTERVAL '1 second') THEN NOW() ELSE "RateLimit"."windowStart" END
    RETURNING "count"`;
  return (rows[0]?.count ?? 1) <= limit;
}
