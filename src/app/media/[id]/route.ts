import { NextResponse } from 'next/server';
import { getPublicMedia } from '@/server/media';

export const dynamic = 'force-dynamic';

/** Photos from the media library. Only published library images that passed the scan. The id never points at different bytes, so it can be cached for a long time. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getPublicMedia(id);
  if (!r) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(r.data), {
    headers: { 'Content-Type': r.doc.mimeType, 'Content-Length': String(r.data.length), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=86400, immutable', 'Content-Disposition': 'inline' },
  });
}
