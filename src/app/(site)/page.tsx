import Link from 'next/link';
import { Section, RequestCta } from '@/components/blocks';
import { ProductCard } from '@/components/catalogue';
import { Icon } from '@/components/Icon';
import { Photo } from '@/components/Photo';
import { Marker, R, Band, ArticleCard, PartnerBadge } from '@/components/editorial';
import { getCategoriesByGroup, getFeaturedProducts } from '@/server/catalogue';
import { getFaqs } from '@/server/content';
import { getListView } from '@/server/project-list';
import { getSetting } from '@/server/settings';
import { getDivisions } from '@/server/site-content';
import { listPublished, getJournalCategories } from '@/server/journal';
import { selectHomeFigures } from '@/lib/figures';
import { GEEPEE } from '@/content/geepee';

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


const VALUE = [
  { t: 'Everything in writing', d: 'Price, availability, brand and delivery are confirmed in a written quotation, never assumed. Accept it online and keep the PDF.' },
  { t: 'Sourced when it is not listed', d: 'If a product is not in the catalogue, tell us. Sourcing and importation are part of what St. Chris does.' },
  { t: 'One reference, one team', d: 'Every enquiry gets a reference number and goes to the right department. Follow it from your account.' },
  { t: 'From manufacturer to market', d: 'Importation and structured distribution across wholesale, retail and project channels.' },
];
const WHO = [
  { t: 'Contractors and developers', d: 'Building materials, plumbing and finishing for sites of every size.', photo: 'site-rebar', href: '/services/project-bulk-supply' },
  { t: 'Project and bulk supply', d: 'Quantities, delivery and pricing agreed in writing before work starts.', photo: 'site-framing', href: '/services/project-bulk-supply' },
  { t: 'Corporate and institutional buyers', d: 'Specifications, bills of quantities and tenders welcomed.', photo: 'executive-desk', href: '/services/corporate-procurement' },
  { t: 'Homes and interiors', d: 'Bathrooms, kitchens and finishes, quoted like any other order.', photo: 'bathroom-stone', href: '/services/materials-quotation' },
];

export default async function HomePage() {
  const [groups, featured, faqs, list, facts, exec, divisions, latest, jcats] = await Promise.all([getCategoriesByGroup(), getFeaturedProducts(3), getFaqs(), getListView(), getSetting('facts'), getSetting('executive'), getDivisions(), listPublished({ take: 3 }), getJournalCategories()]);
  const categories = groups.flatMap((g) => g.categories);
  const figures = selectHomeFigures(facts);
  const strap = exec.strapline.split('. ').map((x) => x.replace(/\.$/, ''));
  return (
    <>
      {/* ── Hero: who he is, what the business is, where to go next ── */}
      <section className="bg-white overflow-hidden">
        <div className="container-x pt-14 md:pt-24 pb-20 md:pb-32">
          <div className="rise"><Marker label="St. Chris Global Limited · Nigeria" /></div>
          <div className="mt-12 md:mt-20 grid gap-16 lg:grid-cols-12 lg:gap-12 items-center">
            <div className="lg:col-span-7">
              <h1 className="hero-title rise" style={{ ['--rise-delay' as string]: '80ms' }}>
                {strap[0]}. <span className="block">{strap[1]}.</span> <em className="block">{strap[2]}.</em>
              </h1>
              <p className="rise lead-sans mt-10 md:mt-12" style={{ ['--rise-delay' as string]: '220ms' }}>
                <strong className="font-bold text-charcoal">{exec.name}</strong> leads St. Chris Global Limited: building materials, bathroom and kitchen solutions, interior finishing, procurement, importation and distribution, and the partnerships that tie them together.
              </p>
              <div className="rise mt-12 flex flex-wrap items-center gap-x-4 gap-y-4" style={{ ['--rise-delay' as string]: '320ms' }}>
                <Link href="/chris-iyoha" className="btn btn-dark !min-h-[3.4rem] !px-7 text-base">Meet {exec.name} <Icon name="arrow" size={18} /></Link>
                <Link href="/divisions" className="btn btn-outline !min-h-[3.4rem] !px-7 text-base">Our businesses</Link>
                <Link href="/request?service=materials-quotation" className="btn btn-ghost !min-h-[3.4rem] !px-1 text-base underline underline-offset-4">Request a quotation</Link>
              </div>
              <div className="rise mt-12" style={{ ['--rise-delay' as string]: '420ms' }}><PartnerBadge /></div>
            </div>
            <div className="lg:col-span-5">
              <div className="stage settle">
                <div className="stage-main frame-offset is-brand"><Photo name={exec.portraitKey || 'chris-portrait'} className="aspect-[4/5]" sizes="(min-width: 1024px) 30vw, 80vw" priority /></div>
                <div className="stage-inset"><Photo name="warehouse-pallets" className="aspect-square" sizes="(min-width: 1024px) 14vw, 38vw" /></div>
                <div className="plate">
                  <p className="serif text-[1.15rem] leading-tight">{exec.name}</p>
                  <p className="mt-2 text-[.72rem] leading-snug font-semibold tracking-wide text-steel uppercase">{exec.headline.split(' | ').join(' · ')}</p>
                </div>
              </div>
            </div>
          </div>
          <dl className="mt-24 md:mt-36 grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-4 border-t border-line pt-12">
            <R className="flex flex-col-reverse"><dt className="mt-2 text-sm text-steel">areas of business</dt><dd className="stat-num !text-[clamp(1.9rem,3.3vw,2.9rem)]">{divisions.length}</dd></R>
            <R delay={80} className="flex flex-col-reverse"><dt className="mt-2 text-sm text-steel">product categories</dt><dd className="stat-num !text-[clamp(1.9rem,3.3vw,2.9rem)]">{categories.length}</dd></R>
            {figures.slice(0, 1).map((f) => <R key={f.id} delay={160} className="flex flex-col-reverse"><dt className="mt-2 text-sm text-steel">{f.label}{!f.verified ? ' (per public company records)' : ''}</dt><dd className="stat-num !text-[clamp(1.9rem,3.3vw,2.9rem)]">{f.value}</dd></R>)}
            <R delay={240} className="flex flex-col-reverse"><dt className="mt-2 text-sm text-steel">major distributor and strategic partner of Africa&apos;s No. 1 water tank manufacturer</dt><dd className="stat-num !text-[clamp(1.9rem,3.3vw,2.9rem)]">GeePee</dd></R>
          </dl>
        </div>
      </section>

      {/* ── Strip of the six businesses ── */}
      <section className="bg-white marquee py-9 md:py-12" aria-label="Areas of business">
        <ul className="marquee-track">
          {[0, 1].map((k) => divisions.map((d) => <li key={`${k}-${d.id}`} aria-hidden={k === 1 ? 'true' : undefined} className="marquee-item serif">{d.name}</li>))}
        </ul>
      </section>

      {/* ── Strategic partnership: GeePee Water Tanks ── */}
      <section className="bg-white section overflow-hidden">
        <div className="container-x grid gap-16 lg:grid-cols-12 lg:gap-24 items-center">
          <div className="lg:col-span-6 order-2 lg:order-1">
            <R className="grid grid-cols-2 gap-4">
              <div className="row-span-2"><Photo name="tank-black-5" className="aspect-[3/4.4]" sizes="(min-width: 1024px) 20vw, 45vw" /></div>
              <Photo name="tank-blue" className="aspect-[4/3.1]" sizes="(min-width: 1024px) 20vw, 45vw" />
              <Photo name="tank-black-6" className="aspect-[4/3.1]" sizes="(min-width: 1024px) 20vw, 45vw" />
            </R>
          </div>
          <div className="lg:col-span-6 order-1 lg:order-2">
            <R><Marker n="01" label="Strategic partnership" /></R>
            <R className="mt-10"><h2>Major distributor of <em>{GEEPEE.name}</em></h2></R>
            <R delay={60}><p className="mt-5 font-bold text-[1.05rem] text-charcoal">{GEEPEE.claim}.</p></R>
            <R delay={100}><p className="lead-sans mt-5">St. Chris Global is a major distributor and strategic partner of {GEEPEE.name} ({GEEPEE.group}). Chris Iyoha&apos;s long-standing partnership with GeePee is built on trust, consistency and shared commercial goals, and it is how dealers, contractors, developers and households get dependable water storage.</p></R>
            <R delay={140}>
              <ul className="mt-12 grid gap-6 sm:grid-cols-3 text-sm">
                {[['Major distributor', 'Wholesale, dealer and project supply'], ['Strategic partner', 'A long-term relationship, not a one-off order'], ['In writing', 'Sizes, price and delivery in your quotation']].map(([t, d]) => (
                  <li key={t} className="border-t-2 border-brand pt-4"><p className="font-bold text-charcoal">{t}</p><p className="mt-1 text-steel leading-snug">{d}</p></li>
                ))}
              </ul>
            </R>
            <R delay={180} className="mt-12 flex flex-wrap gap-4">
              <Link href={GEEPEE.hub} className="btn btn-dark">The GeePee partnership <Icon name="arrow" size={18} /></Link>
              <Link href="/catalogue/water-storage-tanks" className="btn btn-outline">See the tank range</Link>
              <Link href="/services/dealer-partnership" className="btn btn-ghost !px-1 underline underline-offset-4">Become a dealer</Link>
            </R>
          </div>
        </div>
      </section>

      {/* ── Executive introduction ── */}
      <section className="bg-white section overflow-hidden">
        <div className="container-x grid gap-16 lg:grid-cols-12 lg:gap-24 items-center">
          <R className="lg:col-span-5">
            <div className="frame-offset"><Photo name="leadership-meeting" className="aspect-[4/5]" sizes="(min-width: 1024px) 38vw, 90vw" /></div>
            <p className="caption !mt-10">Training seasoned professionals, executives and emerging leaders is part of how {exec.name} builds.</p>
          </R>
          <div className="lg:col-span-7">
            <R><Marker n="02" label="The leader" /></R>
            <R className="mt-10"><h2>{exec.sections[0]?.title.split(' ').slice(0, -1).join(' ')} <em>{exec.sections[0]?.title.split(' ').slice(-1)}</em></h2></R>
            <R delay={80}><p className="lead-sans mt-8">{exec.sections[0]?.body}</p></R>
            <div className="mt-16 grid gap-12 sm:grid-cols-2">
              {exec.sections.slice(1, 3).map((x, i) => (
                <R key={x.id} delay={120 + i * 100}>
                  <div className="border-t border-line pt-6">
                    <h3 className="serif !text-[1.3rem] !leading-none">{x.title}</h3>
                    <p className="mt-3 text-steel leading-relaxed">{x.body}</p>
                  </div>
                </R>
              ))}
            </div>
            {exec.closing && <R delay={200}><p className="pullquote mt-16 max-w-xl">{exec.closing}</p></R>}
            <R delay={260} className="mt-12 flex flex-wrap gap-4">
              <Link href="/chris-iyoha" className="btn btn-dark">Read the executive profile <Icon name="arrow" size={18} /></Link>
              <Link href="/leadership" className="btn btn-outline">Leadership, career &amp; opportunities</Link>
            </R>
          </div>
        </div>
      </section>

      {/* ── Divisions ── */}
      <section className="bg-white section">
        <div className="container-x">
          <R><Marker n="03" label="Our businesses" /></R>
          <div className="mt-10 md:mt-14 mb-16 md:mb-24 grid gap-8 lg:grid-cols-12 lg:gap-x-20 lg:items-end">
            <R className="lg:col-span-7"><h2>Six areas of business, <em>one standard.</em></h2></R>
            <R delay={100} className="lg:col-span-5"><p className="lead-sans">From what goes into the walls to what hangs on them, and the sourcing, importation and partnerships behind it. Each has its own page, its own range and its own enquiry route.</p></R>
          </div>
          <ul className="grid gap-x-10 gap-y-20 md:grid-cols-2 lg:grid-cols-3">
            {divisions.map((d, i) => (
              <li key={d.id}>
                <R delay={(i % 3) * 100} className="h-full">
                  <Link href={`/divisions/${d.slug}`} className="div-card group">
                    <div className="div-photo"><Photo name={d.imageKey} className="aspect-[4/3]" sizes="(min-width: 1024px) 30vw, (min-width: 768px) 45vw, 100vw" /></div>
                    <p className="mt-8 text-xs font-bold tracking-[.18em] text-ember">0{i + 1}</p>
                    <h3 className="serif mt-3 text-[clamp(1.35rem,1.9vw,1.65rem)] leading-[1.15]">{d.name}</h3>
                    <p className="mt-4 text-[#3b3e44] leading-relaxed max-w-md">{d.summary}</p>
                    <p className="mt-auto pt-8"><span className="div-cue">Explore <Icon name="arrow" size={16} /></span></p>
                  </Link>
                </R>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── What working with St. Chris means ── */}
      <section className="bg-white section">
        <div className="container-x grid gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <R><Marker n="04" label="The value" /></R>
            <R className="mt-10"><h2>What working with St. Chris <em>means.</em></h2></R>
            <R delay={100}><p className="lead-sans mt-8">Whether you are building one bathroom or supplying a development, you deal with a team that puts things in writing and finishes what it starts.</p></R>
            <R delay={160} className="mt-9"><Link href="/how-it-works" className="btn btn-primary">See how a quotation works <Icon name="arrow" size={18} /></Link></R>
          </div>
          <ol className="lg:col-span-7 grid gap-x-14 gap-y-16 sm:grid-cols-2">
            {VALUE.map((v, i) => (
              <li key={v.t}>
                <R delay={i * 90}>
                  <div className="border-t border-line pt-8">
                    <span className="stat-num !text-[3.2rem]" aria-hidden="true">0{i + 1}</span>
                    <h3 className="mt-4 !text-[1.2rem]">{v.t}</h3>
                    <p className="mt-3 text-[#3b3e44] leading-relaxed">{v.d}</p>
                  </div>
                </R>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Who we supply ── */}
      <section className="bg-white section">
        <div className="container-x">
          <R><Marker n="05" label="Who we supply" /></R>
          <div className="mt-10 md:mt-14 mb-16 md:mb-24 grid gap-8 lg:grid-cols-12 lg:gap-x-20 lg:items-end">
            <R className="lg:col-span-7"><h2>Built for the people <em>who build.</em></h2></R>
            <R delay={100} className="lg:col-span-5"><p className="lead-sans">From a single bathroom to a development, the route in is the same: tell us what you need, and we reply in writing.</p></R>
          </div>
          <ul className="grid grid-cols-2 gap-x-5 gap-y-14 lg:grid-cols-4 lg:gap-x-10">
            {WHO.map((w, i) => (
              <li key={w.t}>
                <R delay={i * 80}>
                  <Link href={w.href} className="group ed-card">
                    <Photo name={w.photo} className="aspect-[4/5]" sizes="(min-width: 1024px) 22vw, 46vw" />
                    <h3 className="mt-5">{w.t}</h3>
                    <p className="mt-2 text-sm text-steel leading-snug">{w.d}</p>
                  </Link>
                </R>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Insights ── */}
      <section className="bg-white section">
        <div className="container-x">
          <R><Marker n="06" label="Insights" /></R>
          <div className="mt-10 md:mt-14 mb-16 md:mb-24 grid gap-8 lg:grid-cols-12 lg:gap-x-20 lg:items-end">
            <R className="lg:col-span-7"><h2>Ideas on leadership, <em>enterprise and partnership.</em></h2></R>
            <R delay={100} className="lg:col-span-5"><p className="lead-sans">Writing from {exec.name} on leading people, building businesses and making partnerships last.</p><p className="mt-4"><Link href="/journal" className="link-arrow">Open the journal <Icon name="arrow" size={18} /></Link></p></R>
          </div>
          {latest.items.length > 0 ? (
            <div className="grid gap-x-10 gap-y-14 lg:grid-cols-12">
              <R className="lg:col-span-7"><ArticleCard a={latest.items[0]!} large /></R>
              <div className="lg:col-span-5 grid gap-12">{latest.items.slice(1).map((a, i) => <R key={a.id} delay={(i + 1) * 100}><ArticleCard a={a} /></R>)}</div>
            </div>
          ) : (
            <>
              <ul className="grid gap-px bg-line border border-line sm:grid-cols-2 lg:grid-cols-4">
                {jcats.map((c, i) => (
                  <li key={c.id} className="bg-white">
                    <Link href={`/journal/category/${c.slug}`} className="group ed-card h-full p-7 flex flex-col min-h-[13rem]">
                      <span className="text-xs font-bold tracking-[.18em] text-ember">0{i + 1}</span>
                      <h3 className="mt-5 flex-1">{c.name}</h3>
                      <p className="mt-3 text-sm text-steel leading-snug">{c.description}</p>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm text-steel">Articles appear here as they are published.</p>
            </>
          )}
        </div>
      </section>

      {/* ── The Materials Desk ── */}
      <section className="bg-white section">
        <div className="container-x grid gap-14 lg:grid-cols-[1.1fr_1fr] lg:gap-20 items-start">
          <div>
            <R><Marker n="07" label="The Materials Desk" /></R>
            <R className="mt-10"><h2>Build your list. <em>Get a written quote.</em></h2></R>
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
        <div className="container-x mt-28">
          <ol className="grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.t}>
                <R delay={i * 90}>
                  <div className="border-t-2 border-brand pt-6">
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
        <Band n="08" marker="Products" title={<>Ready to add <em>to your list.</em></>}>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{featured.map((p) => <li key={p.id}><ProductCard p={p} /></li>)}</ul>
          <p className="mt-8 text-sm text-steel max-w-xl">Product listings grow as we confirm models and sizes with our suppliers. If you need something that is not here, <Link href="/services/source-a-product">we will source it</Link>.</p>
        </Band>
      )}

      {/* ── Three ways in ── */}
      <Band n="09" marker="Opportunities" tone="white" title={<>Three ways to <em>work with us.</em></>}>
        <ul className="grid gap-px bg-line border border-line md:grid-cols-3">
          {PATHS.map((p, i) => (
            <li key={p.n} className="bg-white flex">
              <R delay={i * 100} className="flex w-full">
                <Link href={p.href} className="group ed-card w-full p-8 md:p-10 flex flex-col">
                  <span className="mono text-sm text-ember">{p.n}</span>
                  <h3 className="mt-6">{p.t}</h3>
                  <p className="mt-4 text-steel flex-1">{p.d}</p>
                  <span className="mt-8 inline-flex items-center gap-2 font-display font-semibold text-ember">{p.cta} <Icon name="arrow" size={18} /></span>
                </Link>
              </R>
            </li>
          ))}
        </ul>
      </Band>

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
