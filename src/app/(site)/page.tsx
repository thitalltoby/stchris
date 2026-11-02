import Link from 'next/link';
import { Section, RequestCta } from '@/components/blocks';
import { ProductCard } from '@/components/catalogue';
import { Icon } from '@/components/Icon';
import { Photo } from '@/components/Photo';
import { Marker, R, Band, ArticleCard } from '@/components/editorial';
import { getCategoriesByGroup, getFeaturedProducts } from '@/server/catalogue';
import { getFaqs } from '@/server/content';
import { getListView } from '@/server/project-list';
import { getSetting } from '@/server/settings';
import { getDivisions } from '@/server/site-content';
import { listPublished } from '@/server/journal';
import { selectHomeFigures } from '@/lib/figures';

export const dynamic = 'force-dynamic';

const STEPS = [
  { icon: 'list', t: 'Build a list', d: 'Add products and quantities from the catalogue, or describe anything we do not list. It saves as you go.' },
  { icon: 'mail', t: 'Send it for a quote', d: 'Add the project details and send. You get a reference number and an email straight away.' },
  { icon: 'receipt', t: 'Get it in writing', d: 'We confirm availability, brand, price and delivery in a written quotation. Ask for changes any time.' },
  { icon: 'check', t: 'Accept online', d: 'Accept or decline from your account, download the PDF, and reorder from past requests later.' },
];

const PATHS = [
  { n: '01', t: 'Buy', d: 'Quotations, bulk and project supply, corporate procurement and trade accounts.', href: '/opportunities#buy', cta: 'Ways to buy' },
  { n: '02', t: 'Partner', d: 'Distribution, supplier and manufacturer introductions, investment and strategic collaboration.', href: '/opportunities#partner', cta: 'Propose a partnership' },
  { n: '03', t: 'Connect', d: 'Careers, media and speaking requests, or a plain question to the right department.', href: '/opportunities#connect', cta: 'Get in touch' },
];

export default async function HomePage() {
  const [groups, featured, faqs, list, facts, exec, divisions, latest] = await Promise.all([getCategoriesByGroup(), getFeaturedProducts(3), getFaqs(), getListView(), getSetting('facts'), getSetting('executive'), getDivisions(), listPublished({ take: 3 })]);
  const categories = groups.flatMap((g) => g.categories);
  const figures = selectHomeFigures(facts);
  return (
    <>
      {/* ── Opening ── */}
      <section className="bg-ivory overflow-hidden">
        <div className="container-x pt-12 md:pt-20 pb-16 md:pb-24">
          <div className="rise"><Marker label="St. Chris Global Limited · Nigeria" /></div>
          <div className="hero-grid mt-8 md:mt-12">
            <div>
              <h1 className="display-xl rise" style={{ ['--rise-delay' as string]: '80ms' }}>Building <em>better</em> spaces.</h1>
              <p className="rise lead-serif mt-8 md:mt-10" style={{ ['--rise-delay' as string]: '200ms' }}>Delivering quality. Building materials, bathroom and kitchen solutions, interior finishing, sourcing and distribution, led by {exec.name}.</p>
              <div className="rise mt-9 flex flex-wrap gap-3" style={{ ['--rise-delay' as string]: '300ms' }}>
                <Link href="/catalogue" className="btn btn-dark !min-h-[3.25rem] !px-7 text-base">Open the Materials Desk <Icon name="arrow" size={18} /></Link>
                <Link href="/chris-iyoha" className="btn btn-outline !min-h-[3.25rem] !px-7 text-base">Meet {exec.name}</Link>
              </div>
            </div>
            <figure className="settle max-w-md lg:max-w-none lg:mb-6">
              <div className="frame-offset is-brand"><Photo name={exec.portraitKey || 'chris-portrait'} className="aspect-[4/5]" sizes="(min-width: 1024px) 34vw, 90vw" priority /></div>
              <figcaption className="mt-8">
                <p className="serif text-2xl leading-tight">{exec.name}</p>
                <p className="caption !mt-2 max-w-sm">{exec.headline}</p>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ── Strapline and three ideas ── */}
      <section className="bg-umber on-dark section overflow-hidden">
        <div className="container-x">
          <R><Marker n="01" label="Leadership" /></R>
          <R className="mt-10"><p className="display-xl !text-[clamp(2.4rem,7vw,6.2rem)] max-w-6xl">{exec.strapline.split('. ').map((s, i, a) => (i === a.length - 1 ? <em key={i}>{s}</em> : <span key={i}>{s}. </span>))}</p></R>
          <div className="mt-16 md:mt-24 grid gap-10 md:grid-cols-3">
            {exec.sections.slice(0, 3).map((s, i) => (
              <R key={s.id} delay={i * 120}>
                <div className="border-t border-white/30 pt-6">
                  <h2 className="!text-[1.7rem] !font-normal">{s.title}</h2>
                  <p className="mt-4 text-[#e9e0d2] leading-relaxed">{s.body}</p>
                </div>
              </R>
            ))}
          </div>
          <R className="mt-14"><Link href="/chris-iyoha" className="btn btn-ghost-light">Read the executive profile <Icon name="arrow" size={18} /></Link></R>
        </div>
      </section>

      {/* ── Divisions ── */}
      <Band n="02" marker="Our divisions" tone="white" title={<>Six areas of business, <em>one standard.</em></>} intro="From what goes into the walls to what hangs on them, and the sourcing, importation and partnerships behind it.">
        <ol className="border-t border-line">
          {divisions.map((d, i) => (
            <li key={d.id}>
              <R>
                <Link href={`/divisions/${d.slug}`} className="group row-link !py-8 md:!py-10 md:grid-cols-[4rem_1.2fr_1fr_auto] md:items-center">
                  <span className="mono text-sm text-ember">0{i + 1}</span>
                  <h3 className="serif !text-[clamp(1.5rem,2.6vw,2.2rem)] !font-normal !leading-tight">{d.name}</h3>
                  <p className="text-steel max-w-md">{d.summary}</p>
                  <span className="row-arrow hidden md:block" aria-hidden="true"><Icon name="arrow" size={22} /></span>
                </Link>
              </R>
            </li>
          ))}
        </ol>
      </Band>

      {/* ── The Materials Desk ── */}
      <section className="bg-ivory section">
        <div className="container-x grid gap-14 lg:grid-cols-[1.1fr_1fr] lg:gap-20 items-start">
          <div>
            <R><Marker n="03" label="The Materials Desk" /></R>
            <R className="mt-8"><h2>Build your list. <em>Get a written quote.</em></h2></R>
            <R delay={100}><p className="lead mt-6">For contractors, developers, retailers and homeowners. Add what you need from the catalogue, send it, and we reply in writing.</p></R>
            <R delay={160}>
              <form action="/search" role="search" className="mt-8 flex max-w-xl gap-2">
                <label htmlFor="home-q" className="sr-only">Search the catalogue</label>
                <input id="home-q" name="q" className="input !min-h-[3.25rem] text-base" placeholder="Search the catalogue" />
                <button type="submit" className="btn btn-dark !min-h-[3.25rem] !px-6"><Icon name="search" size={18} />Search</button>
              </form>
              <ul className="mt-5 flex flex-wrap gap-2" aria-label="Popular categories">
                {categories.slice(0, 6).map((c) => <li key={c.id}><Link href={`/catalogue/${c.slug}`} className="chip">{c.name.split(':')[0]!.split(',')[0]}</Link></li>)}
              </ul>
            </R>
          </div>
          <R delay={120}>
            <div className="panel rule-top" aria-labelledby="desk-h">
              <div className="flex items-center justify-between px-5 pt-5">
                <h2 id="desk-h" className="!text-lg flex items-center gap-2"><Icon name="list" size={20} />Your project list</h2>
                <span className="mono text-xs text-steel">{list.count} {list.count === 1 ? 'line' : 'lines'}</span>
              </div>
              {list.count === 0 ? (
                <div className="p-5">
                  <p className="text-steel">Nothing on your list yet. Pick a category and add what you need. You can come back to it later.</p>
                  <Link href="/catalogue" className="btn btn-primary mt-5 w-full">Browse the catalogue <Icon name="arrow" size={18} /></Link>
                </div>
              ) : (
                <div className="p-5">
                  <ul className="divide-y divide-line border-y border-line">
                    {list.lines.slice(0, 5).map((l) => <li key={l.id} className="py-2.5 flex justify-between gap-3 text-[0.95rem]"><span className="min-w-0 truncate">{l.label}</span><span className="mono flex-none text-steel">{l.quantity.toLocaleString('en-GB')} {l.unit}</span></li>)}
                  </ul>
                  {list.count > 5 && <p className="text-sm text-steel mt-2">and {list.count - 5} more</p>}
                  <div className="mt-5 grid gap-2 sm:grid-cols-2"><Link href="/list" className="btn btn-outline">Edit list</Link><Link href="/request?service=materials-quotation" className="btn btn-primary">Get a quotation</Link></div>
                </div>
              )}
              <p className="px-5 pb-5 text-xs text-steel border-t border-line pt-4">A list is not an order. Price and availability are confirmed in your quotation.</p>
            </div>
          </R>
        </div>
        <div className="container-x mt-20">
          <ol className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.t}>
                <R delay={i * 90}>
                  <div className="border-t-2 border-charcoal pt-5">
                    <p className="mono text-sm text-ember">0{i + 1}</p>
                    <span className="mt-3 block text-charcoal"><Icon name={s.icon} size={26} /></span>
                    <h3 className="mt-3">{s.t}</h3>
                    <p className="mt-2 text-steel text-[0.95rem]">{s.d}</p>
                  </div>
                </R>
              </li>
            ))}
          </ol>
          <p className="mt-10"><Link href="/how-it-works" className="link-arrow">Read how quotations work <Icon name="arrow" size={18} /></Link></p>
        </div>
      </section>

      {featured.length > 0 && (
        <Band n="04" marker="Products" title={<>Ready to add <em>to your list.</em></>}>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{featured.map((p) => <li key={p.id}><ProductCard p={p} /></li>)}</ul>
          <p className="mt-8 text-sm text-steel max-w-xl">Product listings grow as we confirm models and sizes with our suppliers. If you need something that is not here, <Link href="/services/source-a-product">we will source it</Link>.</p>
        </Band>
      )}

      {/* ── Journal: appears once something has been published ── */}
      {latest.items.length > 0 && (
        <Band n="05" marker="From the journal" tone="sand" title={<>Ideas on leadership, <em>enterprise and partnership.</em></>} intro={<Link href="/journal" className="link-arrow">All articles <Icon name="arrow" size={18} /></Link>}>
          <div className="grid gap-x-10 gap-y-14 md:grid-cols-3">
            {latest.items.map((a, i) => <R key={a.id} delay={i * 100}><ArticleCard a={a} /></R>)}
          </div>
        </Band>
      )}

      {/* ── Three ways in ── */}
      <Band n={latest.items.length ? '06' : '05'} marker="Opportunities" tone="white" title={<>Three ways to <em>work with us.</em></>}>
        <ul className="grid gap-px bg-line border border-line md:grid-cols-3">
          {PATHS.map((p, i) => (
            <li key={p.n} className="bg-white flex">
              <R delay={i * 100} className="flex w-full">
                <Link href={p.href} className="group ed-card w-full p-8 md:p-10 flex flex-col">
                  <span className="mono text-sm text-ember">{p.n}</span>
                  <h3 className="mt-6 !text-[2.2rem]">{p.t}</h3>
                  <p className="mt-4 text-steel flex-1">{p.d}</p>
                  <span className="mt-8 inline-flex items-center gap-2 font-display font-semibold text-ember">{p.cta} <Icon name="arrow" size={18} /></span>
                </Link>
              </R>
            </li>
          ))}
        </ul>
      </Band>

      <section className="bg-umber on-dark">
        <div className="container-x section grid gap-10 lg:grid-cols-2 items-center">
          <R><Photo name="basins-double" className="aspect-[4/3]" sizes="(min-width: 1024px) 40vw, 100vw" /></R>
          <R delay={120}>
            <p className="eyebrow !text-brand-light mb-4">Affiliated brand</p>
            <h2>Buying for your own home? <em>Visit Sweethome.</em></h2>
            <p className="mt-5 text-white/80 text-lg max-w-xl">Sweethome is our consumer-facing brand for premium bathroom and kitchen products, with its own online storefront. This Materials Desk is built for trade, project and bulk buying.</p>
            <div className="mt-7 flex flex-wrap gap-3"><a href="https://sweethomebathrooms.com" rel="noopener noreferrer" className="btn btn-primary">Shop at Sweethome<span className="sr-only"> (opens a new site)</span> <Icon name="arrow" size={18} /></a><Link href="/sweethome" className="btn btn-ghost-light">About Sweethome</Link></div>
          </R>
        </div>
      </section>

      {figures.length > 0 && (
        <Band marker="St. Chris in figures" tone="ivory">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
            {figures.map((f) => (
              <R key={f.id} className="border-t-2 border-charcoal pt-5 flex flex-col-reverse justify-end"><dt className="mt-3 text-sm text-steel">{f.label}{!f.verified ? ' (per public company records; being confirmed)' : ''}</dt><dd className="stat-num">{f.value}</dd></R>
            ))}
            <R className="border-t-2 border-charcoal pt-5 flex flex-col-reverse justify-end"><dt className="mt-3 text-sm text-steel">product categories</dt><dd className="stat-num">{categories.length}</dd></R>
          </dl>
        </Band>
      )}

      {faqs.length > 0 && (
        <Section tone="tint" eyebrow="FAQ" title="Common questions">
          <div className="max-w-3xl divide-y divide-line border-y border-line">
            {faqs.map((f) => (
              <details key={f.id} className="group py-4">
                <summary className="cursor-pointer list-none flex justify-between gap-4 font-display font-semibold text-lg">{f.question}<span className="text-ember group-open:rotate-45 transition-transform"><Icon name="plus" /></span></summary>
                <p className="mt-3 text-steel max-w-2xl">{f.answer}</p>
              </details>
            ))}
          </div>
        </Section>
      )}
      <RequestCta />
    </>
  );
}
