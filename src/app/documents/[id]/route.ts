import { NextResponse } from 'next/server';
import { getPublicDocument } from '@/server/section-pages';

export const dynamic = 'force-dynamic';

/** Published reports. Only documents staff have published to a website page, and only once they pass the scan. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getPublicDocument(id);
  if (!r || !r.data) return new NextResponse('Not found', { status: 404 });
  const name = r.doc.originalName.replace(/[^\w.\- ()]/g, '_');
  return new NextResponse(new Uint8Array(r.data), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(r.data.length), 'Content-Disposition': `inline; filename="${name}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=300' },
  });
}
