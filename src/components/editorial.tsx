import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Photo } from './Photo';
import { fmtDate } from '@/lib/format';

/** Wrap anything that should ease in on scroll. */
export const R = ({ children, delay, className = '' }: { children: ReactNode; delay?: number; className?: string }) => (
  <div data-reveal={delay ?? ''} className={className}>{children}</div>
);

export const Marker = ({ n, label }: { n?: string; label: string }) => (
  <p className="marker">{n && <b>{n}</b>}<span>{label}</span></p>
);

/** Page opening: marker, large serif headline, lead paragraph and an optional photograph. `title` may contain <em> for the italic emphasis. */
export function PageHead({ marker, n, title, lead, photo, photoCaption, dark = false, children }: { marker: string; n?: string; title: ReactNode; lead?: ReactNode; photo?: string; photoCaption?: string; dark?: boolean; children?: ReactNode }) {
  return (
    <section className={dark ? 'bg-umber on-dark' : 'bg-ivory'}>
      <div className="container-x pt-14 md:pt-24 pb-12 md:pb-20">
        <div className="rise"><Marker n={n} label={marker} /></div>
        <div className={photo ? 'hero-grid mt-8 md:mt-12' : 'mt-8 md:mt-12'}>
          <div>
            <h1 className="rise max-w-5xl" style={{ ['--rise-delay' as string]: '80ms' }}>{title}</h1>
            {lead && <div className="rise lead-serif mt-8 md:mt-10 [&_p+p]:mt-4" style={{ ['--rise-delay' as string]: '180ms' }}>{lead}</div>}
            {children && <div className="rise mt-8 flex flex-wrap gap-3" style={{ ['--rise-delay' as string]: '260ms' }}>{children}</div>}
          </div>
          {photo && (
            <figure className="settle lg:mb-5">
              <div className="frame-offset"><Photo name={photo} className="aspect-[4/5]" sizes="(min-width: 1024px) 38vw, 100vw" priority /></div>
              {photoCaption && <figcaption className="caption">{photoCaption}</figcaption>}
            </figure>
          )}
        </div>
      </div>
    </section>
  );
}

/** Content band with a numbered marker and an optional serif heading. */
export function Band({ n, marker, title, intro, tone = 'white', children, id }: { n?: string; marker: string; title?: ReactNode; intro?: ReactNode; tone?: 'white' | 'ivory' | 'sand' | 'dark'; children: ReactNode; id?: string }) {
  const cls = { white: 'bg-white', ivory: 'bg-ivory', sand: 'bg-sand', dark: 'bg-umber on-dark' }[tone];
  return (
    <section id={id} className={`${cls} section`}>
      <div className="container-x">
        <R><Marker n={n} label={marker} /></R>
        {(title || intro) && (
          <div className="mt-8 md:mt-12 mb-12 md:mb-16 grid gap-6 lg:grid-cols-12 lg:gap-x-16 lg:items-end">
            {title && <R className="lg:col-span-7"><h2>{title}</h2></R>}
            {intro && <R delay={120} className="lg:col-span-5 text-[1.075rem] leading-relaxed opacity-90">{intro}</R>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

export interface ArticleCardData { slug: string; title: string; excerpt: string; featuredImageKey: string | null; featuredImageAlt?: string | null; publishedAt: Date | null; readingMinutes: number; category: { name: string; slug: string } }

export function ArticleCard({ a, large = false }: { a: ArticleCardData; large?: boolean }) {
  return (
    <Link href={`/journal/${a.slug}`} className="ed-card group block">
      {a.featuredImageKey && <Photo name={a.featuredImageKey} alt={a.featuredImageAlt ?? undefined} className={large ? 'aspect-[16/10]' : 'aspect-[4/3]'} sizes={large ? '(min-width: 1024px) 60vw, 100vw' : '(min-width: 1024px) 30vw, 100vw'} />}
      <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 marker !text-[.72rem]"><span>{a.category.name}</span></p>
      <h3 className={`mt-3 ${large ? '!text-[clamp(1.8rem,3.4vw,2.7rem)]' : ''}`}>{a.title}</h3>
      <p className="mt-3 text-steel max-w-xl">{a.excerpt}</p>
      <p className="mt-3 mono text-xs text-steel">{fmtDate(a.publishedAt)} · {a.readingMinutes} min read</p>
    </Link>
  );
}

/** Calls to action on a division, an opportunity or the profile. */
export function Enquire({ href, label, secondary }: { href: string; label: string; secondary?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap gap-3">
      <Link href={href} className="btn btn-primary">{label} <Icon name="arrow" size={18} /></Link>
      {secondary && <Link href={secondary.href} className="btn btn-outline">{secondary.label}</Link>}
    </div>
  );
}

export function SocialLinks({ links, className = '' }: { links: { linkedin?: string; x?: string; instagram?: string; facebook?: string }; className?: string }) {
  const items = [['linkedin', 'LinkedIn', links.linkedin], ['xsocial', 'X', links.x], ['instagram', 'Instagram', links.instagram], ['facebook', 'Facebook', links.facebook]].filter((i): i is [string, string, string] => !!i[2]);
  if (!items.length) return null;
  return (
    <ul className={`flex gap-2 ${className}`} aria-label="Social profiles">
      {items.map(([icon, label, href]) => (
        <li key={label}><a href={href} rel="noopener noreferrer" className="inline-grid place-items-center w-11 h-11 border border-current/30 hover:border-current" aria-label={`${label} (opens a new site)`}><Icon name={icon} size={20} /></a></li>
      ))}
    </ul>
  );
}
