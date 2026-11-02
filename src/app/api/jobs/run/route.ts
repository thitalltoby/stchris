import { NextResponse } from 'next/server';
import { env } from '@/server/env';
import { tick } from '@/server/handlers';
import { safeEqual } from '@/server/crypto';

export const dynamic = 'force-dynamic';

/** Scheduler entry point. Requires `Authorization: Bearer <CRON_SECRET>`; disabled when CRON_SECRET is empty. */
export async function POST(req: Request) {
  if (!env.CRON_SECRET) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(given, env.CRON_SECRET)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const r = await tick();
  return NextResponse.json(r);
}
