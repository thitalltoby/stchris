import 'server-only';
import type { Metadata } from 'next';
import { getSeo } from './site-content';
import { getSetting } from './settings';

/** An image reference (supplied photo key or media:<id>) as a path on this site. */
export const imagePath = (key: string | null | undefined) => (key ? (key.startsWith('media:') ? `/media/${key.slice(6)}` : `/photos/${key}.jpg`) : null);

export interface PageSeo { title: string; description: string; image?: string | null; type?: 'website' | 'article' | 'profile'; publishedTime?: Date | null; authors?: string[]; tags?: string[]; noindex?: boolean }

/**
 * Metadata for a public page: sensible defaults from the page itself, overridden by anything staff set under
 * SEO in the console. Adds the canonical address, Open Graph and X card tags so shared links look right.
 */
export async function pageMetadata(path: string, d: PageSeo): Promise<Metadata> {
  const [o, seo] = await Promise.all([getSeo(path), getSetting('seo').catch(() => null)]);
  const title = o?.title || d.title;
  const description = o?.description || d.description;
  const image = imagePath(o?.ogImageKey) ?? imagePath(d.image) ?? imagePath(seo?.defaultShareImage);
  const noindex = o?.noindex || d.noindex;
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: noindex ? { index: false, follow: false } : undefined,
    openGraph: { title, description, url: path, type: d.type === 'profile' ? 'profile' : d.type === 'article' ? 'article' : 'website', siteName: 'St. Chris Global Limited', locale: 'en_NG', ...(image ? { images: [{ url: image }] } : {}), ...(d.type === 'article' ? { publishedTime: d.publishedTime?.toISOString(), authors: d.authors, tags: d.tags } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, ...(image ? { images: [image] } : {}) },
  };
}
