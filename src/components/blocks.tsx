import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Photo } from './Photo';

/** Inner-page header: white, type-led, with an optional wide photograph beneath. */
export function PageHero({ eyebrow, title, children, photo, compact = false }: { eyebrow?: string; title: string; children?: ReactNode; photo?: string; compact?: boolean }) {
  return (
    <section className="bg-white">
      <div className={compact ? 'container-x pt-10 md:pt-14 pb-8 md:pb-10' : 'container-x pt-14 md:pt-24 pb-10 md:pb-16'}>
        {!compact && <div className="tiers w-12 mb-8" aria-hidden="true"><span /><span /><span /></div>}
        {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
        <h1 className={`max-w-4xl ${compact ? '!text-[clamp(2rem,3.8vw,3rem)]' : ''}`}>{title}</h1>
        {children && <div className={`lead ${compact ? 'mt-4' : 'mt-6 md:mt-8'} [&_p+p]:mt-4`}>{children}</div>}
      </div>
      {photo ? (
        <div className="container-x">
          <Photo name={photo} className="aspect-[16/10] md:aspect-[21/8]" sizes="(min-width: 1280px) 1200px, 100vw" priority />
        </div>
      ) : (
        <div className="container-x"><div className="hairline" /></div>
      )}
    </section>
  );
}

/**
 * Page section. Header sits in a two-column grid on wide screens: heading left, introduction right.
 * 'tint' stays pure white and is separated from its neighbours by a hairline.
 */
export function Section({ eyebrow, title, intro, children, tone = 'plain', id }: { eyebrow?: string; title?: string; intro?: ReactNode; children: ReactNode; tone?: 'plain' | 'tint' | 'dark'; id?: string }) {
  const bg = tone === 'tint' ? 'bg-ivory border-t border-line' : tone === 'dark' ? 'bg-charcoal text-paper' : 'bg-white';
  const dark = tone === 'dark';
  return (
    <section id={id} className={`${bg} section`}>
      <div className="container-x">
        {(eyebrow || title || intro) && (
          <header className="mb-10 md:mb-14 grid gap-4 lg:grid-cols-12 lg:gap-x-12 lg:items-end">
            <div className="lg:col-span-7">
              {eyebrow && <p className={`eyebrow mb-3 ${dark ? '!text-brand-light' : ''}`}>{eyebrow}</p>}
              {title && <h2 className={dark ? '!text-white' : ''}>{title}</h2>}
            </div>
            {intro && <div className={`lg:col-span-5 text-lg leading-relaxed ${dark ? 'text-paper/80' : 'text-[#3b3e44]'}`}>{intro}</div>}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}

/** Closing call to action: ember-on-white would fail contrast, so it is a charcoal band with the brand orange button. */
export function RequestCta({ title = 'Start a project list', text = 'Add what you need from the catalogue, or describe it in your own words. We reply with a written quotation, and you can accept it online.', href = '/list', label = 'Open my project list' }: { title?: string; text?: string; href?: string; label?: string }) {
  return (
    <section className="bg-umber text-white border-t-4 border-brand">
      <div className="container-x section grid gap-8 md:grid-cols-[1fr_auto] items-end">
        <div>
          <h2 className="!text-white max-w-2xl">{title}</h2>
          <p className="mt-4 text-white/85 max-w-xl text-lg">{text}</p>
        </div>
        <Link href={href} className="btn btn-primary !min-h-[3.25rem] !px-7 text-base">{label} <Icon name="arrow" size={18} /></Link>
      </div>
    </section>
  );
}

export const NotBooking = () => (
  <p className="text-sm text-steel border-l-2 border-brand pl-4 max-w-xl">Sending a project list is not an order or a commitment on either side. It asks us for a quotation; nothing is confirmed until you accept one.</p>
);
