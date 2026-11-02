import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/session';
import { isStaff, can } from '@/lib/permissions';
import { exportCatalogueCsv } from '@/server/catalogue';

export const dynamic = 'force-dynamic';

export async function GET() {
  const u = await getSessionUser();
  if (!u || !isStaff(u.role) || !can(u.role, 'catalogue.manage')) return new NextResponse('Not allowed', { status: 403 });
  const csv = await exportCatalogueCsv(u);
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="stchris-catalogue.csv"', 'Cache-Control': 'no-store' } });
}
