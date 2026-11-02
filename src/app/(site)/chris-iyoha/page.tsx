import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Photo } from '@/components/Photo';
import { PageHead, Band, R, ArticleCard, SocialLinks, Marker } from '@/components/editorial';
import { JsonLd } from '@/components/JsonLd';
import { getSetting } from '@/server/settings';
import { getTimeline } from '@/server/site-content';
import { listPublished } from '@/server/journal';
import { pageMetadata } from '@/server/seo';
import { env } from '@/server/env';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const e = await getSetting('executive');
  return pageMetadata('/chris-iyoha', { title: `${e.name}: executive profile`, description: `${e.name}. ${e.headline}. ${e.strapline}`, image: e.portraitKey, type: 'profile' });
}

export default async function ChrisPage() {
  const [e, career, latest, geepee] = await Promise.all([getSetting('executive'), getTimeline('chris'), listPublished({ take: 3 }), db.article.count({ where: { slug: 'geepee-tanks-partnership', status: 'PUBLISHED' } })]);
  const journey = career.filter((x) => x.kind === 'CAREER');
  const [first, ...rest] = e.name.split(' ');
  return (
    <>
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Person', name: e.name, description: e.headline, image: `${env.APP_URL}/photos/${e.portraitKey || 'chris-portrait'}.jpg`, url: `${env.APP_URL}/chris-iyoha`, worksFor: { '@type': 'Organization', name: 'St. Chris Global Limited' }, sameAs: [e.linkedin, e.x, e.instagram, e.facebook].filter(Boolean) }} />
      <PageHead marker="Executive profile" n="01" title={<>{first} <em>{rest.join(' ')}</em></>} lead={<p>{e.headline}.</p>} photo={e.portraitKey || 'chris-portrait'} photoCaption={`${e.name}, St. Chris Global Limited`}>
        <Link href="/leadership" className="btn btn-dark">Leadership, Career & Opportunities <Icon name="arrow" size={18} /></Link>
        <Link href="/journal" className="btn btn-outline">Read the journal</Link>
        <SocialLinks links={e} className="w-full" />
      </PageHead>

      <section className="bg-umber on-dark section overflow-hidden">
        <div className="container-x">
          <R><p className="display-xl !text-[clamp(2.4rem,7vw,6rem)] max-w-6xl">{e.strapline.split('. ').map((s, i, a) => (i === a.length - 1 ? <em key={i}>{s}</em> : <span key={i}>{s}. </span>))}</p></R>
        </div>
      </section>

      {e.sections.map((s, i) => (
        <Band key={s.id} n={`0${i + 2}`} marker={s.title} tone={i % 2 ? 'ivory' : 'white'}>
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16 items-start">
            <R className="lg:col-span-5"><h2 className="lg:sticky lg:top-28">{s.title}</h2></R>
            <R delay={100} className="lg:col-span-7">
              <p className="lead-serif">{s.body}</p>
              {s.id === 'leadership' && <div className="mt-10 frame-offset max-w-2xl"><Photo name="leadership-meeting" className="aspect-[16/9]" sizes="(min-width: 1024px) 50vw, 100vw" /></div>}
            </R>
          </div>
        </Band>
      ))}

      {e.principles.length > 0 && (
        <Band n="05" marker="Philosophy" tone="sand" title={<>How Chris <em>thinks about it.</em></>}>
          <ul className="grid gap-10 md:grid-cols-2">
            {e.principles.map((p, i) => <li key={p.title}><R delay={i * 80}><div className="border-t-2 border-charcoal pt-5"><h3 className="serif !text-[1.6rem] !font-normal">{p.title}</h3><p className="mt-3 text-steel">{p.body}</p></div></R></li>)}
          </ul>
        </Band>
      )}

      {journey.length > 0 && (
        <Band n="06" marker="Career journey" tone="ivory" title={<>A career, <em>in order.</em></>}>
          <ol className="timeline max-w-3xl">
            {journey.map((x) => (
              <li key={x.id}><R>
                {x.period && <p className="mono text-sm text-ember">{x.period}</p>}
                <h3 className="serif !text-[1.5rem] !font-normal mt-1">{x.title}</h3>
                {x.body && <p className="mt-2 text-steel max-w-xl">{x.body}</p>}
              </R></li>
            ))}
          </ol>
        </Band>
      )}

      <Band n="07" marker="Partnerships and the business" tone="white" title={<>The man, <em>the business.</em></>} intro="Chris leads St. Chris Global, and builds it through long-term partnerships. See what the company does, and how to work with it.">
        <div className="grid gap-px bg-line border border-line md:grid-cols-3">
          {[['/divisions', 'Our divisions', 'Six areas of business, each with its own page and enquiry route.'], ['/opportunities', 'Opportunities', 'Partnerships, distribution, procurement, investment and careers.'], geepee ? ['/partnerships/geepee-tanks', 'The GeePee Tanks partnership', 'A long-running business partnership, told in full.'] : ['/journal', 'The journal', 'Writing on leadership, enterprise and partnership.']].map(([h, t, d]) => (
            <Link key={h} href={h!} className="group ed-card bg-white p-8 md:p-10 flex flex-col"><h3>{t}</h3><p className="mt-3 text-steel flex-1">{d}</p><span className="mt-6 link-arrow !min-h-0">Open <Icon name="arrow" size={18} /></span></Link>
          ))}
        </div>
      </Band>

      {latest.items.length > 0 && (
        <Band n="08" marker="Latest writing" tone="sand" title={<>Recent <em>articles.</em></>}>
          <div className="grid gap-x-10 gap-y-14 md:grid-cols-3">{latest.items.map((a) => <ArticleCard key={a.id} a={a} />)}</div>
        </Band>
      )}

      <section className="bg-umber on-dark section">
        <div className="container-x grid gap-10 lg:grid-cols-[1.4fr_1fr] items-end">
          <R><Marker label="Work with Chris" /><h2 className="mt-8 text-[clamp(2rem,4.8vw,3.8rem)] leading-[1.05] tracking-tight">Start a <em>conversation.</em></h2></R>
          <R delay={120} className="flex flex-wrap gap-3 lg:justify-end">
            <Link href="/request?service=media-speaking" className="btn btn-primary">Media or speaking request</Link>
            <Link href="/request?service=partnership-proposal" className="btn btn-ghost-light">Propose a partnership</Link>
          </R>
        </div>
      </section>
    </>
  );
}
