import Link from 'next/link';
import { Photo } from './Photo';
import { Marker, ArticleCard } from './editorial';
import { Icon } from './Icon';
import { CopyLink } from './CopyLink';
import { JsonLd } from './JsonLd';
import { renderMarkdown } from '@/server/markdown';
import { parseVideoUrl } from '@/lib/journal';
import { fmtDate } from '@/lib/format';
import { env } from '@/server/env';
import { imagePath } from '@/server/seo';

type Related = Parameters<typeof ArticleCard>[0]['a'];
export interface ArticleViewData {
  slug: string; title: string; subtitle: string | null; excerpt: string; body: string; tags: unknown; publishedAt: Date | null; updatedAt: Date; readingMinutes: number;
  featuredImageKey: string | null; featuredImageAlt: string | null; videoUrl: string | null; seoDescription: string | null;
  category: { name: string; slug: string }; author: { name: string };
}

export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const v = parseVideoUrl(url);
  if (!v) return null;
  return (
    <div className="relative aspect-video bg-sand">
      <iframe src={v.embed} title={`Video: ${title}`} loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="absolute inset-0 w-full h-full border-0" />
    </div>
  );
}

/** One article, shared by the public page and the staff preview. */
export function ArticleView({ a, related = [], preview = false, children }: { a: ArticleViewData; related?: Related[]; preview?: boolean; children?: React.ReactNode }) {
  const url = `${env.APP_URL}/journal/${a.slug}`;
  const tags = (Array.isArray(a.tags) ? a.tags : []) as string[];
  const enc = encodeURIComponent(url);
  const img = imagePath(a.featuredImageKey);
  return (
    <article>
      {!preview && <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.seoDescription || a.excerpt, datePublished: a.publishedAt?.toISOString(), dateModified: a.updatedAt.toISOString(), author: { '@type': 'Person', name: a.author.name }, publisher: { '@type': 'Organization', name: 'St. Chris Global Limited' }, mainEntityOfPage: url, ...(img ? { image: `${env.APP_URL}${img}` } : {}) }} />}
      <header className="bg-ivory">
        <div className="container-x pt-12 md:pt-20 pb-10 md:pb-14 max-w-5xl">
          <div className="rise"><Marker label={a.category.name} /></div>
          <h1 className="rise mt-8 !text-[clamp(1.8rem,3.6vw,3rem)]" style={{ ['--rise-delay' as string]: '80ms' }}>{a.title}</h1>
          {a.subtitle && <p className="rise lead-serif mt-6" style={{ ['--rise-delay' as string]: '160ms' }}>{a.subtitle}</p>}
          <p className="rise mt-8 mono text-sm text-steel" style={{ ['--rise-delay' as string]: '220ms' }}>{a.author.name} · {preview && !a.publishedAt ? 'Not yet published' : fmtDate(a.publishedAt)} · {a.readingMinutes} min read</p>
        </div>
        {a.featuredImageKey && <div className="container-x max-w-6xl pb-2"><Photo name={a.featuredImageKey} alt={a.featuredImageAlt ?? undefined} className="aspect-[16/9] settle" sizes="(min-width: 1280px) 1150px, 100vw" priority /></div>}
      </header>
      <div className="bg-white section-tight">
        <div className="container-x">
          {a.videoUrl && <div className="max-w-3xl mb-12"><VideoEmbed url={a.videoUrl} title={a.title} /></div>}
          <div className="prose-ed" dangerouslySetInnerHTML={{ __html: renderMarkdown(a.body) }} />
          {children}
          {tags.length > 0 && <ul className="mt-12 flex flex-wrap gap-2" aria-label="Tags">{tags.map((t) => <li key={t}><Link href={`/journal?tag=${encodeURIComponent(t)}`} className="tag">{t}</Link></li>)}</ul>}
          {!preview && (
            <div className="mt-10 pt-8 border-t border-line max-w-3xl">
              <p className="marker mb-4"><span>Share</span></p>
              <ul className="flex flex-wrap gap-2">
                <li><a className="btn btn-outline btn-sm" rel="noopener noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc}`}><Icon name="linkedin" size={16} />LinkedIn<span className="sr-only"> (opens a new site)</span></a></li>
                <li><a className="btn btn-outline btn-sm" rel="noopener noreferrer" href={`https://x.com/intent/post?url=${enc}&text=${encodeURIComponent(a.title)}`}><Icon name="xsocial" size={16} />X<span className="sr-only"> (opens a new site)</span></a></li>
                <li><a className="btn btn-outline btn-sm" rel="noopener noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${enc}`}><Icon name="facebook" size={16} />Facebook<span className="sr-only"> (opens a new site)</span></a></li>
                <li><a className="btn btn-outline btn-sm" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${a.title} ${url}`)}`}><Icon name="whatsapp" size={16} />WhatsApp<span className="sr-only"> (opens a new site)</span></a></li>
                <li><CopyLink url={url} /></li>
              </ul>
            </div>
          )}
        </div>
      </div>
      {related.length > 0 && (
        <section className="bg-white border-t border-line section-tight">
          <div className="container-x"><Marker label={`More in ${a.category.name}`} /><div className="mt-10 grid gap-x-10 gap-y-12 md:grid-cols-3">{related.map((r) => <ArticleCard key={r.slug} a={r} />)}</div></div>
        </section>
      )}
    </article>
  );
}
