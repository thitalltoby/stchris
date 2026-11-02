import { listPublished } from '@/server/journal';
import { env } from '@/server/env';

export const dynamic = 'force-dynamic';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** RSS feed of the latest published articles. */
export async function GET() {
  const { items } = await listPublished({ take: 30 });
  const base = env.APP_URL;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>St. Chris Global: the journal</title><link>${base}/journal</link><description>Articles by Chris Iyoha and St. Chris Global.</description>${items.map((a) => `<item><title>${esc(a.title)}</title><link>${base}/journal/${a.slug}</link><guid>${base}/journal/${a.slug}</guid><pubDate>${(a.publishedAt ?? a.createdAt).toUTCString()}</pubDate><description>${esc(a.excerpt)}</description></item>`).join('')}</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
