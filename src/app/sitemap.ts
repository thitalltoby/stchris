import type { MetadataRoute } from 'next';
import { env } from '@/server/env';
import { getVisibleServices } from '@/server/content';
import { db } from '@/server/db';
import { SECTION_PAGES } from '@/content/section-pages';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.APP_URL.replace(/\/$/, '');
  const fixed = ['', '/chris-iyoha', '/leadership', '/divisions', '/opportunities', '/journal', '/media-centre', '/catalogue', '/services', '/partnerships/geepee', ...SECTION_PAGES.map((p) => `/${p.path}`), '/contact', '/privacy', '/terms'];
  const [services, categories, products, divisions, articles, jcats, opps, seoOff] = await Promise.all([
    getVisibleServices(),
    db.category.findMany({ where: { visible: true }, select: { slug: true, updatedAt: true } }),
    db.product.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
    db.division.findMany({ where: { visible: true }, select: { slug: true, updatedAt: true } }),
    db.article.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true, kind: true } }),
    db.articleCategory.findMany({ select: { slug: true } }),
    db.opportunity.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
    db.seoEntry.findMany({ where: { noindex: true }, select: { path: true } }),
  ]);
  const hidden = new Set(seoOff.map((x) => x.path));
  const urls: MetadataRoute.Sitemap = [
    ...fixed.map((p) => ({ url: `${base}${p}` })),
    ...divisions.map((d) => ({ url: `${base}/divisions/${d.slug}`, lastModified: d.updatedAt })),
    ...jcats.map((c) => ({ url: `${base}/journal/category/${c.slug}` })),
    ...opps.map((o) => ({ url: `${base}/opportunities/${o.slug}`, lastModified: o.updatedAt })),
    ...articles.map((a) => ({ url: a.slug === 'geepee-tanks-partnership' ? `${base}/partnerships/geepee-tanks` : `${base}/journal/${a.slug}`, lastModified: a.updatedAt })),
    ...services.map((s) => ({ url: `${base}/services/${s.slug}`, lastModified: s.updatedAt })),
    ...categories.map((c) => ({ url: `${base}/catalogue/${c.slug}`, lastModified: c.updatedAt })),
    ...products.map((p) => ({ url: `${base}/products/${p.slug}`, lastModified: p.updatedAt })),
  ];
  return urls.filter((u) => !hidden.has(u.url.replace(base, '') || '/'));
}
