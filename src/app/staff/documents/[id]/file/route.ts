import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/session';
import { isInternal } from '@/lib/permissions';
import { getStaffDocumentFile } from '@/server/staff-portal';

export const dynamic = 'force-dynamic';

/** Approved staff documents: signed-in staff only, scan-clean files only, never cached by shared caches. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !isInternal(user.role)) return new NextResponse('Not found', { status: 404 });
  const r = await getStaffDocumentFile(user, (await params).id);
  if (!r) return new NextResponse('Not found', { status: 404 });
  const name = r.doc.originalName.replace(/[^\w.\- ()]/g, '_');
  return new NextResponse(new Uint8Array(r.data), {
    headers: { 'Content-Type': r.doc.mimeType, 'Content-Length': String(r.data.length), 'Content-Disposition': `attachment; filename="${name}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' },
  });
}
