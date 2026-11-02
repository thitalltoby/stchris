import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/session';
import { isStaff, can } from '@/lib/permissions';
import { parseRange, requestsCsv } from '@/server/reports';
import { audit } from '@/server/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role) || !can(user.role, 'report.view')) return new NextResponse('Not found', { status: 404 });
  const u = new URL(req.url);
  const range = parseRange(u.searchParams.get('from') ?? undefined, u.searchParams.get('to') ?? undefined);
  const csv = await requestsCsv(user, range);
  await audit({ id: user.id, label: user.name }, 'report.exported', 'Report', null, { from: range.fromStr, to: range.toStr });
  return new NextResponse('﻿' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="stchris-requests-${range.fromStr}_${range.toStr}.csv"`, 'Cache-Control': 'private, no-store' } });
}
